import { randomUUID } from "node:crypto";
import { waitForApproval } from "../office/approval-waiters.js";
import { allowAlways, isAlwaysAllowed } from "../office/chat-permissions.js";
import { toolGroupOf, toolsInGroup } from "../security/index.js";
import { describeToolCall } from "../office/tool-language.js";
import { buildSecurityBundle, getComputerUseConfig } from "../office/config.js";
import { performance } from "node:perf_hooks";
import {
  isBusy,
  redrobAvailableFromEnv,
  resolveInferenceRoute,
  type LlmProviderSecrets,
} from "@redrob/kernel";
import { loadSetupState } from "./setup.js";
import { hostGetPlan, localTurnReady } from "./inference-host.js";
import { getFloor } from "./floor.js";
import { runTask, type TaskInferenceProvider } from "../office/runtime.js";
import { policyForStaff } from "../office/tasks/executor.js";
import {
  specFromTeamMember,
  toolsForPermission,
  type ToolPermission,
} from "../office/staff/team-members.js";
import { appendAudit } from "../audit/tool-audit.js";
import type { Task } from "../office/tasks/types.js";
import { APPROVAL_TRAY_HALT_THRESHOLD } from "../office/approvals/tray.js";

/**
 * Refused because the tray is full. Not an error in the request — the caller
 * should clear approvals and try again.
 */
export class ApprovalBacklogError extends Error {
  readonly pending: number;
  constructor(pending: number) {
    super(
      `Approval tray has ${pending} pending items (limit ${APPROVAL_TRAY_HALT_THRESHOLD}). ` +
        "Clear the tray before starting new work.",
    );
    this.name = "ApprovalBacklogError";
    this.pending = pending;
  }
}

export interface ComputerUseOutcome {
  text: string;
  iterations: number;
  timingMs: number;
  modelId: string;
  taskId: string;
  traceId: string;
  /** Set when the run stopped because a tool needs a human. */
  awaitingApproval: boolean;
  /** Screenshots and recordings this run produced, oldest first. */
  media: Array<{ path: string; kind: "image" | "video"; tool: string }>;
  /** Documents this run created, oldest first. */
  artifactIds: string[];
  /**
   * Answers to offer as one click, when the run ended by asking something
   * rather than by doing it — "which of these people did you mean".
   */
  options?: string[];
  /** Set when the machine cannot look at the screen (panic stop / unsupported). */
  desktopBlocked?: "stopped" | "unsupported";
  /** Settings was off and this run turned desktop control on. */
  desktopJustEnabled?: boolean;
}

/**
 * Run one ad-hoc Task from the chat box.
 *
 * Approvals are queued in the tray, never awaited: if a tool needs a human the
 * run checkpoints and returns, and the caller is free to start something else.
 * Progress is written to the audit log; nothing here reaches the renderer.
 */
/**
 * How long a run waits on a person before letting go. Long enough to walk over
 * and read what is being asked; short enough that a forgotten card does not
 * hold a task, and its model context, open all afternoon.
 */
const APPROVAL_WAIT_MS = 10 * 60_000;

/**
 * Room to recover, not room to wander.
 *
 * Driving an app is look, act, look again, and a run that has to back out of
 * the wrong conversation and search again spends a dozen steps before it types
 * a word. The general ceiling cuts those off mid-recovery, which reads as the
 * assistant giving up on a task it was two clicks from finishing.
 */
const DESKTOP_MAX_ITERATIONS = 36;

export async function runComputerUseTask(input: {
  userData: string;
  text: string;
  maxIterations?: number;
  signal?: AbortSignal;
  /** Which conversation this belongs to; standing permissions are per chat. */
  chatId?: string;
  /** What was said just before, so "이거 슬랙으로 보내줘" has an "이거". */
  history?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  /** Called when a step needs a person, so the chat can ask them there. */
  onApprovalRequest?: (request: {
    callId: string;
    tool: string;
    title: string;
    detail: string;
    risk: string;
  }) => void;
  /** Called when a step produced something to look at. */
  onMedia?: (media: {
    path: string;
    kind: "image" | "video";
    tool: string;
  }) => void;
  /** Called when a step created a document, so the app can open it. */
  onArtifact?: (item: { artifactId: string; tool: string }) => void;
  /**
   * A generic independent agent. Its identity is only for audit/progress; its
   * permission is the concrete tool subset that makes this run different.
   */
  agent?: {
    id: string;
    permission: ToolPermission;
    /**
     * The containing high-risk call already showed the complete assignment and
     * access level to the person. Used only by agents.delegate.
     */
    preapproved?: boolean;
  };
}): Promise<ComputerUseOutcome> {
  const setup = await loadSetupState(input.userData);
  // "Check my calendar in Chrome" is the consent. Settings defaults to off, so
  // turn control on before the model invents an apology about capture.
  const usesDesktop = !input.agent || input.agent.permission === "full";
  const { enableDesktopControlForRequestedWork } = await import("../desktop/index.js");
  const desktopGate = usesDesktop
    ? await enableDesktopControlForRequestedWork()
    : { ok: true as const, justEnabled: false };
  if (!desktopGate.ok) {
    return {
      text: "",
      iterations: 0,
      timingMs: 0,
      modelId: "",
      taskId: "",
      traceId: "",
      awaitingApproval: false,
      media: [],
      artifactIds: [],
      desktopBlocked:
        desktopGate.state === "stopped" ? "stopped" : "unsupported",
    };
  }

  const { desktopControl } = await getComputerUseConfig();
  const providers = (setup.llmProviders ?? {}) as LlmProviderSecrets;
  const mode = setup.inferenceRoute ?? "auto";
  let localAvailable = false;
  try {
    localAvailable = Boolean((await hostGetPlan()).modelPath);
  } catch {
    localAvailable = false;
  }

  // Local first when weights are present — same rule as the Floor binder.
  let provider: TaskInferenceProvider;
  let model: string;
  let thinking: boolean;
  if (localAvailable && (mode === "auto" || mode === "local")) {
    provider = "local";
    model = "local";
    // Off on device. The reasoning pass is what the cloud sells and what a GGUF
    // spends the whole token budget on.
    thinking = false;
  } else {
    const route = resolveInferenceRoute({
      mode,
      providers,
      localAvailable,
      redrobAvailable: redrobAvailableFromEnv(),
      workload: { kind: "chat", text: input.text },
      // Screenshots are the only way this work knows where anything is, so a
      // text-only model would be guessing rather than looking.
      needsVision: usesDesktop && desktopControl,
    });
    if (route.provider === "redrob_remote") {
      throw new Error(
        "Computer use needs a local model or a Redrob API key from console.redrob.ai.",
      );
    }
    provider = route.provider === "local" ? "local" : route.provider;
    model = route.model;
    thinking = Boolean(route.thinking);
  }

  // Same gate as chat and the Floor: a local route has to have loaded weights
  // behind it, or the run dies mid-step on a server that is not up.
  if (provider === "local") {
    const ready = await localTurnReady();
    if (!ready.ok) throw new Error(ready.reason);
  }

  const office = await getFloor();

  // Hard cap: past the limit the office stops accepting work. Not a setting.
  const pending = office.tray.pendingCount();
  if (pending > APPROVAL_TRAY_HALT_THRESHOLD) {
    await appendAudit({
      clock: office.clock,
      kind: "policy_deny",
      event: "task.rejected",
      resultSummary: `Refused: ${pending} pending approvals exceeds the limit of ${APPROVAL_TRAY_HALT_THRESHOLD}`,
      scope: { at: office.clock.now() },
    });
    throw new ApprovalBacklogError(pending);
  }

  const chatId = input.chatId?.trim() || "chat";
  const traceId = randomUUID();
  const taskId = randomUUID();
  const task: Task = {
    taskId,
    traceId,
    staffMemberId: input.agent?.id ?? "human:chat",
    spec: {
      templateId: "office/adhoc",
      title: input.text.slice(0, 120),
      instruction: input.text,
    },
    budget: { tokens: 200_000, costMicros: 0 },
    notBefore: office.clock.now(),
  };

  let awaitingApproval = false;
  const media: Array<{ path: string; kind: "image" | "video"; tool: string }> =
    [];
  const artifacts: string[] = [];
  let options: string[] = [];
  const started = performance.now();
  const systemExtra = input.agent
    ? [
        [
          `You are ${input.agent.id}, one independent agent among several running in parallel.`,
          `Your access level is ${input.agent.permission}; your available tools are: ${toolsForPermission(input.agent.permission).join(", ")}.`,
          "There are no job titles or fixed roles. Complete only the self-contained task you were given.",
          "Do not claim another agent checked, approved, managed, or wrote anything.",
          "End with the result and where any files you created can be found.",
        ].join(" "),
      ]
    : undefined;
  const agentPolicy = input.agent
    ? policyForStaff(
        await buildSecurityBundle(),
        specFromTeamMember(
          {
            id: input.agent.id,
            name: input.agent.id,
            persona: "",
            toneHints: "",
            permission: input.agent.permission,
            createdAt: office.clock.now(),
            updatedAt: office.clock.now(),
            builtin: false,
            active: true,
          },
          [],
        ),
      )
    : undefined;
  const result = await runTask({
    task,
    providers,
    provider,
    model,
    thinking,
    userDataPath: input.userData,
    clock: office.clock,
    scope: { at: office.clock.now() },
    ...(systemExtra ? { systemExtra } : {}),
    ...(agentPolicy ? { policy: agentPolicy } : {}),
    ...(input.history?.length ? { history: input.history } : {}),
    maxIterations: input.maxIterations ?? DESKTOP_MAX_ITERATIONS,
    ...(input.signal ? { signal: input.signal } : {}),
    onEvent: (event) => {
      if (event.kind === "done") {
        options = event.options ?? [];
        return;
      }
      if (event.kind !== "tool_result") return;
      if (event.artifactId) {
        artifacts.push(event.artifactId);
        input.onArtifact?.({ artifactId: event.artifactId, tool: event.name });
      }
      if (!event.media) return;
      const item = { ...event.media, tool: event.name };
      media.push(item);
      input.onMedia?.(item);
    },
    requestApproval: async (request) => {
      // agents.delegate is itself a high-risk tool. Its approval card contains
      // every task and access level, so the child loop does not ask the same
      // question again for every write, shell call or click.
      if (input.agent?.preapproved) return "allow_session";
      // Already answered for good in this conversation (survives restart).
      if (isAlwaysAllowed(chatId, request.name)) return "allow_session";
      // Or answered for the neighbouring tool, which is the same act: saying
      // yes to input.click and then being asked again for input.type is the
      // same question wearing a different name.
      if (
        toolsInGroup(toolGroupOf(request.name)).some((name) =>
          isAlwaysAllowed(chatId, name),
        )
      ) {
        return "allow_session";
      }

      awaitingApproval = true;
      const sentence = describeToolCall(request.name, request.args);
      // Asked where the person is. This used to go to the approval tray in the
      // Office, which meant being sent to another room to answer a question
      // about the conversation you were already in.
      input.onApprovalRequest?.({
        callId: request.callId,
        tool: request.name,
        title: sentence.title,
        detail: sentence.detail,
        risk: request.risk,
      });
      // Hold the run open for the answer.
      //
      // A Floor task can afford to give up here, because it is persisted and
      // approving one re-queues it. This run only exists as the promise we are
      // inside, so returning early threw the work away: the person approved,
      // and nothing happened. Waiting is what makes the tray mean anything for
      // a chat task, and every way out of it — yes, no, nobody, abort — comes
      // back as a decision the loop already knows how to handle.
      const outcome = await waitForApproval(request.callId, {
        timeoutMs: APPROVAL_WAIT_MS,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      if (outcome === "approved_always") {
        awaitingApproval = false;
        allowAlways(chatId, request.name);
        // Runtime only seeds its in-run cache on allow_session — allow_once
        // would ask again on the next tool in the same turn.
        return "allow_session";
      }
      if (outcome === "approved") {
        awaitingApproval = false;
        return "allow_once";
      }
      if (outcome === "rejected") return "deny";
      // Nobody answered, or the run was stopped. The tray card stays where it
      // is; what ends is this run's willingness to sit on it.
      return "defer";
    },
  }).catch((error: unknown) => {
    // A busy shared pool is not a fault the person can act on, and raw
    // "Error invoking remote method 'office:runTask'" is not an answer.
    const message = error instanceof Error ? error.message : String(error);
    if (!isBusy(message)) throw error;
    const korean = /[가-힣]/.test(input.text);
    return {
      text: korean
        ? "지금 모델 쪽이 혼잡해서 실행하지 못했습니다. 잠시 후에 다시 시켜주세요."
        : "The model provider is busy right now, so nothing was done. Try again in a moment.",
      iterations: 0,
    };
  });

  return {
    text: result.text,
    iterations: result.iterations,
    media,
    artifactIds: artifacts,
    timingMs: performance.now() - started,
    modelId: `${provider}:${model}`,
    taskId,
    traceId,
    awaitingApproval,
    ...(options.length > 0 ? { options } : {}),
    ...(desktopGate.justEnabled ? { desktopJustEnabled: true as const } : {}),
  };
}
