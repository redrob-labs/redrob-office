import { readFile } from "node:fs/promises";
import {
  generateCloudChatWithFallback,
  modelNeedsThinking,
  redrobAvailableFromEnv,
  resolveInferenceRoute,
  type CloudChatContentPart,
  type CloudChatMessage,
  type CloudProviderId,
  type CloudToolCall,
  type CloudToolDefinition,
  type InferenceRouteMode,
  type LlmProviderSecrets,
  type ChatMessage as LocalChatMessage,
} from "@redrob/kernel";
import { listMemories, type Store } from "@redrob/store";
import { nowMs } from "../app-time.js";
import {
  hostGenerateChat,
  hostGenerateChatWithTools,
  hostGetPlan,
  localTurnReady,
} from "./inference-host.js";
import { loadSetupState } from "./setup.js";
import { artifactsDirPath } from "./artifacts.js";
import { listWorkflows } from "./workflow.js";
import { formatFlowsBlock } from "./workflow-prompt.js";
import { redrobCodeUnavailableMessage } from "../redrob-code/steering.js";
import { capabilitySentence } from "../../shared/capability-sentence.js";
import {
  computerToolsAsCloudDefinitions,
  executeComputerTool,
  getComputerTool,
} from "../tools/registry.js";
import type { ToolResult } from "../tools/types.js";
import { buildSecurityBundle, getComputerUseConfig } from "../office/config.js";
import {
  DOC_WRITE_TOOLS,
  evaluateToolPolicy,
  toolGroupOf,
  toolsInGroup,
} from "../security/index.js";
import {
  scrubModelOutputForUi,
  wrapExternalUntrustedContent,
} from "../security/untrusted.js";
import type {
  CanonicalExecPlan,
  ExecAskMode,
  ExecSecurityMode,
  SecurityPolicyBundle,
} from "../security/types.js";
import { waitForApproval } from "../office/approval-waiters.js";
import { allowAlways, isAlwaysAllowed } from "../office/chat-permissions.js";
import { describeToolCall } from "../office/tool-language.js";
import { randomUUID } from "node:crypto";
import { formatWebSearchContext, runWebSearch, type WebSearchHit } from "./web-search.js";
import {
  getRedrobCodeEngine,
  redrobCodeEngineAvailable,
} from "../redrob-code/engine.js";
import { DEFAULT_MODEL } from "../redrob-code/session.js";
import {
  isUpstreamModelFailure,
  TurnError as EngineTurnError,
  turnRanOutOfTimeMessage,
  upstreamThrottleMessage,
  workDoneBeforeGivingUp,
} from "../redrob-code/turn-errors.js";
import {
  isOutOfCredit,
  noteCreditSpent,
  noteOutOfCredit,
  outOfCreditMessage,
} from "./redrob-credit.js";

/** Diagnostics for the engine sidecar; it runs out of process. */
function log(line: string): void {
  console.info(line);
}

/**
 * Thread-title pass from `maybeAutotitleSession`.
 *
 * Naming must not inherit the chat agent tool surface. With tools offered, the
 * Gateway model reads the transcript as a fresh task and re-runs it (second
 * Mousepad launch, second approval), while the real chat turn already settled
 * on an incomplete "I will now verify…" reply — so the UI looks stuck Thinking.
 */
export function isChatTitleSession(sessionId: string | undefined): boolean {
  return typeof sessionId === "string" && sessionId.endsWith(":title");
}

/** Caller's system messages only — no TOOL_HONESTY that insists on tool calls. */
export function titleSystemPrompt(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** ISO-8601 when the message was sent (client clock). */
  at?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  sessionId?: string;
  resetSession?: boolean;
  /**
   * Per-turn untrusted context (web results) for local / pre-search paths.
   */
  contextBlock?: string;
  /** Allow the cloud model to call web_search via tool calling. */
  enableWebSearch?: boolean;
  /**
   * Pictures attached to this turn, staged on disk. Sending one steers the route
   * to a model that can see, because the cheap default on some providers takes
   * text only and answers about a picture it was never shown.
   */
  images?: Array<{ path: string; mime: string }>;
  locale?: "en" | "ko";
  clientNowIso?: string;
  timeZone?: string;
}

export interface ChatWebSearchRecord {
  query: string;
  results: WebSearchHit[];
  blocked?: boolean;
}

export interface ChatResult {
  text: string;
  timingMs: number;
  modelId: string;
  rePrefill?: boolean;
  backend?: string;
  /** True when the provider thinking path was used. */
  thinking?: boolean;
  /** Provider chain-of-thought text when exposed. */
  reasoning?: string;
  webSearches?: ChatWebSearchRecord[];
  /** The assistant changed app settings via a tool this turn; refresh the UI. */
  settingsChanged?: boolean;
  /** Screenshots/files a tool produced this turn, to show in the chat bubble. */
  media?: Array<{ path: string; kind: "image" | "video" }>;
  /**
   * The console refused this turn because the workspace is out of credit. Set
   * only when the console said so, and it is what opens the pay sheet.
   */
  outOfCredit?: boolean;
}

export type ChatToolProgressEvent =
  | {
      kind: "tool";
      name: "web_search";
      status: "start";
      query: string;
    }
  | {
      kind: "tool";
      name: "web_search";
      status: "done";
      query: string;
      resultCount: number;
      blocked?: boolean;
      results: WebSearchHit[];
    }
  /** A generic tool step (any registry tool the chat agent runs), for live UI. */
  | {
      kind: "step";
      name: string;
      status: "start" | "done";
      label: string;
      /** Present-tense sentence for a live step (OpenWork-style). */
      present?: string;
      /** Past-tense sentence, once the step returned. */
      past?: string;
      /** A step nested under another, e.g. a flow's own progress lines. */
      nested?: boolean;
      /** Ground truth from the registry, present when a completed step returned. */
      ok?: boolean;
    };

const MEMORY_PROMPT_LIMIT = 20;

/**
 * A cloud model named from outside, instead of the cheap default.
 *
 * Which model is cheapest for the quality is a question with a moving answer,
 * and it was settled by a constant in the kernel — so comparing a candidate
 * meant editing the table and rebuilding. Naming it here lets a run be pointed
 * at any provider slug and, more to the point, lets the result be measured
 * before the default is changed for everyone.
 */
function cloudModelOverride(): string {
  return (process.env["REDROB_CLOUD_MODEL"] ?? "").trim();
}

export const DEFAULT_CHAT_MAX_TOKENS = 3072;
// Real tasks chain several calls (search → read, or remember → then answer).
// Three was too shallow to be agentic; the final no-tool round after the loop
// still guarantees a closing answer.
const MAX_TOOL_ROUNDS = 8;

const SHORT_ANSWER_SYSTEM =
  "Be clear and useful. Prefer concise answers for simple questions; go longer when the user asks for drafts, lists, or detail.";

/** The one signal we trust for output language: Hangul in the user's words. */
function detectReplyLanguage(text: string): "Korean" | "English" {
  return /[\uAC00-\uD7A3]/.test(text) ? "Korean" : "English";
}

/**
 * A concrete, named-language instruction beats a generic "match the user".
 *
 * gemini-flash drifts to Korean under this app's Korean-heavy system prompt and
 * Korean tool results unless the target language is named outright and sits near
 * the end of what the model reads. So this string is both pushed last in the
 * system prompt and stapled onto the final user turn.
 */
function languageDirective(userText: string): string {
  const language = detectReplyLanguage(userText);
  return (
    `LANGUAGE — this overrides every other instruction: the user's latest message is written in ${language}. ` +
    `Write your ENTIRE reply in ${language}. ` +
    `Even if the product name, these instructions, your stored memories, fetched web pages, or tool results are in another language, translate them and answer in ${language}. ` +
    `Do not reply in any language other than ${language} unless the user switches first.`
  );
}

const TONE_SYSTEM =
  "Default speech style: polite and respectful. In Korean use 존댓말 (합니다/해요체). " +
  "Do not use 반말 or a casual buddy tone unless the user explicitly asks to switch. " +
  "In English stay professional and courteous unless they ask for casual voice.";

const CONTEXT_INFERENCE_SYSTEM =
  "Infer missing context from the conversation instead of asking basic clarifying questions. " +
  // Asked to compare three companies' postings without being told which three,
  // the assistant stopped and asked which ones — a choice it was free to make —
  // and the whole multi-step job stalled on a question the person had already
  // delegated. Only they can supply a recipient or a credential; anyone can pick
  // three well-known companies.
  "When the person delegates a job and leaves a detail open that you are free to choose — which examples to use, which sources to read, what to name a file, what order to work in — pick a sensible option, say which one you picked, and carry on in the same turn. " +
  "Ask only for what you cannot decide for them: a recipient, a credential, which of their own files or people you mean, or a destructive step they have not approved. " +
  "If the user writes in Korean (or the UI locale/timezone is Korea), assume South Korea — default city Seoul, timezone KST (UTC+9) — for weather, local time, news, and 'here' unless they named another place. " +
  "Do not say you cannot know their location or the current time when Korean/KST context applies: use the session clock below and search Seoul/Korea weather or time. " +
  "Use only the session clock (and tool results) for relative time (지금, 오늘, 어제, 몇 시).";

const IDENTITY_SYSTEM =
  "You are Redrob, the assistant inside Redrob Office (Korean product name: 레드롭 오피스). " +
  "Always identify as Redrob — never invent spellings like Redrop, and do not invent a different product name. " +
  "Do not volunteer long self-introductions unless asked who you are.";

const METADATA_PRIVACY_SYSTEM =
  "Timestamps and routing fields are internal metadata. " +
  "Never print, quote, explain, or invent protocol tags such as [sentAt=…], sentAt=, ISO UTC stamps from the prompt, or similar in the user-visible reply. " +
  "If the user asks about a leaked tag, say it was an internal bug and answer without repeating the tag.";

/**
 * Parallel agents differ by reach, not by a pretend org chart.
 *
 * The parent model owns decomposition. Each assignment gets a fresh context and
 * a concrete tool subset, and independent assignments run together.
 */
const AGENTS_SYSTEM =
  "MULTI-AGENT WORK HAS NO FIXED ROLES OR HIERARCHY. " +
  "agents.delegate starts independent agents in parallel; each differs only by its self-contained task and concrete access level: read, write, or full. " +
  "You split independent work yourself and call agents.delegate with at least two assignments. Use the least access each task needs. " +
  "For dependent work, make separate calls: wait for the producing agents' real outputs, then give another agent the actual file or result to check. " +
  "In reasoning, progress and answers, identify runs only as Agent 1, Agent 2, and so on, or by access level. Never call an agent by a job title or imply that one agent directed another. " +
  "Claim an independent check only when a separate agent actually performed it. " +
  "Answer a one-step request yourself; parallel agents are for genuinely separable work.";

const TOOL_HONESTY_SYSTEM =
  "You have tools that read and change real state: memory.manage (remember/forget facts), settings.update (user-facing model settings), workflow.search / workflow.execute / workflow.save (the person's own saved flows, like skills they wrote), workspace.search (their notes, documents and past chats), agents.delegate (independent runs with explicit tool access), the file tools, web.fetch, the document tools, and any configured MCP tools (prefixed with mcp__). " +
  "When the user asks you to do something a tool covers — remember/forget, change a setting, read or write a file, open a page, create or edit a document, or call an external MCP integration — you MUST call the matching tool and answer from its result. " +
  "Slack, Discord, and WhatsApp are MCP integrations: use their matching mcp__ tool to read or send without opening those apps. If the matching tool is absent, tell the person to connect that integration in Settings > MCP Servers; never fall back to clicking the native app and never claim the message was sent. " +
  // Asked "what did we decide about the pricing page", a model with no memory of
  // it will reconstruct something plausible. The workspace holds the answer.
  "When they point at earlier work — a document, a decision, a draft, something from last week — call workspace.search before answering, and say plainly if it finds nothing rather than reconstructing what it probably said. " +
  "Never claim you did something — saved, remembered, changed, turned on/off, wrote, created — unless a tool call in this same turn returned success. " +
  "If a tool is denied or you cannot call it, say so plainly instead of pretending. Some actions (running commands, driving other apps on screen) are only available when the person turns on computer use. " +
  "Finish the user's request in this same turn: do not stop after announcing a next step (for example 'I will now verify'); call the remaining tools and then report the verified result. " +
  "When the request names a quantity — three companies, five sources, two options — deliver that many. If you genuinely cannot, say which ones you got and why the rest are missing rather than presenting a short result as complete.";

/**
 * Which tool a "make me a spreadsheet" actually means.
 *
 * Asked for a comparison spreadsheet with a chart, the assistant wrote a CSV
 * with `fs.write` and described in prose what a bar chart would have shown. Both
 * halves of the request had tools — `doc.create` makes a real xlsx and
 * `sheet.chart` draws a real chart into it — and neither was called, so the
 * person got a text file and a paragraph instead of the thing they asked for.
 */
const DOCUMENT_ROUTING_SYSTEM =
  "A spreadsheet, document, deck, HTML page, SVG icon, or code file means a real artifact on disk — not a prose description of one. " +
  "Office files: doc.create with a name like comparison.xlsx or pitch.pptx (a name rather than a path keeps it with the person's other documents), then doc.open and the sheet./doc./slide. tools to fill it in. sheet.chart draws an actual chart. " +
  "HTML pages, SVG icons, and source files (.ts, .py, .css, and similar): write them with fs.write, then open the file when asked. Prefer real .html / .svg markup over describing the page or icon in chat. " +
  "Never answer a request for a spreadsheet or a chart with a CSV written through fs.write plus a description of the chart you would have drawn. " +
  "Write real markup, not a sketch: five slides means five slides of actual content, inline CSS, working keyboard navigation, no placeholders. " +
  // An artifact fence is a panel in the app, not a file on disk. Asked to draft
  // a memo and open it in Mousepad, runs put the draft in a fence and then had
  // nothing to open, so the last step of the job quietly vanished.
  "When the person wants the document saved, sent, or opened in another app, write a real file first: an artifact fence alone leaves nothing on disk to open.";

/**
 * A CAPTCHA is a closed door, not the end of the job.
 *
 * From a datacenter the big search engines and job boards challenge or wall
 * almost every automated visit, and runs treated that as the end: four seconds
 * in, one blocked page, then an offer to try something else. The way through is
 * ordinary — the same information sits on pages that do not gate it.
 */
const BLOCKED_PAGE_SYSTEM =
  "A CAPTCHA, a 'verify you are human' page, a sign-in wall or a Cloudflare interstitial means that route is closed, not that the job is over. " +
  "Do not attempt the challenge and do not stop to ask: go somewhere that serves the content — a company's own careers or about page, its docs or blog, or another site covering the same thing — and carry on. " +
  "Say at the end which sources you actually read.";

const ARTIFACT_SYSTEM =
  "When you produce a substantial standalone document (memo, email draft, report, checklist, long plan, HTML page sketch, or similar), " +
  "write a short intro in normal chat, then wrap the document itself in a fenced code block whose language tag is exactly `artifact`. " +
  "Optional first line inside the fence: Title: Your title. " +
  // The fence is the only way to hand back a file when the desktop tools are
  // off, so a web page asked for in plain chat has to be able to arrive as one.
  "For a web page or an icon, put the real markup in the fence and tag it with the format — ```artifact html or ```artifact svg — and it is kept as an .html or .svg file the person can open in a browser. Write the whole page: no placeholders, inline the CSS, and do not link to files that will not exist. " +
  "For pptx, xlsx and docx, write a real file with the document tools instead of a fence. " +
  "Do not wrap short conversational answers in artifact fences.";

const WEB_SEARCH_TOOL_HINT =
  "You have a web_search tool that opens a real local browser and searches DuckDuckGo. " +
  "When you lack current facts (weather, time checks, news, companies, people), call web_search with a focused query. " +
  "For Korean users without a city, search Seoul/Korea (e.g. '서울 날씨 현재 기온', '서울 현재 시각'). " +
  "After tool results arrive, answer from them with concrete numbers when present and cite titles. Do not invent sources. " +
  "Never claim you searched unless you actually called the tool. Do not tell the user to check their phone clock or open a weather site instead of searching.";

const WEB_SEARCH_TOOL: CloudToolDefinition = {
  name: "web_search",
  description:
    "Search the live web via the user's local Chromium browser (DuckDuckGo). " +
    "Use for weather, current time checks, news, and unknown entities. " +
    "When the user writes in Korean without naming a city, include Seoul/Korea in the query " +
    "(e.g. '서울 날씨 오늘 기온', '서울 현재 시각'). Avoid vague meta phrases like '검색해서 알려줘'.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Focused search query (entity + intent keywords). Max ~200 chars.",
      },
    },
    required: ["query"],
  },
};

/**
 * One agent, one tool engine.
 *
 * Chat drives the same registry + policy + approval path the computer-use agent
 * uses, so there is no second tool implementation and no heuristic re-routing.
 *
 * The desktop tools used to be removed here even though this path already
 * carries their media and approvals. That made the engine switch a chat-loop
 * experiment only: asked to open Mousepad, both engines truthfully said they had
 * no such tools. Keeping app/screen/UI/input tools means the experiment can
 * actually answer the replacement question on native apps, while the same
 * policy and visible approval prompt still decide whether each action runs.
 *
 * Shell remains excluded: handing a chat an unrestricted command interpreter is
 * not required for desktop control. `web.search` stays on chat's sources path.
 */
const CHAT_TOOL_DENY = new Set<string>([
  "shell.exec",
  "web.search",
]);

/** Internal seam assertion: desktop tools must not silently disappear again. */
export function __testChatToolDenied(name: string): boolean {
  return CHAT_TOOL_DENY.has(name);
}

function chatInlineToolDefs(policy: SecurityPolicyBundle): CloudToolDefinition[] {
  return computerToolsAsCloudDefinitions(policy).filter(
    (def) => !CHAT_TOOL_DENY.has(def.name),
  );
}

function isChatInlineTool(name: string): boolean {
  return !CHAT_TOOL_DENY.has(name) && Boolean(getComputerTool(name));
}

/** What the chat loop needs to run a registry tool with approvals. */
export interface ChatApprovalRequest {
  callId: string;
  tool: string;
  title: string;
  detail: string;
  risk: string;
}

interface ChatToolRuntime {
  userData: string;
  chatId: string;
  policy: SecurityPolicyBundle;
  config: {
    allowedPaths: string[];
    execSecurity: ExecSecurityMode;
    execAsk: ExecAskMode;
    execAllowlist: string[];
  };
  onApprovalRequest?: (request: ChatApprovalRequest) => void;
  /**
   * Alternate approval owner. A supervised out-of-process path uses its own
   * native plugin approval manager so a pending person does not occupy an MCP
   * request. Local/cloud chat keeps the in-process waiter below.
   */
  requestApproval?: (request: Omit<ChatApprovalRequest, "callId">) => Promise<
    "approved" | "approved_always" | "rejected"
  >;
  onArtifact?: (item: { artifactId: string; tool: string }) => void;
  /** Where a long tool's progress lines go, so a flow run is not a silent pause. */
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Ask the person (in chat) before a high-risk tool runs; reuse the shared waiter.
 *
 * `sessionAllow` is the per-run memory: once a tool is approved (even just "for
 * this task"), its whole group is allowed for the rest of THIS turn, so a
 * multi-step web task does not re-prompt on every browser.type / browser.click.
 * "Always allow in this chat" additionally persists across turns.
 */
async function gateChatTool(
  name: string,
  args: Record<string, unknown>,
  rt: ChatToolRuntime,
  requiresApproval: boolean,
  risk: string,
  sessionAllow: Set<string>,
  denyWithoutUi = false,
): Promise<"run" | "deny"> {
  if (!requiresApproval) return "run";
  const group = toolGroupOf(name);
  // Already approved this run (same tool or a sibling in its group).
  if (sessionAllow.has(name) || sessionAllow.has(group)) return "run";
  if (isAlwaysAllowed(rt.chatId, name)) return "run";
  // Saying yes to one tool in a group answers for its neighbours too.
  if (
    toolsInGroup(group).some((sibling) => isAlwaysAllowed(rt.chatId, sibling))
  ) {
    return "run";
  }
  // No UI to ask: normally proceed (policy already allowed it), but an
  // injection-guarded mutation must not run unattended — deny instead.
  const sentence = describeToolCall(name, args);
  if (rt.requestApproval) {
    const outcome = await rt.requestApproval({
      tool: name,
      title: sentence.title,
      detail: sentence.detail,
      risk,
    });
    if (outcome === "approved" || outcome === "approved_always") {
      sessionAllow.add(group);
      if (outcome === "approved_always") allowAlways(rt.chatId, name);
      return "run";
    }
    return "deny";
  }
  if (!rt.onApprovalRequest) return denyWithoutUi ? "deny" : "run";
  const callId = randomUUID();
  rt.onApprovalRequest({
    callId,
    tool: name,
    title: sentence.title,
    detail: sentence.detail,
    risk,
  });
  const outcome = await waitForApproval(callId, {
    timeoutMs: 10 * 60_000,
    ...(rt.signal ? { signal: rt.signal } : {}),
  });
  // Any yes covers the rest of the run for this group; "always" also persists.
  if (outcome === "approved" || outcome === "approved_always") {
    sessionAllow.add(group);
    if (outcome === "approved_always") allowAlways(rt.chatId, name);
    return "run";
  }
  return "deny";
}

/**
 * Run a registry tool the chat model asked for and return a structured
 * observation. Policy decides if it is allowed and whether it needs approval;
 * what the tool reports back IS the verify-after-act ground truth the model
 * answers from.
 */
type ToolMedia = { path: string; kind: "image" | "video" };

/**
 * An observation stays in the transcript for the rest of the turn and is re-sent
 * on every later round, so a whole 100k-character file read early on crowds out
 * the conversation it was fetched for.
 */
const MAX_OBSERVATION_DATA_CHARS = 20_000;

/** Tools whose payload is text somebody else wrote. */
const UNTRUSTED_PAYLOAD_TOOLS = new Set([
  "fs.read",
  "fs.list",
  "web.fetch",
  "web.search",
  "doc.open",
  "doc.outline",
  "doc.readRange",
  "doc.search",
]);

/**
 * What the model reads back from a tool call.
 *
 * The summary alone is not enough, and quietly was for a while: `web.fetch`
 * summarises as "Read labs.redrob.ai/ (12030 chars)" and keeps the page in
 * `data`, so chat asked to describe a page received the character count, had
 * nothing to describe, and made something up that read entirely plausibly. Tools
 * that put their answer in `data` — the file readers, the page fetchers, the
 * search — were all unusable from chat in the same way, while the same tools
 * worked on the task path, which has always passed `data` along.
 */
function observationFor(
  toolName: string,
  result: { ok: boolean; summary: string; data?: unknown; error?: string },
): string {
  const head = `[${toolName} ${result.ok ? "OK" : "FAILED"}] ${result.summary}`;
  if (result.data === undefined || result.data === null) return head;
  let payload: string;
  try {
    payload = JSON.stringify(result.data);
  } catch {
    // A payload that will not serialise is not worth failing the call over; the
    // summary still says what happened.
    return head;
  }
  if (payload === "{}" || payload === "[]") return head;
  const clipped =
    payload.length > MAX_OBSERVATION_DATA_CHARS
      ? `${payload.slice(0, MAX_OBSERVATION_DATA_CHARS)}… [truncated, ${payload.length} chars total]`
      : payload;
  const body = UNTRUSTED_PAYLOAD_TOOLS.has(toolName)
    ? wrapExternalUntrustedContent(`tool:${toolName}`, clipped)
    : clipped;
  return `${head}\n${body}`;
}

/** Mutating app-state tools that normally run without a prompt. */
function isStateMutation(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName === "settings.update") return true;
  if (toolName === "memory.manage") return args.action !== "list";
  // A fetched page must not be able to start a flow that writes documents, or
  // quietly rewrite one of the person's saved flows.
  if (toolName === "workflow.execute" || toolName === "workflow.save") return true;
  // Nor may it start independent runs, whose tools may write files of their own.
  if (toolName === "agents.delegate") return true;
  // Legacy names from the first chat-skill pass, in case a transcript still holds them.
  if (toolName === "workflow.run") return true;
  return false;
}

/**
 * Run a tool, previewing first when it is a document write.
 *
 * A document write only commits against the exec plan its own dry run produced,
 * and chat never made that dry run: every sheet.writeRange came back "call with
 * dryRun first", so a run told to fill in a spreadsheet retried, decided the
 * spreadsheet tools were broken, and answered with a markdown table instead. The
 * task runner has always previewed first; this is that same two-step, and the
 * approval the person gave for the call is what the committed plan belongs to.
 */
export async function runToolWithDocPreview(
  toolName: string,
  args: Record<string, unknown>,
  ctx: Parameters<typeof executeComputerTool>[2],
): Promise<ToolResult> {
  const isDocWrite = DOC_WRITE_TOOLS.has(toolName) && toolName !== "doc.undo";
  if (!isDocWrite || args.dryRun === true) {
    return (await executeComputerTool(toolName, args, ctx)).result;
  }
  const { result: preview } = await executeComputerTool(
    toolName,
    { ...args, dryRun: true },
    ctx,
  );
  if (!preview.ok) return preview;
  const plan = (preview.data as { plan?: CanonicalExecPlan } | undefined)?.plan;
  const { result } = await executeComputerTool(
    toolName,
    { ...args, dryRun: false },
    { ...ctx, ...(plan ? { approvedExecPlan: plan } : {}) },
  );
  return result;
}

async function runInlineChatTool(
  toolName: string,
  argsJson: string,
  rt: ChatToolRuntime,
  sessionAllow: Set<string>,
  untrusted: boolean,
): Promise<{
  observation: string;
  settingsChanged: boolean;
  media: ToolMedia[];
  /** False when the tool was refused or failed, for callers that need the bit. */
  ok: boolean;
}> {
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(argsJson || "{}");
    if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
  } catch {
    /* leave empty; the tool reports what it needs */
  }
  const decision = evaluateToolPolicy(toolName, rt.policy, args);
  if (!decision.allowed) {
    return {
      observation: `[${toolName} DENIED] ${decision.reason ?? "Not allowed by the current profile."}`,
      settingsChanged: false,
      media: [],
      ok: false,
    };
  }
  const tool = getComputerTool(toolName);
  const risk = tool?.risk ?? "high";
  // Injection guard: once untrusted web content is in the turn, a state
  // mutation (which is normally silent) must be confirmed by the person — a
  // fetched page must not be able to quietly change settings or memories.
  const injectionGuarded = untrusted && isStateMutation(toolName, args);
  const gate = await gateChatTool(
    toolName,
    args,
    rt,
    decision.requiresApproval || injectionGuarded,
    risk,
    sessionAllow,
    injectionGuarded,
  );
  if (gate === "deny") {
    return {
      observation: `[${toolName} DENIED] The user declined this action.`,
      settingsChanged: false,
      media: [],
      ok: false,
    };
  }
  const toolCtx = {
    allowedPaths: rt.config.allowedPaths,
    userDataPath: rt.userData,
    policy: rt.policy,
    execSecurity: rt.config.execSecurity,
    execAsk: rt.config.execAsk,
    execAllowlist: rt.config.execAllowlist,
    elevated: false,
    ...(rt.onProgress ? { onProgress: rt.onProgress } : {}),
    ...(rt.signal ? { signal: rt.signal } : {}),
  };
  const result = await runToolWithDocPreview(toolName, args, toolCtx);
  if (result.artifactId) {
    rt.onArtifact?.({ artifactId: result.artifactId, tool: toolName });
  }
  const media: ToolMedia[] = result.media
    ? Array.isArray(result.media)
      ? result.media
      : [result.media]
    : [];
  return {
    observation: observationFor(toolName, result),
    settingsChanged: toolName === "settings.update" && result.ok,
    media,
    ok: result.ok,
  };
}

const PROCEED_NUDGE =
  "Go ahead using your own judgement for anything I did not specify, and finish the whole request. " +
  "Only come back with a question if it is something I alone can answer.";

/**
 * A turn that announced the work and then asked permission to begin.
 *
 * Ran no tools, and ended on a question: the plan is in the transcript and the
 * job is not started. Told to pick and carry on it does the work, so the stall
 * is worth one nudge rather than a person having to type "yes, go".
 */
/**
 * "…and opened it in Mousepad for you to edit", with no app ever launched.
 *
 * The prompt already forbids claiming an action no tool performed, and a long
 * run still signed off on the one step it had skipped — the person goes looking
 * for a window that was never there. The transcript of what ran is the only
 * thing that settles it, so the claim is checked against that.
 */
export function claimsAnAppWasOpened(text: string): boolean {
  return /\b(opened|launched|open)\b[^.!?\n]{0,60}\bin (mousepad|notepad|gedit|kate|emacs|libreoffice|the editor)\b/i.test(
    text,
  );
}

/**
 * "Would you like me to try another search engine?" — after one blocked page.
 *
 * A search engine showed a CAPTCHA, the run stopped four seconds in and offered
 * to try something else, which is the choice it was already free to make. Asking
 * to retry differs from asking to go further: "would you like me to email it to
 * the team" needs a person, so permission-seeking only counts as a stall when it
 * is about having another go at the same job.
 */
function seeksPermissionToRetry(text: string): boolean {
  return /\b(would you like me to|do you want me to|shall i|should i)\b[^.?!\n]{0,90}\b(try|retry|continue|proceed|again|another|instead|different (approach|way|site|source|engine))\b/i.test(
    text,
  );
}

/**
 * The plan, in full, and then nothing.
 *
 * "I will research three companies… 1. Google 2. Microsoft 3. Meta. If you have
 * other preferences, let me know." Four seconds, one tool, no question mark to
 * catch it on, and the reply reads like work in progress because it is: what was
 * promised in the future tense never happened.
 */
export function stalledAfterPlanning(turn: { text: string; toolsRan: number }): boolean {
  if (turn.toolsRan > 1) return false;
  const text = turn.text.trim();
  if (!text || text.length > 1500) return false;
  return /\b(?:I will|I'll|Let me)\b[^.!?\n]{0,90}\b(?:start|begin|first|research|search|create|build|draft|write|open|then|now|next)\b/i.test(
    text,
  );
}

/**
 * The request itself ended with "and open it in Mousepad so I can edit it".
 *
 * Checking the reply for a false claim only catches the runs that boast; others
 * simply stopped one step short, or opened the spreadsheet instead of the draft
 * they had just written. What the person asked for is the more reliable witness
 * than what the assistant says about it.
 */
export function asksToOpenInAnApp(message: string): boolean {
  return /\bopen\b[^.!?\n]{0,60}\bin (mousepad|notepad|gedit|kate|emacs|libreoffice|the editor)\b/i.test(
    message,
  );
}

/**
 * "Now I will write the header row and the data for each company." — the end.
 *
 * A turn can finish on a sentence about the step it was about to take: thirteen
 * tools in, workbook created and opened, and the reply stops on the promise to
 * fill it. Nothing is wrong except that the loop ended, so the last sentence is
 * the only thing that tells the difference between a summary and a stop.
 */
export function endsMidStep(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 6000) return false;
  const sentences = trimmed.split(/(?<=[.!?])\s+/);
  const tail = sentences[sentences.length - 1] ?? "";
  if (!/\b(?:I will|I'll|Let me|Now I|Next,? I)\b/i.test(tail)) return false;
  return /\b(write|create|open|read|search|fetch|add|build|draft|continue|proceed|save|launch|type|click|check|verify|extract|compare|gather|analyz|summari)\w*\b/i.test(
    tail,
  );
}

/**
 * A draft that exists only in the reply, with an editor opened on something else.
 *
 * The prompt says a fence is a panel and not a file, and runs still put the job
 * description in one, launched Mousepad, and reported the draft was open — the
 * editor had the spreadsheet in it, and the draft was nowhere. Whether a file of
 * words was written is a fact about the turn, so it is worth more here than the
 * instruction that was ignored.
 */
export function wroteProseFile(name: string, args: Record<string, unknown>): boolean {
  if (name === "fs.write") return true;
  if (name !== "doc.create") return false;
  const target = String(args["name"] ?? args["path"] ?? "");
  return /\.(?:md|markdown|txt|docx)$/i.test(target);
}

export function draftOnlyInTheReply(input: {
  message: string;
  text: string;
  wroteProse: boolean;
  launched: boolean;
}): boolean {
  if (input.wroteProse || !input.launched) return false;
  if (!asksToOpenInAnApp(input.message)) return false;
  return /```|<artifact>/i.test(input.text);
}

export function asksInsteadOfActing(turn: { text: string; toolsRan: number }): boolean {
  const text = turn.text.trim();
  if (!text || text.length > 1500) return false;
  const asks = text.endsWith("?") || /\?["')\]]?\s*$/.test(text);
  if (!asks) return false;
  return turn.toolsRan === 0 || seeksPermissionToRetry(text);
}

/**
 * Run this turn on Redrob Code, the only agent engine.
 *
 * The engine owns the agent loop; Office lends it the same tools chat already
 * has, over an in-process MCP bridge. Every call comes back through
 * `runInlineChatTool`, so the policy gate, the approval prompt, the per-turn
 * approval memory and the injection guard all still apply, and a screenshot a
 * tool takes still reaches the chat bubble. Redrob's system prompt goes over as
 * the turn's system message.
 *
 * The engine keeps the conversation itself, keyed by chat id, so only the new
 * message is sent. A missing or unhealthy engine fails loudly (an
 * `EngineTurnError` the caller renders as a Redrob-branded install/connect
 * message) rather than falling back to any other loop.
 *
 * Tool naming: the engine advertises MCP tools as `<server>_<tool>` and cannot
 * carry dots, so the bridge exposes each dotted registry name with dots turned
 * to underscores (`fs.write` -> `fs_write`) and maps back on the way in. The
 * system prompt below tells the model the same, so a call it plans as
 * `fs.write` lands on the tool it means.
 */
async function runRedrobCodeChatTurn(input: {
  userData: string;
  apiKey: string;
  message: string;
  system: string;
  rt: ChatToolRuntime;
  priorMessages: ChatMessage[];
  /** Title pass: never execute tools. */
  titlePass?: boolean;
  onTool?: (event: ChatToolProgressEvent) => void;
  onTextChunk?: (chunk: string) => void;
  log?: (line: string) => void;
}): Promise<{
  text: string;
  timingMs: number;
  modelId: string;
  settingsChanged: boolean;
  media: ToolMedia[];
  toolsRan: number;
  lockdownViolations: string[];
}> {
  const titlePass = Boolean(input.titlePass);
  const sessionAllow = new Set<string>();
  let untrustedSeen = input.priorMessages.some(
    (message) =>
      typeof message.content === "string" && /UNTRUSTED_WEB/i.test(message.content),
  );
  let settingsChanged = false;
  const media: ToolMedia[] = [];

  // Chat's tools, narrowed by policy, as the bridge tool surface. Dotted registry
  // names become underscored MCP names; the map takes them back for execution.
  const toDotted = new Map<string, string>();
  const bridgeName = (dotted: string) => dotted.replace(/\./g, "_");
  const listBridgeTools = () => {
    toDotted.clear();
    return chatInlineToolDefs(input.rt.policy).map((definition) => {
      const underscored = bridgeName(definition.name);
      toDotted.set(underscored, definition.name);
      return {
        name: underscored,
        description: definition.description,
        inputSchema: definition.parameters as Record<string, unknown>,
      };
    });
  };

  // Every call re-checked and routed through runInlineChatTool, so a call
  // arriving over the bridge is gated exactly like one Redrob's own loop makes.
  // A title pass refuses every call before approval so naming cannot run tools.
  const callBridgeTool = async (
    underscored: string,
    args: Record<string, unknown>,
  ): Promise<{ text: string; isError?: boolean }> => {
    if (titlePass) {
      return { text: `[${underscored} DENIED] Naming a thread cannot run tools.`, isError: true };
    }
    const name = toDotted.get(underscored) ?? underscored;
    if (!isChatInlineTool(name)) {
      return { text: `[${name} DENIED] Not available from chat.`, isError: true };
    }
    const label = describeToolCall(name, args).title;
    const sentence = capabilitySentence(name, args, label);
    input.onTool?.({
      kind: "step",
      name,
      status: "start",
      label,
      present: sentence.present,
      past: sentence.past,
    });
    const outcome = await runInlineChatTool(
      name,
      JSON.stringify(args),
      input.rt,
      sessionAllow,
      untrustedSeen,
    );
    input.onTool?.({
      kind: "step",
      name,
      status: "done",
      label,
      present: sentence.present,
      past: sentence.past,
      ok: outcome.ok,
    });
    input.log?.(`[redrob-code] ran ${name} -> ${outcome.ok ? "ok" : "refused/failed"}`);
    if (toolGroupOf(name) === "group:web") untrustedSeen = true;
    if (outcome.settingsChanged) settingsChanged = true;
    media.push(...outcome.media);
    return { text: outcome.observation, ...(outcome.ok ? {} : { isError: true }) };
  };

  // The model plans dotted names; the bridge advertises the same tools with dots
  // as underscores, and either lands on the tool it means.
  const system = titlePass
    ? input.system
    : `${input.system}\n\nYour tools arrive from an integration named ${"redrob-office"}: a tool this prompt calls fs.write is offered as ${"redrob-office"}_fs_write (dots become underscores). Use the names from your tool list; they are the same tools.`;

  const engine = getRedrobCodeEngine();
  const startedOnEngine = nowMs();
  await engine.ensureStarted({
    userData: input.userData,
    apiKey: input.apiKey,
    bridge: { listTools: listBridgeTools, callTool: callBridgeTool },
    ...(input.log ? { log: input.log } : {}),
  });
  const turn = await engine.runTurn({
    chatId: input.rt.chatId,
    message: input.message,
    system,
    ...(input.rt.signal ? { signal: input.rt.signal } : {}),
    ...(input.onTextChunk ? { onTextChunk: input.onTextChunk } : {}),
    onToolEvent: (event) => {
      // The bridge already emits per-call step events with real sentences; the
      // engine's own tool events would double count, so only surface tools the
      // engine ran that did not pass through the bridge (its own built-ins).
      if (event.phase !== "finished") return;
      if (toDotted.has(event.name) || toDotted.has(bridgeName(event.name))) return;
    },
  });
  if (turn.error) throw new EngineTurnError(new Error(turn.error.message), turn.toolsRan);
  return {
    text: turn.text,
    timingMs: nowMs() - startedOnEngine,
    modelId: `${DEFAULT_MODEL.providerID}/${DEFAULT_MODEL.id}`,
    settingsChanged,
    media,
    toolsRan: turn.toolsRan,
    lockdownViolations: [],
  };
}

/**
 * Flows are files on disk, so a flow saved a minute ago must be callable now:
 * read them per turn rather than caching, and never let a bad file cost the
 * person their message.
 */
function savedFlowsBlock(): string | undefined {
  try {
    return formatFlowsBlock(listWorkflows());
  } catch {
    return undefined;
  }
}

function formatMemoryBlock(store: Store | undefined): string | undefined {
  if (!store) return undefined;
  const memories = listMemories(store, MEMORY_PROMPT_LIMIT);
  if (memories.length === 0) return undefined;
  const lines = memories.map((item) => `- ${item.body}`);
  return [
    "Known facts about the user (use when relevant; do not invent extras):",
    ...lines,
  ].join("\n");
}

function formatSessionClock(input: {
  clientNowIso?: string;
  timeZone?: string;
  locale?: "en" | "ko";
}): string {
  const localeTag = input.locale === "ko" ? "ko-KR" : "en-US";
  const rawTz = input.timeZone?.trim();
  const timeZone =
    rawTz || (input.locale === "ko" ? "Asia/Seoul" : "UTC");
  const now = input.clientNowIso ? new Date(input.clientNowIso) : new Date(nowMs());
  const valid = !Number.isNaN(now.getTime()) ? now : new Date(nowMs());
  let localLabel = valid.toISOString();
  try {
    localLabel = new Intl.DateTimeFormat(localeTag, {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(valid);
  } catch {
    /* keep ISO */
  }
  const koreaHint =
    input.locale === "ko" ||
    timeZone === "Asia/Seoul" ||
    timeZone === "Asia/Pyongyang";
  return [
    `Session clock: ${localLabel}`,
    `ISO UTC: ${valid.toISOString()}`,
    `Device timezone: ${timeZone}`,
    koreaHint
      ? "Geography default: South Korea (Seoul) / KST. Apply unless the user named another place."
      : "Infer location from language and wording when possible; ask only if still ambiguous.",
  ].join("\n");
}

function stampMessageContent(content: string, _at?: string): string {
  // `at` is metadata only — never embed protocol tags in model-visible message bodies.
  return content.trim();
}

/**
 * Drop leaked protocol tags from model output (defense in depth).
 *
 * `scrubModelOutputForUi` runs first so a leaked tool call — an XML
 * `<tool_call>` block or a bare `{"name":…,"arguments":…}` object — never
 * reaches the transcript. Chat had wired only the `[sentAt=…]` strip below, so
 * a path with no live token stream to hide it in showed the raw JSON verbatim.
 */
export function sanitizeAssistantText(text: string): string {
  return scrubModelOutputForUi(text)
    .replace(/^\s*\[sentAt=[^\]]+\]\s*/gim, "")
    .replace(/\n\s*\[sentAt=[^\]]+\]\s*(?=\n|$)/gim, "\n")
    .replace(/\bsentAt\s*=\s*\S+/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSystemPrompt(
  messages: ChatMessage[],
  memoryBlock: string | undefined,
  enableWebSearch: boolean | undefined,
  clock: { clientNowIso?: string; timeZone?: string; locale?: "en" | "ko" },
  flowsBlock?: string | undefined,
): string {
  const parts = messages.filter((m) => m.role === "system").map((m) => m.content.trim());
  parts.push(IDENTITY_SYSTEM);
  parts.push(SHORT_ANSWER_SYSTEM);
  parts.push(TONE_SYSTEM);
  parts.push(CONTEXT_INFERENCE_SYSTEM);
  parts.push(AGENTS_SYSTEM);
  parts.push(METADATA_PRIVACY_SYSTEM);
  parts.push(TOOL_HONESTY_SYSTEM);
  parts.push(DOCUMENT_ROUTING_SYSTEM);
  parts.push(documentsFolderRule());
  parts.push(BLOCKED_PAGE_SYSTEM);
  parts.push(ARTIFACT_SYSTEM);
  parts.push(formatSessionClock(clock));
  if (enableWebSearch) parts.push(WEB_SEARCH_TOOL_HINT);
  if (memoryBlock) parts.push(memoryBlock);
  if (flowsBlock) parts.push(flowsBlock);
  // Language directive goes last so it is the system instruction closest to the
  // conversation, and names the concrete language: a large Korean page/tool
  // context block otherwise overpowers a generic "match the user" rule.
  parts.push(languageDirective(latestUserText(messages)));
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Where a file the person asked for belongs.
 *
 * The routing rule said to write a page with fs.write and never said where, so
 * asked for a deck website a run put it in the first allowed folder it could
 * think of — a source checkout — and the person's Documents stayed empty. The
 * folder has to be named, because only files under it show up in the app.
 */
export function documentsFolderRule(): string {
  let dir: string;
  try {
    dir = artifactsDirPath();
  } catch {
    return "";
  }
  return (
    `The person's documents folder is ${dir}. A file they asked you to make — a page, a deck site, an icon, a source file — goes there (${dir}/name.html), because that is what shows up in their Documents. ` +
    "Write somewhere else only when they named the place, or when you are editing a project that already exists. " +
    "Say where it ended up, and open it with the file path if they want to see it in a browser."
  );
}

function latestUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === "user") return m.content.trim();
  }
  return "";
}

/**
 * Local chat is stateless over llama-server, so the whole conversation is sent
 * on every turn instead of being held in a kernel session. Mirrors
 * `toCloudMessages`, minus the multimodal parts the local path cannot take.
 */
/** Append a trailing instruction to the last string-content user message. */
function stapleToLastUser(
  out: Array<{ role: string; content: unknown }>,
  trailer?: string,
): void {
  if (!trailer) return;
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const message = out[i]!;
    if (message.role === "user" && typeof message.content === "string") {
      out[i] = { ...message, content: `${message.content}\n\n${trailer}` };
      return;
    }
  }
}

function toLocalMessages(
  messages: ChatMessage[],
  system: string,
  contextBlock?: string,
  trailer?: string,
): LocalChatMessage[] {
  const out: LocalChatMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "system") continue;
    out.push({ role: m.role, content: stampMessageContent(m.content, m.at) });
  }
  const block = contextBlock?.trim();
  if (block && out[out.length - 1]?.role === "user") {
    out.splice(out.length - 1, 0, { role: "user", content: block });
  }
  stapleToLastUser(out, trailer);
  return out;
}

function toCloudMessages(
  messages: ChatMessage[],
  system: string,
  contextBlock?: string,
  trailer?: string,
): CloudChatMessage[] {
  const out: CloudChatMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "system") continue;
    out.push({ role: m.role, content: stampMessageContent(m.content, m.at) });
  }
  const block = contextBlock?.trim();
  if (block && out.length > 0) {
    const last = out[out.length - 1];
    if (last?.role === "user") {
      out.splice(out.length - 1, 0, { role: "user", content: block });
    }
  }
  stapleToLastUser(out, trailer);
  return out;
}

/**
 * The attached pictures, as the model has to receive them.
 *
 * Staged files rather than data URLs cross the bridge, so the bytes are read
 * here and encoded once. A file that has gone missing is skipped rather than
 * failing the turn: the words the person typed are still worth answering.
 */
async function imageParts(
  images: ReadonlyArray<{ path: string; mime: string }>,
): Promise<CloudChatContentPart[]> {
  const parts: CloudChatContentPart[] = [];
  for (const image of images) {
    try {
      const bytes = await readFile(image.path);
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${image.mime};base64,${bytes.toString("base64")}`,
        },
      });
    } catch {
      /* staged file gone — answer the text */
    }
  }
  return parts;
}

/**
 * Put the pictures on the turn they were attached to, which is the last thing
 * the person said. Anything earlier and the model reads them as history.
 */
function withImages(
  messages: CloudChatMessage[],
  parts: CloudChatContentPart[],
): CloudChatMessage[] {
  if (parts.length === 0) return messages;
  const index = messages.reduce(
    (found, message, at) => (message.role === "user" ? at : found),
    -1,
  );
  if (index < 0) return messages;
  const target = messages[index];
  if (target?.role !== "user") return messages;
  const text =
    typeof target.content === "string"
      ? target.content
      : target.content
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("");
  const spoken: CloudChatMessage = {
    role: "user",
    content: [
      ...(text ? [{ type: "text" as const, text }] : []),
      ...parts,
    ],
  };
  return messages.map((message, at) => (at === index ? spoken : message));
}

function parseSearchQuery(argsJson: string): string {
  try {
    const parsed = JSON.parse(argsJson) as { query?: unknown };
    if (typeof parsed.query === "string" && parsed.query.trim()) {
      return parsed.query.trim().slice(0, 200);
    }
  } catch {
    /* fall through */
  }
  const raw = argsJson.replace(/[{}"']/g, " ").trim();
  return raw.slice(0, 200);
}

async function executeWebSearchTool(
  argsJson: string,
  onTool?: (event: ChatToolProgressEvent) => void,
): Promise<{ content: string; record: ChatWebSearchRecord }> {
  const query = parseSearchQuery(argsJson) || "search";
  onTool?.({ kind: "tool", name: "web_search", status: "start", query });
  try {
    const search = await runWebSearch({ query, limit: 6, keepOpen: false }, null);
    const record: ChatWebSearchRecord = {
      query: search.query,
      results: search.results,
      ...(search.blocked ? { blocked: true } : {}),
    };
    onTool?.({
      kind: "tool",
      name: "web_search",
      status: "done",
      query: search.query,
      resultCount: search.results.length,
      ...(search.blocked ? { blocked: true } : {}),
      results: search.results,
    });
    return {
      content: search.contextBlock || formatWebSearchContext(search),
      record,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onTool?.({
      kind: "tool",
      name: "web_search",
      status: "done",
      query,
      resultCount: 0,
      results: [],
    });
    return {
      content: [
        "<<<UNTRUSTED_WEB_RESULTS>>>",
        `Query: ${query}`,
        `Web search failed: ${message}`,
        "<<<END_UNTRUSTED_WEB_RESULTS>>>",
      ].join("\n"),
      record: { query, results: [] },
    };
  }
}

async function runCloudChatWithTools(input: {
  provider: "openai" | "openrouter" | "anthropic";
  model: string;
  thinking: boolean;
  providers: LlmProviderSecrets;
  messages: CloudChatMessage[];
  maxTokens: number;
  temperature: number;
  enableWebSearch: boolean;
  /** The one tool engine: registry + policy + approvals for chat's tool calls. */
  rt: ChatToolRuntime;
  onTextChunk?: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onStreamReset?: () => void;
  onTool?: (event: ChatToolProgressEvent) => void;
}): Promise<{
  text: string;
  timingMs: number;
  modelId: string;
  reasoning?: string;
  webSearches: ChatWebSearchRecord[];
  settingsChanged: boolean;
  media: ToolMedia[];
}> {
  // The full policy-allowed registry (files, web pages, documents, memory,
  // settings, …) minus the visual desktop tools; web search is opt-in per turn.
  const tools: CloudToolDefinition[] = [
    ...chatInlineToolDefs(input.rt.policy),
    ...(input.enableWebSearch ? [WEB_SEARCH_TOOL] : []),
  ];
  const messages = [...input.messages];
  const webSearches: ChatWebSearchRecord[] = [];
  const media: ToolMedia[] = [];
  // Per-run approval memory: one "Allow for this task" covers the rest of this
  // turn's same-group actions, so a web task does not re-prompt every click/type.
  const sessionAllow = new Set<string>();
  // Injection guard: has untrusted web content entered this turn (pre-fetched
  // context, or a web/browser tool result)? If so, later state mutations ask.
  let untrustedSeen = input.messages.some(
    (m) => typeof m.content === "string" && /UNTRUSTED_WEB/i.test(m.content),
  );
  let settingsChanged = false;
  const started = performance.now();
  let modelId = `${input.provider}:${input.model}`;
  let lastText = "";
  let reasoningParts: string[] = [];

  /** A best-effort close when the provider errors after tools have already run. */
  const degradedReturn = (): {
    text: string;
    timingMs: number;
    modelId: string;
    webSearches: ChatWebSearchRecord[];
    settingsChanged: boolean;
    media: ToolMedia[];
    reasoning?: string;
  } => {
    const reasoning = reasoningParts.join("\n\n").trim();
    return {
      text:
        lastText.trim() ||
        "I ran the steps above but the model did not return a final summary. Please check the results.",
      timingMs: performance.now() - started,
      modelId,
      webSearches,
      settingsChanged,
      media,
      ...(reasoning ? { reasoning } : {}),
    };
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const allowTools = Boolean(tools) && round < MAX_TOOL_ROUNDS - 1;
    let result: Awaited<ReturnType<typeof generateCloudChatWithFallback>>;
    try {
      result = await generateCloudChatWithFallback({
      provider: input.provider,
      model: input.model,
      thinking: input.thinking,
      providers: input.providers,
      messages,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      ...(allowTools && tools ? { tools, toolChoice: "auto" as const } : {}),
      // Every round streams: providers emit tool_call deltas alongside text, so a
      // round that ends up calling a tool still shows its preamble live.
      ...(input.onTextChunk ? { onTextChunk: input.onTextChunk } : {}),
      ...(input.onReasoningChunk ? { onReasoningChunk: input.onReasoningChunk } : {}),
      ...(input.onStreamReset ? { onStreamReset: input.onStreamReset } : {}),
      });
    } catch (err) {
      // A provider hiccup (e.g. "stream ended with empty content" after a large
      // or confusing tool observation) should not throw the whole turn away once
      // tools have run. On the first round there is nothing to salvage — surface
      // the error; after that, close with what we have.
      if (round === 0) throw err;
      return degradedReturn();
    }
    modelId = result.modelId;
    lastText = result.text;
    if (result.reasoning?.trim()) reasoningParts.push(result.reasoning.trim());

    const calls = result.toolCalls ?? [];
    if (calls.length === 0) {
      // Do not push the full answer through onTextChunk — the renderer commits
      // result.text once. Pushing here duplicated the bubble next to streaming UI.
      const reasoning = reasoningParts.join("\n\n").trim();
      return {
        text: result.text,
        timingMs: performance.now() - started,
        modelId,
        webSearches,
        settingsChanged,
        media,
        ...(reasoning ? { reasoning } : {}),
      };
    }

    // The preamble streamed above is not part of the committed answer, so drop it
    // and let the live bubble restart clean on the post-tool answer.
    if (result.text) input.onStreamReset?.();

    messages.push({
      role: "assistant",
      content: result.text || "",
      toolCalls: calls,
    });

    for (const call of calls) {
      if (call.name === "web_search") {
        const { content, record } = await executeWebSearchTool(call.arguments, input.onTool);
        untrustedSeen = true;
        webSearches.push(record);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content,
        });
      } else if (isChatInlineTool(call.name)) {
        let stepArgs: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(call.arguments || "{}");
          if (parsed && typeof parsed === "object") stepArgs = parsed as Record<string, unknown>;
        } catch {
          /* label from tool name only */
        }
        const label = describeToolCall(call.name, stepArgs).title;
        const sentence = capabilitySentence(call.name, stepArgs, label);
        input.onTool?.({
          kind: "step",
          name: call.name,
          status: "start",
          label,
          present: sentence.present,
          past: sentence.past,
        });
        const {
          observation,
          settingsChanged: changed,
          media: toolMedia,
          ok,
        } = await runInlineChatTool(
          call.name,
          call.arguments,
          input.rt,
          sessionAllow,
          untrustedSeen,
        );
        input.onTool?.({
          kind: "step",
          name: call.name,
          status: "done",
          label,
          present: sentence.present,
          past: sentence.past,
          ok,
        });
        // Reading a web page (web.fetch, browser.*) brings untrusted content in,
        // so any mutation after it in this turn is guarded.
        if (toolGroupOf(call.name) === "group:web") untrustedSeen = true;
        if (changed) settingsChanged = true;
        media.push(...toolMedia);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: observation,
        });
      } else {
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: `Unknown tool: ${call.name}`,
        });
      }
    }
  }

  // Exhausted tool rounds — final answer without tools.
  let final: Awaited<ReturnType<typeof generateCloudChatWithFallback>>;
  try {
    final = await generateCloudChatWithFallback({
      provider: input.provider,
      model: input.model,
      thinking: input.thinking,
      providers: input.providers,
      messages,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      ...(input.onTextChunk ? { onTextChunk: input.onTextChunk } : {}),
      ...(input.onReasoningChunk ? { onReasoningChunk: input.onReasoningChunk } : {}),
      ...(input.onStreamReset ? { onStreamReset: input.onStreamReset } : {}),
    });
  } catch {
    return degradedReturn();
  }
  if (final.reasoning?.trim()) reasoningParts.push(final.reasoning.trim());
  const reasoning = reasoningParts.join("\n\n").trim();

  return {
    text: final.text || lastText,
    timingMs: performance.now() - started,
    modelId: final.modelId,
    webSearches,
    settingsChanged,
    media,
    ...(reasoning ? { reasoning } : {}),
  };
}

export async function runChat(
  userData: string,
  input: ChatRequest,
  onTextChunk?: (chunk: string) => void,
  store?: Store,
  onTool?: (event: ChatToolProgressEvent) => void,
  onStreamReset?: () => void,
  onReasoningChunk?: (chunk: string) => void,
  agent?: {
    chatId?: string;
    onApprovalRequest?: (request: ChatApprovalRequest) => void;
    onArtifact?: (item: { artifactId: string; tool: string }) => void;
    signal?: AbortSignal;
  },
): Promise<ChatResult> {
  const setup = await loadSetupState(userData);
  const inferenceRoute = (setup.inferenceRoute ?? "auto") as InferenceRouteMode;
  const providers = (setup.llmProviders ?? {}) as LlmProviderSecrets;
  const enableWebSearch = Boolean(input.enableWebSearch);
  const titlePass = isChatTitleSession(input.sessionId);
  // Naming must not inherit TOOL_HONESTY or the desktop tool surface — that
  // re-ran the just-finished chat as a fresh agent task (second Mousepad
  // approval) while the UI already showed an incomplete reply.
  const system = titlePass
    ? titleSystemPrompt(input.messages)
    : buildSystemPrompt(
        input.messages,
        formatMemoryBlock(store),
        enableWebSearch,
        {
          ...(input.clientNowIso ? { clientNowIso: input.clientNowIso } : {}),
          ...(input.timeZone ? { timeZone: input.timeZone } : {}),
          ...(input.locale ? { locale: input.locale } : {}),
        },
        savedFlowsBlock(),
      );
  const userText = latestUserText(input.messages);
  if (!userText) throw new Error("At least one user message is required");
  const langTrailer = languageDirective(userText);
  let localAvailable = false;
  let localCanSee = false;
  try {
    const plan = await hostGetPlan();
    localAvailable = Boolean(plan.modelPath);
    localCanSee = Boolean(plan.supportsVision && plan.mmprojPath);
  } catch {
    localAvailable = false;
  }
  const pictures = input.images ?? [];

  // One cloud model answers every chat turn; models that refuse thinking-off
  // still get a level via modelNeedsThinking().
  const route = resolveInferenceRoute({
    mode: inferenceRoute,
    providers,
    localAvailable,
    redrobAvailable: redrobAvailableFromEnv(),
    workload: { kind: "chat", text: userText },
    ...(cloudModelOverride() ? { cloudModel: cloudModelOverride() } : {}),
    ...(pictures.length > 0 ? { needsVision: true } : {}),
  });
  const useThinking =
    modelNeedsThinking(route.model) || Boolean(route.thinking);

  const maxTokens = input.maxTokens ?? DEFAULT_CHAT_MAX_TOKENS;

  // Thread naming is a short text completion — never an agent turn with tools,
  // approvals, or the engine's bridged tool surface.
  if (titlePass) {
    const started = performance.now();
    if (route.provider === "local") {
      const ready = await localTurnReady();
      if (!ready.ok) throw new Error(ready.reason);
      const turn = await hostGenerateChat({
        messages: toLocalMessages(input.messages, system, undefined, langTrailer),
        maxTokens,
        temperature: input.temperature ?? 0.7,
        reasoning: false,
        ...(onTextChunk ? { onTextChunk } : {}),
      });
      let backend = "local";
      let modelId = "local";
      try {
        const plan = await hostGetPlan();
        backend = plan.backend;
        modelId = plan.modelId;
      } catch {
        // ignore
      }
      return {
        text: sanitizeAssistantText(turn.text),
        timingMs: turn.timingMs,
        modelId,
        backend,
        thinking: false,
      };
    }
    if (route.provider === "redrob_remote") {
      throw new Error(
        "This inference route is no longer supported. Add a key from console.redrob.ai.",
      );
    }
    const cloud = await generateCloudChatWithFallback({
      provider: route.provider,
      model: route.model,
      thinking: false,
      providers,
      messages: toCloudMessages(input.messages, system, undefined, langTrailer),
      maxTokens,
      temperature: input.temperature ?? 0.7,
      toolChoice: "none",
      ...(onTextChunk ? { onTextChunk } : {}),
    });
    return {
      text: sanitizeAssistantText(cloud.text),
      timingMs: performance.now() - started,
      modelId: cloud.modelId,
      backend: "cloud",
      thinking: false,
    };
  }

  if (route.provider === "local") {
    // Chat used to call straight into the server and take whatever state it was
    // in. Downloading a grade or changing the GPU restarts the sidecar in the
    // background, and a message sent during that reload came back as
    // "ERR_LLAMA_SERVER_NOT_STARTED". Asking first makes the turn wait for the
    // weights, and when they truly cannot load, say why instead of the code.
    const ready = await localTurnReady();
    if (!ready.ok) throw new Error(ready.reason);
    // `resetSession` is now purely a client concern: the caller decides what
    // history to send. There is no server-side session left to clear.
    const history = input.resetSession ? [{ role: "user" as const, content: userText }] : input.messages;
    // A picture cannot ride the plain text path, but the same llama-server holds
    // the projector, so the turn goes through the multimodal call instead. Said
    // plainly when it cannot: a model guessing at a screenshot it never saw is
    // worse than one that admits it.
    const parts = localCanSee ? await imageParts(pictures) : [];
    const blind =
      pictures.length > 0 && parts.length === 0
        ? "The person attached an image. This model cannot see it. Say so and ask them to describe it or switch to a cloud model in Settings."
        : "";
    const turn =
      parts.length > 0
        ? await hostGenerateChatWithTools({
            messages: withImages(
              toCloudMessages(history, system, input.contextBlock, langTrailer),
              parts,
            ),
            maxTokens,
            temperature: input.temperature ?? 0.7,
            thinking: useThinking,
            ...(onTextChunk ? { onTextChunk } : {}),
          })
        : await hostGenerateChat({
            messages: toLocalMessages(
              history,
              blind ? `${system}\n${blind}` : system,
              input.contextBlock,
              langTrailer,
            ),
            maxTokens,
            temperature: input.temperature ?? 0.7,
            reasoning: useThinking,
            ...(onTextChunk ? { onTextChunk } : {}),
          });
    let backend = "local";
    let modelId = "local";
    try {
      const plan = await hostGetPlan();
      backend = plan.backend;
      modelId = plan.modelId;
    } catch {
      // ignore
    }
    // The multimodal call answers with the cloud result shape, which does not
    // report back whether reasoning ran.
    const reasoned =
      "reasoningEnabled" in turn ? turn.reasoningEnabled : useThinking;
    return {
      text: sanitizeAssistantText(turn.text),
      timingMs: turn.timingMs,
      modelId,
      backend,
      thinking: reasoned,
      ...(turn.reasoning ? { reasoning: turn.reasoning } : {}),
    };
  }

  if (route.provider === "redrob_remote") {
    throw new Error(
      "This inference route is no longer supported. Add a key from console.redrob.ai.",
    );
  }

  const [policy, cuConfig] = await Promise.all([
    buildSecurityBundle(),
    getComputerUseConfig(),
  ]);
  const rt: ChatToolRuntime = {
    userData,
    chatId: input.sessionId?.trim() || "chat",
    policy,
    config: {
      allowedPaths: cuConfig.allowedPaths,
      execSecurity: cuConfig.execSecurity,
      execAsk: cuConfig.execAsk,
      execAllowlist: cuConfig.execAllowlist,
    },
    ...(agent?.onApprovalRequest && !titlePass
      ? { onApprovalRequest: agent.onApprovalRequest }
      : {}),
    ...(agent?.onArtifact ? { onArtifact: agent.onArtifact } : {}),
    ...(onTool && !titlePass
      ? {
          onProgress: (message: string) =>
            onTool({
              kind: "step",
              name: "workflow.progress",
              status: "start",
              label: message,
              present: message,
              past: message,
              nested: true,
            }),
        }
      : {}),
    ...(agent?.signal ? { signal: agent.signal } : {}),
  };
  // Cloud chat runs on Redrob Code, the only agent engine. A missing or
  // unreachable engine is an error the person can see, not a quiet swap onto
  // another loop.
  {
    if (!redrobCodeEngineAvailable()) {
      const message = redrobCodeUnavailableMessage("the agent engine is not installed");
      log(`[redrob-code] refusing turn: engine not installed`);
      return {
        text: message,
        timingMs: 0,
        modelId: route.model,
        backend: "error",
        thinking: false,
      };
    }
    const apiKey = providers[route.provider]?.apiKey?.trim() ?? "";
    // Only text crosses to the engine, so an attached image does not arrive.
    // Said out loud for the same reason the local path says it: a model that is
    // not told the picture is missing describes it anyway.
    const unseen =
      pictures.length > 0
        ? "\nThe person attached an image. It did not reach this engine, so you cannot see it. Say so rather than guessing at it."
        : "";
    try {
      const turn = await runRedrobCodeChatTurn({
        userData,
        apiKey,
        message: langTrailer ? `${userText}\n\n${langTrailer}` : userText,
        system: `${system}${unseen}`,
        rt,
        priorMessages: input.messages,
        titlePass: false,
        ...(onTool ? { onTool } : {}),
        log,
      });
      // The console billed this turn, so whatever it last said about credit is
      // out of date.
      noteCreditSpent();
      return {
        text: sanitizeAssistantText(turn.text),
        timingMs: turn.timingMs,
        modelId: turn.modelId,
        backend: "redrob-code",
        thinking: false,
        ...(turn.settingsChanged ? { settingsChanged: true } : {}),
        ...(turn.media.length > 0 ? { media: turn.media } : {}),
      };
    } catch (error) {
      /**
       * Out of credit before throttled, because the two look alike and only one
       * of them is fixed by waiting. Telling someone their model is busy when
       * their balance is spent sends them back to try again for nothing.
       */
      if (isOutOfCredit(error)) {
        noteOutOfCredit(error);
        log(`[redrob-code] out of credit: ${String(error)}`);
        return {
          text: outOfCreditMessage(input.locale === "ko" ? "ko" : "en"),
          timingMs: 0,
          modelId: route.model,
          backend: "redrob-code",
          thinking: false,
          outOfCredit: true,
        };
      }
      const toolsRan = error instanceof EngineTurnError ? error.toolsRan : 0;
      const failClosed = isUpstreamModelFailure(error)
        ? upstreamThrottleMessage(route.model, route.provider)
        : workDoneBeforeGivingUp(error, toolsRan)
          ? turnRanOutOfTimeMessage(toolsRan)
          : null;
      if (failClosed) {
        log(`[redrob-code] fail-closed (${toolsRan} steps done): ${String(error)}`);
        return {
          text: failClosed,
          timingMs: 0,
          modelId: route.model,
          backend: "redrob-code",
          thinking: false,
        };
      }
      log(`[redrob-code] refusing turn after error: ${String(error)}`);
      return {
        text: redrobCodeUnavailableMessage(String(error)),
        timingMs: 0,
        modelId: route.model,
        backend: "error",
        thinking: false,
      };
    }
  }
}

/** @internal exported for tests */
export function __testParseSearchQuery(argsJson: string): string {
  return parseSearchQuery(argsJson);
}

/** @internal exported for tests */
export function __testObservationFor(
  toolName: string,
  result: { ok: boolean; summary: string; data?: unknown; error?: string },
): string {
  return observationFor(toolName, result);
}

/** @internal */
export type __TestCloudToolCall = CloudToolCall;
