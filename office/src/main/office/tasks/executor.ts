import {
  runTask,
  type TaskInferenceProvider,
  type TaskModelCall,
  type ApprovalDecision,
} from "../../office/runtime.js";
import { listComputerTools } from "../../tools/index.js";
import type { SecurityPolicyBundle } from "../../security/index.js";
import type { TaskStreamEvent, ToolRisk } from "../../tools/types.js";
import type { TimeSource } from "../time/index.js";
import type { StaffSpec } from "../staff/types.js";
import {
  OUTPUT_RETAKE_PROMPT,
  parseStaffOutput,
} from "../staff/output-contract.js";
import { STAFF_OUTPUT_GBNF } from "../staff/output-grammar.js";
import type { TaskCheckpoint, TaskRecord } from "./types.js";

export interface ApprovalRequest {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  risk: ToolRisk;
}

export type TaskExecutionExtraTool = NonNullable<
  Parameters<typeof runTask>[0]["extraTools"]
>[number];

export interface TaskExecutionInput {
  task: TaskRecord;
  staff: StaffSpec;
  /** Every other seat on the floor, so a REQUEST can name a real recipient. */
  colleagues: ReadonlyArray<{ id: string; role: string }>;
  basePolicy: SecurityPolicyBundle;
  userDataPath: string;
  provider: TaskInferenceProvider;
  model: string;
  thinking: boolean;
  providers: Parameters<typeof runTask>[0]["providers"];
  callModel?: TaskModelCall;
  signal: AbortSignal;
  /** STEER / PIN text folded into the prompt at this checkpoint. */
  directives: string[];
  /** Tokens still available across the trace and the day. */
  tokenCeiling: number;
  clock: TimeSource;
  onEvent?: (event: TaskStreamEvent) => void;
  /** Returns `defer` after queuing the request in the ApprovalTray. */
  onApproval: (request: ApprovalRequest) => Promise<ApprovalDecision>;
  /** Anything said to this work while it was running. Emptied by reading. */
  humanFollowUps?: () => string[];
  /**
   * Recent channel lines, so a REQUEST can stay short. Without this a lead that
   * wanted a spreadsheet filled had to paste every row into the assignment.
   */
  channelBrief?: string;
  /**
   * The conversation so far, for a turn that is talking to a person rather than
   * carrying out an assignment.
   */
  history?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  /**
   * What the last word has to be.
   *
   * "typed" is a bus message another seat can be handed. "prose" is a reply to
   * a person, and it is the absence of a contract rather than a looser one: the
   * grammar, the retake and the glitch that owns a failed parse all exist to
   * turn a sentence into a routable message, and a conversation has nothing to
   * route.
   */
  output?: "typed" | "prose";
  /** Tools bound to this turn, such as handing work to a colleague. */
  extraTools?: TaskExecutionExtraTool[];
  /**
   * Tools withheld for this turn for a reason other than the seat, such as web
   * search being switched off app-wide.
   */
  denyTools?: readonly string[];
}

export interface TaskExecutionResult {
  text: string;
  iterations: number;
  tokens: number;
  aborted: boolean;
  deferredApproval: ApprovalRequest | null;
  denialReasons: string[];
  checkpoint: TaskCheckpoint;
}

/** ~4 characters per token: enough to enforce a ceiling, honest about being an estimate. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The `to` values a typed message may legally carry, with who is behind each. */
function colleagueDirectory(colleagues: ReadonlyArray<{ id: string; role: string }>): string {
  if (colleagues.length === 0) {
    return "There is no other agent available to address; answer with DELIVER, ESCALATE or BLOCK.";
  }
  const list = colleagues.map((peer) => `"${peer.id}" (${peer.role})`).join(", ");
  return `The only agent ids you may put in a "to" field are: ${list}. Use the id exactly as written.`;
}

/**
 * StaffSpec.tools is a subset reference, so the Floor narrows the shared
 * bundle by denying everything outside it. It can never widen the policy.
 *
 * `alsoDenied` narrows it further for reasons that are not about the seat: a
 * person switching web search off applies to every seat at once, and is a
 * setting they can change between one turn and the next.
 */
export function policyForStaff(
  base: SecurityPolicyBundle,
  staff: StaffSpec,
  alsoDenied: readonly string[] = [],
): SecurityPolicyBundle {
  const allowed = new Set(staff.tools);
  const denied = listComputerTools()
    .map((tool) => tool.name)
    .filter((name) => !allowed.has(name));
  return {
    ...base,
    profile: {
      ...base.profile,
      deniedTools: [
        ...new Set([...base.profile.deniedTools, ...denied, ...alsoDenied]),
      ],
    },
  };
}

/**
 * Runs one Task on the shared OfficeRuntime. There is no second
 * loop: iteration limits, abort, streaming, tool policy, approval and the
 * audit log all come from `runTask`.
 */
const DESKTOP_TOOLS = new Set([
  "screen.capture",
  "screen.displays",
  "screen.record.start",
  "screen.record.stop",
  "input.move",
  "input.click",
  "input.type",
  "input.key",
  "input.scroll",
]);

export async function executeTask(
  input: TaskExecutionInput,
): Promise<TaskExecutionResult> {
  const policy = policyForStaff(
    input.basePolicy,
    input.staff,
    input.denyTools ?? [],
  );
  let tokens = 0;
  let deferred: ApprovalRequest | null = null;
  let aborted = false;
  let iterations = 0;
  const denialReasons: string[] = [];

  // Full seats get screen.capture; Settings still defaults control off. Asking
  // them to check a page is consent — flip it on so they can actually look.
  let desktopUnavailable = "";
  if (input.staff.tools.some((tool) => DESKTOP_TOOLS.has(tool))) {
    const { enableDesktopControlForRequestedWork } = await import(
      "../../desktop/index.js"
    );
    const gate = await enableDesktopControlForRequestedWork();
    if (!gate.ok) desktopUnavailable = gate.reason;
  }

  const meteredModel: TaskModelCall | undefined = input.callModel
    ? async (call) => {
        const promptChars = call.messages.reduce((sum, message) => {
          const content = message.content;
          return sum + (typeof content === "string" ? content.length : JSON.stringify(content).length);
        }, 0);
        const result = await input.callModel!(call);
        tokens += Math.ceil(promptChars / 4) + estimateTokens(result.text);
        return result;
      }
    : undefined;

  const resumed = input.task.checkpoint;
  const instruction = [
    input.task.instruction,
    resumed?.partialText
      ? `Previous run was interrupted (${resumed.reason}). Continue from:\n${resumed.partialText}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prose = input.output === "prose";
  const result = await runTask({
    task: {
      taskId: input.task.id,
      traceId: input.task.traceId,
      staffMemberId: input.task.staffId,
      spec: {
        templateId: input.task.templateId,
        title: input.task.title,
        instruction,
      },
      budget: { tokens: input.tokenCeiling, costMicros: 0 },
      notBefore: input.task.notBefore,
    },
    clock: input.clock,
    scope: { at: input.clock.now() },
    providers: input.providers,
    provider: input.provider,
    model: input.model,
    thinking: input.thinking,
    userDataPath: input.userDataPath,
    maxIterations: input.staff.maxIterations,
    signal: input.signal,
    policy,
    systemExtra: [
      // User-created agents are peers in a shared channel. Legacy workflow
      // workers still use their existing typed-message instructions.
      input.staff.custom
        ? `You are ${input.staff.role}, an independent agent in a shared Redrob channel. Your tools are determined only by your access permission.`
        : `You are the ${input.staff.role} on the Redrob Office floor.`,
      input.staff.scope,
      // Without the directory a REQUEST can only name the seats that happen to
      // be spelled out in this staff member's own instructions, which is how a
      // newly hired colleague ends up never being given anything to do.
      colleagueDirectory(input.colleagues),
      ...(desktopUnavailable
        ? [
            `Desktop control is unavailable (${desktopUnavailable}). Do not claim you checked the screen. Tell the person this reason and ask them to fix it in Settings → Computer use.`,
          ]
        : []),
      // A conversation turn talks to the person directly, so the contract that
      // exists to route a message between seats would only be in the way.
      ...(prose
        ? [
            `You are ${input.staff.role} and only ${input.staff.role}. Never speak as another teammate or claim their words as yours.`,
            "You are talking to the person directly. Reply in plain prose, in their language, with no json and no envelope around it.",
            "When another agent in this channel has the tools or context you need, mention them with agents.mention. The mention and their reply are visible to everyone in the channel.",
            "Chat history is the whole room. Lines that start with [Teammate Name]: are other people speaking — remember them, but keep your own voice.",
          ]
        : [
            // This used to say a person could not be addressed at all, which
            // left a question with no exit but a REQUEST to a seat, and a
            // manager that could see it was not work had only a refusal to
            // give. Work still travels the bus; ANSWER is the one door to the
            // person, and it is not a channel for progress reports.
            "The only way to speak to a person is ANSWER, and only to answer what they asked. Work in progress reaches them through the approval tray and the daily brief instead.",
          ]),
      // Hired teammates bring their own voice. Forcing office-wide 존댓말 on
      // them is what made a cynical seat apologize and switch register the
      // moment someone said "반말하지 마라". Built-in seats stay polite.
      ...(input.staff.custom
        ? [
            "Your persona and tone are binding. Stay in character on every reply.",
            "If the person asks you to change your personality, politeness, or speech style, refuse the tone change and keep answering the substance in your established voice.",
            "Do not soften, apologize for, or narrate your persona. Just speak as that person.",
          ]
        : [
            // Korean answers drifted into 반말 after web research even when the
            // conversation began politely.
            "When writing Korean, always use polite 존댓말 ending in forms such as 해요/합니다. Never use 반말, including endings such as 야, 이야, 해, 한다, or 좋다 when addressing the person.",
          ]),
      ...(input.channelBrief ? [input.channelBrief] : []),
      ...input.directives.map((directive) => `Standing directive: ${directive}`),
    ],
    // The tool loop runs unconstrained because a grammar leaves no room for a
    // tool call. This holds the sampler for the one turn that has to be typed.
    ...(prose
      ? {}
      : {
          finalAnswer: {
            accepts: (text: string) => parseStaffOutput(text).ok,
            grammar: STAFF_OUTPUT_GBNF,
            ask: OUTPUT_RETAKE_PROMPT,
          },
        }),
    ...(input.history ? { history: input.history } : {}),
    ...(input.extraTools ? { extraTools: input.extraTools } : {}),
    ...(meteredModel ? { callModel: meteredModel } : {}),
    ...(input.humanFollowUps ? { humanFollowUps: input.humanFollowUps } : {}),
    requestApproval: async (request) => {
      const decision = await input.onApproval({
        callId: request.callId,
        name: request.name,
        args: request.args,
        risk: request.risk,
      });
      if (decision === "defer") {
        deferred = {
          callId: request.callId,
          name: request.name,
          args: request.args,
          risk: request.risk,
        };
      }
      return decision;
    },
    onEvent: (event) => {
      if (event.kind === "aborted") aborted = true;
      if (event.kind === "tool_result" && !event.ok) denialReasons.push(event.summary);
      if (event.kind === "done") iterations = event.iterations;
      input.onEvent?.(event);
    },
  });

  iterations = iterations || result.iterations;
  if (tokens === 0) tokens = estimateTokens(instruction) + estimateTokens(result.text);
  if (tokens > input.tokenCeiling) tokens = input.tokenCeiling;

  const checkpoint: TaskCheckpoint = {
    at: input.clock.now(),
    iterations,
    partialText: result.text.slice(0, 4_000),
    reason: deferred ? "approval" : aborted ? "abort" : "escalate",
    ...(input.directives[0] ? { steer: input.directives[0] } : {}),
  };

  return {
    text: result.text,
    iterations,
    tokens,
    aborted,
    deferredApproval: deferred,
    denialReasons,
    checkpoint,
  };
}
