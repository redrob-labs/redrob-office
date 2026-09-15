import type { WorkspaceDef } from "@redrob/ui";
import type { DocRenderModel } from "./doc-render.js";
import type {
  McpServerConfig,
  McpServerView,
  McpToolView,
} from "./mcp.js";

export type { DocRenderModel } from "./doc-render.js";
export * from "./mcp.js";

/** Community workflow gallery (opens in the system browser). */
export const WORKFLOW_GALLERY_URL = "https://redrob.app/workflows";

/** Where a person creates the API key Office runs on. */
export const REDROB_CONSOLE_URL = "https://console.redrob.ai";

/** The only inference endpoint Office talks to. */
export const REDROB_CONSOLE_API_BASE = `${REDROB_CONSOLE_URL}/api/backend/v1`;

export interface ReviewQueueField {
  id: string;
  documentId: string;
  documentPath: string;
  pointer: string;
  value: string;
  confidenceScore: number;
  confidenceJson: string | null;
  reviewed: boolean;
  schemaId: string;
  tierUsed: string;
}

export interface DeviceProfile {
  tier: "T4" | "T8" | "T16";
  totalRamMb: number;
  freeRamMb: number;
  cpuModel: string;
  cpuCores: number;
  /** CPU package temp °C when the OS exposes it; null if unavailable. */
  cpuTempC: number | null;
  gpu: { vendor: string; renderer: string } | null;
  hasUnifiedMemory: boolean;
  platform: "darwin" | "win32" | "linux";
}

export interface ExecutionPlanView {
  backend: "cuda" | "metal" | "vulkan" | "cpu";
  modelId: string;
  modelPath: string;
  gpuLayers: number | "auto";
  threads: number;
  contextSize: number;
  batchSize: number;
  kvCacheType: "f16" | "q8_0";
  reason: string;
  isolation: "utilityProcess" | "inProcess";
  usingFallbackModel?: boolean;
  downloadSuggestedModelId?: string | null;
}

/**
 * One way this machine falls short of running models on device.
 *
 * `need` and `have` are raw numbers in the unit the id implies — bytes for
 * disk, MiB for vram, MB for ram — so the sentence a person reads is written
 * once, in the renderer, in their language.
 */
export interface LocalShortfall {
  id: "platform" | "gpu" | "disk" | "vram" | "ram";
  /** `blocking` means local inference cannot run at all. */
  severity: "blocking" | "warning";
  need: number;
  have: number;
}

export interface LocalCapability {
  grade: ModelGrade;
  /** False when nothing local can run here, whatever is downloaded. */
  runnable: boolean;
  shortfalls: LocalShortfall[];
  /** True when a cloud key is already set, so there is nothing to nudge. */
  cloudConfigured: boolean;
}

export interface CorrectFieldRequest {
  fieldId: string;
  value: string;
  schemaId: string;
  modelId: string;
  tier?: string;
}

export interface MeasuredTiming {
  operation: string;
  totalMs: number;
  recordedAt: string;
}

export type PackRole = "text" | "embed" | "rerank";
export type InferenceMode = "local" | "redrob_remote";
export type GpuPreference = "auto" | "gpu" | "cpu";
export type ChatRouteMode =
  "auto" | "local" | "openai" | "openrouter" | "anthropic";
/** App-wide inference routing (chat, drafts, extract). */
export type InferenceRouteMode = ChatRouteMode;

/**
 * Local weight grade (which on-device pack to load).
 * Kept as JSON field `chatQualityMode` in setup.json for compatibility.
 */
export type ModelGrade = "flash" | "pro";

export interface LlmProviderCredentialView {
  apiKey: string;
  baseUrl?: string;
}

/** Renderer-facing stand-in for a configured cloud key (never the real secret). */
export const MASKED_API_KEY = "*".repeat(32);

export function isMaskedApiKey(value: string | undefined | null): boolean {
  return (value?.trim() ?? "") === MASKED_API_KEY;
}

export type LlmProviderSecretsView = Partial<
  Record<"openai" | "openrouter" | "anthropic", LlmProviderCredentialView>
>;

export interface SetupDecision {
  mode: InferenceMode;
  packTier: "T4" | "T8" | "T16";
  rolesToDownload: PackRole[];
  remoteConsent: boolean;
}

export interface SetupSnapshot {
  state: {
    completedAt: string | null;
    mode: InferenceMode;
    packTier: "T4" | "T8" | "T16";
    gpuPreference: GpuPreference;
    downloadedRoles: PackRole[];
    remote: { baseUrl: string; apiKey: string; consentedAt: string } | null;
    inferenceRoute: InferenceRouteMode;
    /** Local weight grade (`flash` | `pro`). JSON key kept for compatibility. */
    chatQualityMode: ModelGrade;
    /** Whether chat and the office floor may look things up on the web. */
    webSearchEnabled: boolean;
    /**
     * The Redrob Console key the engine routes with. `openai` is the slot's
     * historical name in setup.json; there is one provider now, and it is
     * Console.
     */
    llmProviders: LlmProviderSecretsView;
  };
  freeBytes: number;
  freeLabel: string;
  mount: string;
  plan: {
    tier: "T4" | "T8" | "T16";
    grade: ModelGrade;
    roles: Array<{
      role: PackRole;
      label: string;
      description: string;
      approxBytes: number;
    }>;
    minimalBytes: number;
    fullBytes: number;
  };
  planMinimalLabel: string;
  planFullLabel: string;
  canFitMinimal: boolean;
  canFitFull: boolean;
  modelsDir: string;
  /** Roles on disk, measured against the flash local pack — the floor for local work. */
  presentRoles: PackRole[];
  /** True when the selected grade's own text weights are downloaded. */
  gradeWeightsPresent: boolean;
  /**
   * Whether this machine's graphics memory covers the selected grade.
   *
   * Not a gate: under it the weights still load and still answer, they just
   * spill into system memory and take longer per word. Saying so is the only way
   * someone can tell a slow answer from a broken one.
   */
  gradeFitsVram: boolean;
  /** Graphics memory found on this machine. Null when it could not be read. */
  vramLabel: string | null;
  /** Graphics memory the selected grade wants. */
  gradeVramLabel: string;
}

export interface IntakeBatchRequest {
  workspaceId: string;
  schemaId: string;
  directoryPath: string;
}

export interface IntakeBatchResult {
  runId: string;
  schemaId: string;
  queued: number;
  processed: number;
  errors: number;
  items: Array<{
    path: string;
    ok: boolean;
    documentId?: string;
    fieldCount?: number;
    needsReviewCount?: number;
    error?: string;
  }>;
}

export type RecruitingPipelineStep =
  | "jd"
  | "rubric"
  | "intake"
  | "assess"
  | "email";

export interface RecruitingPipelineInput {
  workspaceId?: string;
  locale?: "en" | "ko";
  jd?: {
    roleTitle: string;
    responsibilities: string;
    qualifications: string;
    location?: string;
  };
  /** Resume files for intake (absolute paths). */
  intakeFilePaths?: string[];
  /** Folder of resumes; the main process expands it into intakeFilePaths. */
  intakeDirectoryPath?: string;
  /** Schema for intake; default recruiting/resume. */
  intakeSchemaId?: string;
  /** Pass threshold vs max score sum; default 0.7. */
  passThreshold?: number;
  /** Skip email step. */
  skipEmail?: boolean;
  /** Run only these pipeline steps. Dependencies must be present in context. */
  steps?: RecruitingPipelineStep[];
  /** Outputs from an earlier run, used to resume or run a step subset. */
  context?: Partial<RecruitingPipelineContext>;
}

export interface RecruitingPipelineContext {
  workspaceId: string;
  locale: "en" | "ko";
  roleTitle?: string;
  jdMarkdown?: string;
  jdArtifactId?: string;
  rubricId?: string;
  rubricArtifactId?: string;
  intakeRunId?: string;
  documentIds: string[];
  assessResults: Array<{
    documentId: string;
    runId: string;
    scoreSum: number;
    scoreMax: number;
    decision: "pass" | "reject";
  }>;
  emailArtifactIds: string[];
}

export interface RecruitingPipelineProgress {
  step: RecruitingPipelineStep | "done";
  index: number;
  total: number;
  message?: string;
}

export interface RecruitingPipelineResult {
  context: RecruitingPipelineContext;
  timingMs: number;
}

export interface SetupProgressEvent {
  kind: "start" | "download" | "ready" | "done" | "remote";
  role?: PackRole;
  artifactId?: string;
  /** 0-100 when known */
  percent?: number;
  bytesReceived?: number;
  totalBytes?: number | null;
  detail?: string;
}

export interface IntakeProgressEvent {
  processed: number;
  errors: number;
  queued: number;
  path: string;
  field?: {
    path: string;
    value: unknown;
    confidenceScore: number;
  };
}

export type WorkOperation =
  "draftJd" | "draftDecisionEmail" | "runPublish" | "generateRubric";

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
   * Per-turn untrusted context (e.g. web search). Attached to the user turn,
   * not baked into the persistent system prompt.
   */
  contextBlock?: string;
  /** Cloud: let the model call web_search via tool calling. */
  enableWebSearch?: boolean;
  /** Pictures attached to this turn, staged on disk by `attachFiles`. */
  images?: Array<{ path: string; mime: string }>;
  /** UI locale — used for language and geography defaults. */
  locale?: "en" | "ko";
  /** Client clock ISO string for "what time is it" answers. */
  clientNowIso?: string;
  /** IANA timezone from the client, e.g. Asia/Seoul. */
  timeZone?: string;
  /** Use local computer-use tools (fs/shell/doc) with approval gates. */
  enableComputerUse?: boolean;
}

export interface ChatResult {
  text: string;
  timingMs: number;
  modelId: string;
  rePrefill?: boolean;
  backend?: string;
  thinking?: boolean;
  /** Provider chain-of-thought when exposed. */
  reasoning?: string;
  webSearches?: Array<{
    query: string;
    results: WebSearchHit[];
    blocked?: boolean;
  }>;
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

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchRequest {
  query: string;
  limit?: number;
  keepOpen?: boolean;
  showBrowser?: boolean;
}

export interface WebSearchResult {
  query: string;
  engine: "yahoo" | "duckduckgo" | "bing";
  results: WebSearchHit[];
  searchedAt: string;
  blocked?: boolean;
  timedOut?: boolean;
  contextBlock: string;
}

export interface PageFetchRequest {
  url: string;
  keepOpen?: boolean;
  showBrowser?: boolean;
}

export interface PageFetchResult {
  url: string;
  title: string;
  text: string;
  fetchedAt: string;
  blocked?: boolean;
  contextBlock: string;
}

/** Text file decoded for chat context (utf8 / pdf / docx / code). */
export interface ChatAttachment {
  id: string;
  name: string;
  text: string;
  truncated: boolean;
  charCount: number;
  /** A picture to be looked at rather than read. Text is empty for these. */
  image?: { path: string; mime: string };
}

/** A file with no path: dropped on the composer, or pasted into it. */
export interface DroppedFile {
  name: string;
  /** The browser's own idea of the type, which a pasted blob may only have. */
  type?: string;
  bytes: Uint8Array;
}

export interface FillCompanyFromWebsiteResult {
  profile: CompanyProfileView;
  sourceUrl: string;
  title: string;
  blocked?: boolean;
  timingMs: number;
}

export type ChatStreamEvent =
  | { kind: "chunk"; sessionId: string; text: string }
  /** Provider reasoning / thinking tokens when exposed. */
  | { kind: "reasoning"; sessionId: string; text: string }
  /** Discard text streamed so far (a tool round replaced it). */
  | { kind: "reset"; sessionId: string }
  | { kind: "done"; sessionId: string; timingMs: number; modelId: string }
  | { kind: "error"; sessionId: string; message: string }
  | {
      kind: "tool";
      sessionId: string;
      name: "web_search";
      status: "start";
      query: string;
    }
  | {
      kind: "tool";
      sessionId: string;
      name: "web_search";
      status: "done";
      query: string;
      resultCount: number;
      blocked?: boolean;
      results: WebSearchHit[];
    }
  /** A generic tool step the chat agent is running (browser.open, doc.create…). */
  | {
      kind: "step";
      sessionId: string;
      label: string;
      status: "start" | "done";
      /** Present-/past-tense sentence for the step (OpenWork-style rendering). */
      present?: string;
      past?: string;
      /** Tool id, so the renderer can pick an icon and group nested steps. */
      name?: string;
      /** A sub-step under the current tool (e.g. a flow's own progress lines). */
      nested?: boolean;
      /** Ground truth from the registry, present on a completed step. */
      ok?: boolean;
    };

export type ToolRisk = "low" | "high";

/** Structured document edit preview (mirrors main/docs DocDiff). */
export type DocDiffView =
  | {
      kind: "sheet";
      sheet: string;
      cells: Array<{
        addr: string;
        before: string | number | boolean | null;
        after: string | number | boolean | null;
      }>;
      summaryRanges?: Array<{ range: string; count: number }>;
      truncated?: boolean;
    }
  | {
      kind: "doc";
      hunks: Array<{ index: number; before: string; after: string }>;
    }
  | {
      kind: "slide";
      changes: Array<{
        index: number;
        action: "add" | "edit" | "reorder" | "image";
        summary: string;
      }>;
    };

export interface ComputerUseRequest {
  text: string;
  maxIterations?: number;
  /** Standing permissions are remembered per conversation. */
  chatId?: string;
  /**
   * What was said just before, so "이거 슬랙으로 보내줘" has an "이거".
   * The task otherwise starts from one sentence and cannot see the answer it
   * is being asked to forward.
   */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

/** A step waiting on a person, in words rather than in tool names. */
export interface TaskApprovalRequestView {
  runId: string;
  callId: string;
  /** The tool behind it, for remembering a standing yes. */
  tool: string;
  /** What is about to happen: "Take a picture of your screen". */
  title: string;
  /** The specifics: a point, a file, the words about to be typed. */
  detail: string;
  risk: string;
}

export type TaskApprovalDecision = "allow_once" | "allow_always" | "deny";

/** Something a step produced that is worth showing rather than describing. */
export interface TaskMediaView {
  runId: string;
  tool: string;
  path: string;
  kind: "image" | "video";
}

/** A document a task made, announced so the app can open it straight away. */
export interface TaskArtifactView {
  runId: string;
  tool: string;
  artifactId: string;
}

export interface ComputerUseResult {
  text: string;
  iterations: number;
  timingMs: number;
  modelId: string;
  taskId: string;
  traceId: string;
  /** The run stopped because a tool is waiting on a person. */
  awaitingApproval: boolean;
  /** Screenshots and recordings the run produced, oldest first. */
  media: TaskMediaView[];
  /** Machine cannot look at the screen (panic stop / unsupported OS). */
  desktopBlocked?: "stopped" | "unsupported";
  /** This run turned Settings → desktop control on. */
  desktopJustEnabled?: boolean;
  /**
   * Replies worth offering as one click, when the run ended by asking rather
   * than by finishing — the people it could not tell apart, for instance.
   */
  options?: string[];
}

export type AuditKind =
  "tool_call" | "approval" | "policy_deny" | "error" | "lifecycle";
export type ApprovalState = "none" | "requested" | "granted" | "denied";

/**
 * One audit row as the renderer sees it. `eventTime` is when it happened and is
 * evidence; `displayTime` is where a replay places it on a timeline. They are
 * separate fields on purpose.
 */
export interface AuditEntryView {
  eventTime: number;
  displayTime: number;
  traceId: string | null;
  taskId: string | null;
  staffMemberId: string | null;
  kind: AuditKind;
  event: string;
  toolName: string | null;
  argsSummary: string;
  resultSummary: string;
  resultBytes: number;
  approvalState: ApprovalState;
  scope: {
    at: number;
    profile?: string;
    allowed?: boolean;
    reason?: string;
  } | null;
}

export type StaffProfilePreset = "full" | "author" | "readonly" | "minimal";
export type ExecSecurityMode = "deny" | "allowlist" | "full";
export type ExecAskMode = "always" | "once" | "off";
export type SandboxMode = "off" | "workspace" | "strict";

export interface ComputerUseSettingsView {
  allowedPaths: string[];
  profile: StaffProfilePreset;
  execSecurity: ExecSecurityMode;
  execAsk: ExecAskMode;
  execAllowlist: string[];
  sandboxMode: SandboxMode;
  elevatedEnabled: boolean;
  readerPass: boolean;
  /** Whether a task may drive this machine's pointer, keyboard and screen. */
  desktopControl: boolean;
  /** Refuse the tools that take the pointer and the foreground. */
  backgroundControl: boolean;
  /** Where `browser.open` sends a page unless a call says otherwise. */
  browserTarget: BrowserTargetMode;
}

export type BrowserTargetMode = "app" | "system";

/** What the machine and the settings between them allow, right now. */
export interface DesktopControlStatusView {
  state: "ready" | "off" | "unsupported" | "stopped";
  /** The mechanism that would be used, when the machine has one. */
  backend: string | null;
  /** Why it is not ready, in words a person can act on. */
  reason: string;
  /** The key combination that stops everything, wherever the focus is. */
  accelerator: string;
}

export type ComputerUseSettingsPatch = Partial<
  Omit<ComputerUseSettingsView, "allowedPaths">
>;

export type ArtifactKind = "jd" | "email" | "report" | "rubric" | "other";
export type ArtifactEncoding = "utf8" | "binary";

/**
 * Text documents chat can hand back. A web page asked for in chat should land
 * on disk as a real .html file, not as markdown that happens to contain tags.
 */
export type ArtifactTextFormat = "md" | "html" | "svg";

export interface TemplateSlotView {
  id: string;
  description: string;
  required: boolean;
}

export interface DraftTemplateRequest {
  templateId: string;
  data: Record<string, string>;
  useModel?: boolean;
  categoryId?: string;
  artifactKind?: ArtifactKind;
  title?: string;
  /** UI locale for slot labels in markdown output */
  locale?: string;
}

export interface DraftTemplateResult {
  templateId: string;
  markdown: string;
  source: "model" | "template";
  modelError?: string;
  artifactId?: string;
  unfilled: string[];
  timingMs: number;
  outputKind?: string;
  contentFile?: string;
}

export interface DocumentFormFieldView {
  label: string;
  value: string;
}

export interface ParsedDocumentView {
  fileType: string;
  markdown: string;
  pageCount?: number;
  title?: string;
  formFields: DocumentFormFieldView[];
}

export interface OpenDocumentForEditResult {
  path: string;
  fileName: string;
  parsed: ParsedDocumentView;
}

export interface SavePatchedDocumentRequest {
  originalPath: string;
  editedMarkdown: string;
  title?: string;
  categoryId?: string;
}

export interface SavePatchedDocumentResult {
  artifactId: string;
  contentFile: string;
  applied: number;
  skippedReasons: string[];
  timingMs: number;
  markdown: string;
}

export interface FillOpenedFormRequest {
  originalPath: string;
  values: Record<string, string>;
  title?: string;
  categoryId?: string;
}

export interface FillOpenedFormResult {
  artifactId: string;
  contentFile: string;
  filledLabels: string[];
  unmatchedLabels: string[];
  timingMs: number;
}

export interface WorkProgressEvent {
  operation: WorkOperation;
  stepId: string;
  status: "active" | "done" | "error";
  detail?: string;
}

/** Incremental slot/field updates for assess / draftJd / draftFromTemplate. */
export type SlotStreamOperation = "assess" | "draftJd" | "draftFromTemplate";

export interface SlotStreamEvent {
  operation: SlotStreamOperation;
  streamTarget: string;
  path: string;
  value: unknown;
}

export interface GenerateRubricRequest {
  jdText: string;
  slug?: string;
  workspaceId?: string;
}

export interface RubricAxisView {
  id: string;
  label: string;
  range: [number, number];
  guidance: string;
}

export interface GenerateRubricResult {
  rubric: {
    id: string;
    version: number;
    axes: RubricAxisView[];
  };
  path: string;
  source: "jd-draft";
  artifactId?: string;
}

export interface ArtifactMeta {
  id: string;
  kind: ArtifactKind;
  title: string;
  categoryId?: string;
  createdAt: string;
  source?: "model" | "template";
  contentFile: string;
  encoding: ArtifactEncoding;
  mimeType?: string;
}

export interface ArtifactView extends ArtifactMeta {
  body: string;
  absolutePath: string;
  /** File revision read with this body; pass it back to reject stale saves. */
  revision: string;
}

export interface BackendInstallProgressEvent {
  kind: "start" | "download" | "extract" | "done" | "error";
  backendId: string;
  percent?: number;
  archiveIndex?: number;
  archiveCount?: number;
  bytesReceived?: number;
  totalBytes?: number | null;
  detail?: string;
}

/** Availability of the Redrob agent engine for first-run onboarding. */
export interface EngineStatusView {
  available: boolean;
  /** How the engine was located: bundled binary, dev checkout, or none. */
  source: "REDROB_CODE_BIN" | "REDROB_CODE_DEV_ROOT" | "PATH";
  /** Branded reason to show when it is not available. */
  reason?: string;
}

/**
 * A connection waiting on someone to approve it in the console.
 *
 * `id` is a local handle, not a credential: the device code that could be
 * exchanged for a key stays in the main process, so a renderer holding this
 * cannot collect the key by itself.
 */
export interface DeviceConnectStartView {
  id: string;
  userCode: string;
  verificationUri: string;
  /** The same page with the code filled in, which is what the app opens. */
  verificationUriComplete: string;
  /** Wall-clock milliseconds, so a countdown does not depend on a local clock offset. */
  expiresAt: number;
  intervalMs: number;
}

/**
 * Where a wait stands. `pending` and `slowDown` mean keep waiting; `unreachable`
 * is worth retrying; the rest are final. `connected` carries the fresh setup
 * snapshot, because by then the key is already stored.
 */
/**
 * What Office can honestly say about credit, which is what the console last told
 * it. There is no balance here: reading one needs a console session, and the app
 * holds a workspace key.
 */
export interface CreditStateView {
  blocked: boolean;
  refusedAt: string | null;
  detail: string | null;
}

export type DeviceConnectPollView =
  | { status: "pending" }
  | { status: "slowDown" }
  | { status: "connected"; setup: SetupSnapshot }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "unreachable" }
  | { status: "failed"; code: string };

export interface BackendOptionView {
  id: string;
  engine: "cuda" | "vulkan" | "openvino" | "metal";
  installed: boolean;
  /** Bytes to fetch, or null when upstream publishes nothing for this target. */
  downloadBytes: number | null;
  requirements: string;
  unavailableReason: string | null;
  supportsVision: boolean;
}

/** The llama-server backends this machine can run, and which one is installed. */
export interface BackendStatusView {
  ready: boolean;
  recommendedId: string | null;
  detectionChain: string;
  activeId: string | null;
  binaryPath: string | null;
  installDir: string;
  options: BackendOptionView[];
  overridePath: string | null;
}

export interface DocumentSummary {
  id: string;
  path: string;
  schemaId: string;
  extractedAt: string;
  fieldCount: number;
}

export interface AssessRequest {
  workspaceId: string;
  documentId: string;
  rubricId: string;
}

export interface ScreenRankRequest {
  query: string;
  k: number;
  schemaId?: string;
}

export interface VerifyRequest {
  workspaceId: string;
  candidateDocumentId: string;
  certificateText: string;
}

export interface PublishRequest {
  documentId: string;
  rubricScoresText?: string;
  recommendation?: string;
  risks?: string;
  locale?: "en" | "ko";
}

export interface DraftJdRequest {
  roleTitle: string;
  responsibilities: string;
  qualifications: string;
  location?: string;
  maxTokens?: number;
  locale?: string;
}

/** Company boilerplate used when assembling JD drafts. */
export interface CompanyProfileView {
  name: string;
  about: string;
  benefits: string;
  workConditions: string;
  applicationProcess: string;
}

/** Personal + company profile from Settings → Profile. */
export interface DeskProfileView {
  displayName: string;
  jobTitle: string;
  signature: string;
  company: CompanyProfileView;
}

export interface DecisionEmailRequest {
  documentId: string;
  decision: "pass" | "reject";
  roleTitle?: string;
  notes?: string;
  locale?: "en" | "ko";
}

export interface FindingView {
  id: string;
  runId: string;
  rubricId: string;
  ruleId: string;
  severity: string;
  message: string;
}

export type WorkflowEngine = "lookup" | "process" | "review";

export interface WorkflowStepView {
  id: string;
  engine: WorkflowEngine;
  action: string;
  title: string;
  registryId?: string;
  notes?: string;
}

/** When a skill runs on its own, and where it says what it did. */
export interface WorkflowTriggerView {
  type: "manual" | "cron" | "interval" | "event";
  /** Five-field cron line, e.g. `0 9 * * 1-5`. */
  cron?: string;
  intervalMinutes?: number;
  /** The channel the result is posted into; #general when unset. */
  targetChannelId?: string;
  enabled?: boolean;
}

export interface WorkflowView {
  id: string;
  version: number;
  title: string;
  /** When to use this flow, as its author wrote it. Chat reads it to pick one. */
  description?: string;
  /** How to do the work — the skill body chat follows in guide mode. */
  instructions?: string;
  workspaceId: string;
  steps: WorkflowStepView[];
  trigger?: WorkflowTriggerView;
  updatedAt: string;
}

export interface SaveWorkflowRequest {
  workspaceId: string;
  title: string;
  description?: string;
  instructions?: string;
  slug?: string;
  steps: Array<{
    engine: WorkflowEngine;
    action: string;
    title: string;
    registryId?: string;
    notes?: string;
  }>;
  trigger?: WorkflowTriggerView;
}

/** What a skill's schedule has done, for the editor to show. */
export interface WorkflowTriggerStatusView {
  workflowId: string;
  armedAt: string;
  lastRunAt?: string;
  lastStatus?: "ok" | "failed";
  lastSummary?: string;
}

export interface AccountSnapshot {
  signedIn: boolean;
  email: string | null;
  accountId: string | null;
  signedInAt: string | null;
  backupEnabled: boolean;
  backupConsentedAt: string | null;
}

export type DeskBackupResult =
  | { ok: true; path: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string };

export type DeskRestoreResult =
  | { ok: true }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string };

export type ExportSkillResult =
  | { ok: true; path: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string; missingIds?: string[] };

export type ImportSkillConfirmCopy = {
  title: string;
  cancel: string;
  confirm: string;
  messageTemplate: string;
  detailTemplate: string;
};

/** Native dialog labels for destructive confirms (from renderer i18n). */
export type NativeConfirmCopy = {
  title: string;
  message: string;
  detail: string;
  cancel: string;
  confirm: string;
};

export type ImportSkillResult =
  | {
      ok: true;
      workflowId: string;
      workflowTitle: string;
      addedRubrics: string[];
      skippedRubrics: string[];
      renamed: Array<{ from: string; to: string }>;
    }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string; missingIds?: string[] };

export type UpdateStatusEvent =
  | { kind: "checking"; version: string }
  | { kind: "current"; version: string }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; version: string; message: string };

export interface WipeLocalDataCounts {
  documents: number;
  fields: number;
  corrections: number;
  findings: number;
  runs: number;
  chats?: number;
  /** Floor / office channel messages removed. */
  floorMessages?: number;
  /** Library / saved output files removed. */
  artifacts?: number;
}

export type DeskWipeResult =
  | ({ ok: true } & WipeLocalDataCounts)
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string };

export type MemorySource = "manual" | "import";

export interface MemoryView {
  id: string;
  body: string;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummaryView {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  pinned: boolean;
  titleLocked?: boolean;
}

export interface ChatSessionView extends ChatSessionSummaryView {
  /** Serialized UiMessage[] from the chat panel. */
  messages: unknown[];
}

export interface SaveChatSessionRequest {
  id: string;
  title?: string;
  messages: unknown[];
}

export interface ImportMemoriesResult {
  imported: number;
  skipped: number;
}

export interface ImportMemoriesFileResult extends ImportMemoriesResult {
  fileName: string;
}

export type AsrSpeakerKind = "self" | "others";

export interface AsrConsentView {
  id: string;
  at: string;
  speakerKind: AsrSpeakerKind;
}

export interface TranscriptLineView {
  n: number;
  text: string;
  startMs: number;
  endMs: number;
  speaker?: string;
}

export interface TranscriptDocumentView {
  lines: TranscriptLineView[];
  provenance: {
    model: string;
    vadApplied: boolean;
    vadModel: string;
    origin: "local";
    speechRatio?: number;
    vadThreshold?: number;
  };
  consentId?: string;
}

export interface AsrBatchItemView {
  id: string;
  state: "queued" | "running" | "done" | "error";
  createdAt: string;
  updatedAt: string;
  sourcePath: string;
  language: string;
  modelTier: "small" | "turbo";
  consentId?: string;
  transcript?: TranscriptDocumentView;
  error?: string;
}

export type RuntimeFallbackNotice = {
  code: string;
  detail: string;
  at: string;
  source: "inference" | "asr";
};

export type AsrInstallStep = "cli" | "model-small" | "model-turbo";

export interface AsrSetupStatus {
  modelsDir: string;
  binaryPath: string | null;
  binaryReady: boolean;
  smallModelPath: string | null;
  smallModelReady: boolean;
  turboModelPath: string | null;
  turboModelReady: boolean;
  recommendedTier: "small" | "turbo";
  ready: boolean;
  platformSupported: boolean;
  cliAssetName: string | null;
}

export interface AsrInstallProgressEvent {
  kind: "start" | "download" | "extract" | "ready" | "done" | "error";
  step?: AsrInstallStep;
  percent?: number;
  bytesReceived?: number;
  totalBytes?: number | null;
  detail?: string;
}

// ------------------------------------------------------------------- Floor

export type FloorDirectiveKind = "STEER" | "ABORT" | "PIN";
export type FloorSeatState =
  "idle" | "working" | "blocked" | "waiting-approval" | "parked";
export type FloorMessageType =
  "REQUEST" | "DELIVER" | "CHALLENGE" | "ESCALATE" | "BLOCK";

export interface FloorSeatView {
  staffId: string;
  role: string;
  layer: string;
  host: "local" | "remote";
  state: FloorSeatState;
  taskId: string | null;
  taskTitle: string | null;
  /** The work this seat is on, so it can be stopped from where it is shown. */
  traceId: string | null;
  lastMessageType: string | null;
  tokensToday: number;
  /** The instructions this seat works to. Shown when editing a hired seat. */
  personality: string;
  /** True for a seat a person hired, so the UI knows what it may change. */
  custom: boolean;
  /** True while a model call for this seat is actually in flight. */
  typing: boolean;
}

/** A Slack-shaped channel: a name people type after a `#`, and who is in it. */
export interface FloorChannel {
  id: string;
  name: string;
  purpose: string;
  createdAt: number;
  updatedAt: number;
  /** The starting channel. Neither renamable nor deletable. */
  system: boolean;
  /** Teammate ids. A DM is `memberIds.length === 1`. */
  memberIds: string[];
  /** Who answers when there is no @mention. */
  defaultMemberId: string;
  /** A one-to-one chat with a person, addressed `dm-<member>`. */
  isDM: boolean;
}

export type ChannelEventType =
  | "message"
  | "progress"
  | "approval"
  | "artifact"
  | "delegate"
  | "system";

export interface ChannelEventView {
  id: string;
  channelId: string;
  authorId: string;
  type: ChannelEventType;
  payload: Record<string, unknown>;
  ts: number;
}

/** How far a teammate's hands reach. Replaces the old job-bundle presets. */
export type ToolPermissionView = "read" | "write" | "full";

export interface TeamMemberView {
  id: string;
  name: string;
  persona: string;
  toneHints: string;
  permission: ToolPermissionView;
  createdAt: number;
  updatedAt: number;
  builtin: boolean;
  /** False once removed. Kept so old messages still show a name and a face. */
  active: boolean;
}

export interface ChannelMemoryView {
  id: string;
  memberId: string;
  channelId: string;
  kind: "channel" | "shared";
  content: string;
  createdAt: number;
}

/** The jobs a hired colleague can be given. Decides tools, gates and budget. */
export const FLOOR_STAFF_LAYERS = [
  "research",
  "editorial",
  "review",
  "production",
] as const;

export type FloorStaffLayer = (typeof FLOOR_STAFF_LAYERS)[number];

export interface FloorHiredStaff {
  id: string;
  role: string;
  layer: FloorStaffLayer;
  personality: string;
  createdAt: number;
  updatedAt: number;
}

export interface FloorChannelEvidence {
  label: string;
  locator: string;
}

export interface FloorChannelArtifact {
  kind: string;
  ref: string;
  label: string;
  /** Set once the file is in the library and the card can open it. */
  artifactId: string | null;
}

/** One line in the office channel: a typed message, or a note about the Floor. */
export interface FloorChannelPost {
  id: string;
  kind: "message" | "system";
  channelId: string;
  type: string;
  from: string;
  to: string;
  origin: "human" | "staff" | "system";
  body: string;
  detail: string;
  evidence: FloorChannelEvidence[];
  artifact: FloorChannelArtifact | null;
  options: string[];
  createdAt: number;
  notBefore: number;
  pending: boolean;
  traceId: string;
  meetingId: string | null;
  /**
   * Set on a progress note, and null on everything else. Structured rather
   * than a sentence so the channel can say it in the reader's language.
   */
  progress: FloorChannelProgress | null;
}

/** What a colleague is in the middle of, while a turn is still running. */
export interface FloorChannelProgress {
  activity: string;
  /** The file, query or command, when there is one worth naming. */
  target: string;
  elapsedMs: number;
  /**
   * The colleague telling the room what they are starting, which stays in the
   * channel as a line they said. False for the periodic "still going", which is
   * a status the next one replaces.
   */
  spoken: boolean;
}

export interface FloorMeetingView {
  id: string;
  topic: string;
  round: number;
  maxRounds: number;
  state: "open" | "escalated" | "closed";
  participants: string[];
  outcome: string | null;
}

export interface FloorAgendaItem {
  id: string;
  label: string;
  staffId: string;
  kind: "scheduled" | "carried-block";
}

export interface FloorTrayItemView {
  id: string;
  /** The channel whose work raised this, so a card lands in one room. */
  channelId: string;
  headline: string;
  kind: string;
  evidence: string[];
  dissent: string | null;
  options: string[];
  createdAt: number;
}

export interface FloorSnapshotView {
  now: number;
  paused: boolean;
  productionHalted: boolean;
  channels: FloorChannel[];
  seats: FloorSeatView[];
  meetings: FloorMeetingView[];
  agenda: FloorAgendaItem[];
  tray: {
    pending: number;
    threshold: number;
    overflowing: boolean;
    items: FloorTrayItemView[];
  };
  meter: {
    tokens: number;
    budget: number;
    ratio: number;
    lightsOut: boolean;
  };
  wall: { costMicros: number; gatePassRate: number; reworkRate: number };
  queue: { pending: number; inFlight: number; done: number };
  directives: Array<{
    id: string;
    kind: FloorDirectiveKind;
    body: string;
    appliesFrom: number;
  }>;
  interruptions: Array<{
    from: number;
    to: number | null;
    cause: string;
    note: string;
  }>;
}

export type FloorSubmitResult =
  { ok: true; taskId: string; traceId: string } | { ok: false; reason: string };

export type FloorDirectiveResult =
  | { ok: true; appliesFrom: number; etaMinutes: number }
  | { ok: false; reason: string };

export type FloorChannelResult =
  { ok: true; channel: FloorChannel } | { ok: false; reason: string };

export type FloorStaffResult =
  { ok: true; staff: FloorHiredStaff } | { ok: false; reason: string };

export type FloorActionResult = { ok: true } | { ok: false; reason: string };

export interface FloorBriefView {
  generatedAt: number;
  dayIndex: number;
  banner: string | null;
  shipped: string[];
  approvals: Array<{
    id: string;
    line: string;
    evidence: string[];
    dissent: string | null;
  }>;
  blocked: Array<{
    taskId: string | null;
    reason: string;
    unblockCondition: string;
  }>;
  spend: {
    tokens: number;
    budget: number;
    costMicros: number;
  };
  anomalies: Array<{ signal: string; detail: string }>;
  handoff: {
    scheduled: number;
    completed: number;
    interruptions: Array<{
      from: string;
      to: string | null;
      cause: string;
      note: string;
    }>;
    summary: string;
  };
}

export interface FloorTimelineEntry {
  /** Real wall-clock time the event happened. Never a presentation time. */
  eventTime: number;
  kind: string;
  summary: string;
  traceId?: string;
  taskId?: string;
  staffId?: string;
  messageId?: string;
  detail?: Record<string, unknown>;
}

export interface OfficeApi {
  getAppVersion: () => Promise<string>;
  getPlatform: () => NodeJS.Platform;
  getDeviceProfile: () => Promise<DeviceProfile>;
  getLocalCapability: () => Promise<LocalCapability>;
  getExecutionPlan: () => Promise<ExecutionPlanView>;
  getTierModels: () => Promise<Record<string, string>>;
  getWorkspaces: () => Promise<readonly WorkspaceDef[]>;
  listFindings: (limit?: number) => Promise<FindingView[]>;
  listDocuments: (schemaId?: string) => Promise<DocumentSummary[]>;
  listRubricChoices: () => Promise<string[]>;
  correctField: (input: CorrectFieldRequest) => Promise<unknown>;
  acceptField: (fieldId: string) => Promise<unknown>;
  extractText: (content: string, schemaId: string) => Promise<unknown>;
  pickIntakeFolder: () => Promise<string | null>;
  runIntakeBatch: (input: IntakeBatchRequest) => Promise<IntakeBatchResult>;
  runRecruitingPipeline: (
    input: RecruitingPipelineInput,
  ) => Promise<RecruitingPipelineResult>;
  cancelWork: () => Promise<boolean>;
  compareStructured: (data: unknown, rubricId: string) => Promise<unknown>;
  runAssess: (input: AssessRequest) => Promise<unknown>;
  runScreenRank: (input: ScreenRankRequest) => Promise<unknown>;
  runVerify: (input: VerifyRequest) => Promise<unknown>;
  runPublish: (input: PublishRequest) => Promise<unknown>;
  draftJd: (input: DraftJdRequest) => Promise<unknown>;
  draftDecisionEmail: (input: DecisionEmailRequest) => Promise<unknown>;
  generate: (
    templateId: string,
    data: unknown,
    locale?: string,
  ) => Promise<unknown>;
  generateRubric: (
    input: GenerateRubricRequest,
  ) => Promise<GenerateRubricResult>;
  listRubrics: () => Promise<string[]>;
  listArtifacts: (kind?: ArtifactKind) => Promise<ArtifactMeta[]>;
  getArtifact: (id: string) => Promise<ArtifactView | null>;
  createArtifact: (input: {
    title: string;
    body: string;
    kind?: ArtifactKind;
    /** Extension to keep the document under, when it is not markdown. */
    format?: ArtifactTextFormat;
  }) => Promise<ArtifactView>;
  updateArtifact: (input: {
    id: string;
    body: string;
    title?: string;
    baseRevision?: string;
  }) => Promise<ArtifactView>;
  updateSpreadsheetArtifact: (input: {
    id: string;
    sheet: string;
    changes: Array<{ row: number; column: number; value: string }>;
    baseRevision?: string;
  }) => Promise<ArtifactView>;
  createDocument: (input: {
    format: "md" | "docx" | "xlsx" | "pptx";
    title?: string;
  }) => Promise<ArtifactView>;
  deleteArtifact: (id: string) => Promise<boolean>;
  revealArtifactsFolder: () => Promise<boolean>;
  /** Native file picker. Only formats the app can draw itself are accepted. */
  importDocument: () => Promise<ArtifactView | null>;
  /** The document reduced to something the app draws itself, no office suite. */
  docRenderModel: (path: string) => Promise<DocRenderModel>;
  exportDocumentPdf: (input: {
    path: string;
    suggestedName?: string;
  }) => Promise<
    { ok: true; path: string } | { ok: false; reason: string } | null
  >;
  duplicateDocument: (id: string, suffix?: string) => Promise<ArtifactView>;
  openDocumentExternally: (path: string) => Promise<boolean>;
  /**
   * Put a written page on a local HTTP server and return the URL that opens it.
   *
   * The address is loopback-only and lives as long as the app does; it is a way
   * to open the page in a real browser, not a way to publish it.
   */
  servePageLocally: (path: string) => Promise<{ url: string }>;
  /** A tool writes to this file, so the preview refreshes when it changes. */
  watchDocument: (path: string) => Promise<boolean>;
  unwatchDocument: (path: string) => Promise<boolean>;
  onDocReloaded: (
    listener: (payload: {
      path: string;
      sessionId?: string;
      format?: "xlsx" | "docx" | "pptx";
    }) => void,
  ) => () => void;
  /** Fired after Settings → clear local documents succeeds. */
  onLocalDataWiped: (
    listener: (payload: {
      documents: number;
      fields: number;
      chats?: number;
      floorMessages?: number;
      artifacts?: number;
    }) => void,
  ) => () => void;
  listWorkflows: (workspaceId?: string) => Promise<WorkflowView[]>;
  saveWorkflow: (
    input: SaveWorkflowRequest,
  ) => Promise<{ workflow: WorkflowView; path: string }>;
  /** What each scheduled skill has done so far, newest run per skill. */
  workflowTriggerStatus: () => Promise<WorkflowTriggerStatusView[]>;
  exportSkill: (
    workflowId: string,
    options?: { description?: string; author?: string },
  ) => Promise<ExportSkillResult>;
  importSkill: (confirm: ImportSkillConfirmCopy) => Promise<ImportSkillResult>;
  /** Open an https URL in the system browser. */
  openExternal: (url: string) => Promise<boolean>;
  /**
   * Open Desk's embedded Chromium browser, run a DuckDuckGo search,
   * and return scraped organic results (not a robots crawl).
   */
  webSearch: (input: WebSearchRequest) => Promise<WebSearchResult>;
  closeWebSearch: () => Promise<boolean>;
  showWebSearch: () => Promise<boolean>;
  fetchPage: (input: PageFetchRequest) => Promise<PageFetchResult>;
  /** Open a multi-file picker and decode text/PDF/DOCX for chat context. */
  pickChatAttachments: () => Promise<ChatAttachment[]>;
  /** Same, for files that came in by drop or paste and so have no path. */
  attachFiles: (files: DroppedFile[]) => Promise<ChatAttachment[]>;
  fillCompanyFromWebsite: (
    url: string,
  ) => Promise<FillCompanyFromWebsiteResult>;
  getDefaultWorkflowDraft: (
    workspaceId?: string,
    locale?: "en" | "ko",
  ) => Promise<SaveWorkflowRequest>;
  listWorkflowPresets: (
    workspaceId?: string,
    locale?: "en" | "ko",
  ) => Promise<SaveWorkflowRequest[]>;
  getTelemetryPreview: (count?: number) => Promise<unknown[]>;
  getTelemetryOptIn: () => Promise<boolean>;
  setTelemetryOptIn: (optedIn: boolean) => Promise<boolean>;
  getMeasurements: () => Promise<MeasuredTiming[]>;
  wipeLocalData: (confirm?: NativeConfirmCopy) => Promise<DeskWipeResult>;
  revealLogsFolder: () => Promise<boolean>;
  getUpdateStatus: () => Promise<UpdateStatusEvent | null>;
  checkForUpdates: () => Promise<UpdateStatusEvent>;
  installUpdate: () => Promise<boolean>;
  onUpdateStatus: (listener: (event: UpdateStatusEvent) => void) => () => void;
  getSetupSnapshot: () => Promise<SetupSnapshot>;
  applySetup: (decision: SetupDecision) => Promise<unknown>;
  /** Fetch the weights the selected grade runs on. Reports on `onSetupProgress`. */
  downloadGradeWeights: () => Promise<SetupSnapshot>;
  onSetupProgress: (
    listener: (event: SetupProgressEvent) => void,
  ) => () => void;
  onWorkProgress: (listener: (event: WorkProgressEvent) => void) => () => void;
  onSlotStream: (listener: (event: SlotStreamEvent) => void) => () => void;
  onIntakeProgress: (
    listener: (event: IntakeProgressEvent) => void,
  ) => () => void;
  onRecruitingPipelineProgress: (
    listener: (event: RecruitingPipelineProgress) => void,
  ) => () => void;
  onChatStream: (listener: (event: ChatStreamEvent) => void) => () => void;
  runChat: (input: ChatRequest) => Promise<ChatResult>;
  runTask: (input: ComputerUseRequest) => Promise<ComputerUseResult>;
  abortTask: (runId?: string) => Promise<boolean>;
  /**
   * Load a screenshot/recording from disk as a data URL. Needed because the
   * Vite renderer is http:// and cannot paint file:// paths.
   */
  readLocalMedia: (
    path: string,
  ) => Promise<{ dataUrl: string; mime: string } | null>;
  resolveTaskApproval: (input: {
    callId: string;
    decision: TaskApprovalDecision;
  }) => Promise<boolean>;
  onTaskApprovalRequest: (
    handler: (request: TaskApprovalRequestView) => void,
  ) => () => void;
  onTaskMedia: (handler: (media: TaskMediaView) => void) => () => void;
  onTaskArtifact: (handler: (item: TaskArtifactView) => void) => () => void;
  getAllowedPaths: () => Promise<string[]>;
  addAllowedPath: (path: string) => Promise<string[]>;
  removeAllowedPath: (path: string) => Promise<string[]>;
  pickAllowedFolder: () => Promise<string | null>;
  getComputerUseSettings: () => Promise<ComputerUseSettingsView>;
  desktopControlStatus: () => Promise<DesktopControlStatusView>;
  /** Stops everything and turns control off, so nothing resumes by itself. */
  desktopStopNow: () => Promise<boolean>;
  desktopResume: () => Promise<boolean>;
  updateComputerUseSettings: (
    patch: ComputerUseSettingsPatch,
  ) => Promise<ComputerUseSettingsView>;
  listToolAudit: (limit?: number) => Promise<AuditEntryView[]>;
  floorSnapshot: () => Promise<FloorSnapshotView>;
  floorChannel: (
    channelId?: string,
    sinceCreatedAt?: number,
  ) => Promise<FloorChannelPost[]>;
  /**
   * The only way work enters the office: say what you want in plain words.
   *
   * `to` is a seat a person named themselves, which skips the lead - there is
   * nothing left to assign. Left out, the lead decides who does what.
   */
  floorSay: (
    text: string,
    channelId?: string,
    to?: string,
    /** Attached file text, marked untrusted. Goes to the seat, not the channel. */
    attached?: string,
  ) => Promise<FloorSubmitResult>;
  floorCreateChannel: (input: {
    name: string;
    purpose: string;
    memberIds?: string[];
    defaultMemberId?: string;
  }) => Promise<FloorChannelResult>;
  floorUpdateChannel: (
    id: string,
    patch: {
      name?: string;
      purpose?: string;
      memberIds?: string[];
      defaultMemberId?: string;
    },
  ) => Promise<FloorChannelResult>;
  /** The one-to-one chat with a teammate, opened from their name. */
  ensureDmChannel: (memberId: string) => Promise<FloorChannelResult>;
  inviteToChannel: (
    channelId: string,
    memberIds: string[],
  ) => Promise<FloorChannelResult>;
  removeFromChannel: (
    channelId: string,
    memberId: string,
  ) => Promise<FloorChannelResult>;
  floorDeleteChannel: (id: string) => Promise<FloorActionResult>;
  floorHireStaff: (input: {
    role: string;
    layer: FloorStaffLayer;
    personality: string;
  }) => Promise<FloorStaffResult>;
  floorUpdateStaff: (
    id: string,
    patch: { role?: string; layer?: FloorStaffLayer; personality?: string },
  ) => Promise<FloorStaffResult>;
  floorDismissStaff: (id: string) => Promise<FloorActionResult>;
  floorResolveApproval: (
    id: string,
    approved: boolean,
    decision: string,
  ) => Promise<{ ok: boolean; pending: number }>;
  floorDirective: (input: {
    kind: FloorDirectiveKind;
    body: string;
    traceId?: string;
  }) => Promise<FloorDirectiveResult>;
  floorBrief: (
    regenerate?: boolean,
  ) => Promise<{ brief: FloorBriefView; markdown: string }>;
  onFloorUpdate: (
    listener: (snapshot: FloorSnapshotView) => void,
  ) => () => void;
  channelEvents: (
    channelId?: string,
    sinceTs?: number,
  ) => Promise<ChannelEventView[]>;
  listTeamMembers: () => Promise<TeamMemberView[]>;
  generatePersona: (
    prompt: string,
    locale?: string,
  ) => Promise<{
    name: string;
    persona: string;
    tone: string;
    permission: ToolPermissionView;
  }>;
  addTeamMember: (input: {
    name: string;
    persona: string;
    toneHints?: string;
    permission?: ToolPermissionView;
  }) => Promise<
    { ok: true; member: TeamMemberView } | { ok: false; reason: string }
  >;
  updateTeamMember: (
    id: string,
    patch: {
      name?: string;
      persona?: string;
      toneHints?: string;
      permission?: ToolPermissionView;
    },
  ) => Promise<
    { ok: true; member: TeamMemberView } | { ok: false; reason: string }
  >;
  /** Takes their one-to-one chat with them and drops them from every room. */
  removeTeamMember: (
    id: string,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  listChannelMemories: (input: {
    channelId: string;
    memberId?: string;
    includeShared?: boolean;
  }) => Promise<ChannelMemoryView[]>;
  addChannelMemory: (input: {
    channelId: string;
    memberId: string;
    content: string;
  }) => Promise<ChannelMemoryView>;
  promoteChannelMemory: (
    id: string,
    channelId: string,
  ) => Promise<ChannelMemoryView | null>;
  prepareChannelSend: (input: {
    text: string;
    channelId?: string;
    to?: string;
  }) => Promise<
    | {
        ok: true;
        channelId: string;
        to: string;
        viaChat: boolean;
        /** Id of the appended user event, so a regenerate can prune from here. */
        userEventId: string;
      }
    | { ok: false; reason: string }
  >;
  appendChannelAssistant: (input: {
    channelId: string;
    authorId: string;
    text: string;
  }) => Promise<void>;
  /**
   * Drop the events that follow a user line in a channel's shared log, keeping
   * that line. Used when an answer is regenerated so the superseded replies do
   * not resurface on the next poll and re-corrupt the saved chat.
   */
  truncateChannelEventsAfter: (input: {
    channelId: string;
    eventId: string;
  }) => Promise<number>;
  listMemories: () => Promise<MemoryView[]>;
  addMemory: (body: string) => Promise<MemoryView>;
  updateMemory: (id: string, body: string) => Promise<MemoryView>;
  deleteMemory: (id: string) => Promise<boolean>;
  importMemories: (
    text: string,
    fileName?: string,
  ) => Promise<ImportMemoriesResult>;
  importMemoriesFromFile: () => Promise<ImportMemoriesFileResult | null>;
  listChatSessions: () => Promise<ChatSessionSummaryView[]>;
  getChatSession: (id: string) => Promise<ChatSessionView | null>;
  saveChatSession: (
    input: SaveChatSessionRequest,
  ) => Promise<ChatSessionSummaryView>;
  renameChatSession: (
    id: string,
    title: string,
  ) => Promise<ChatSessionSummaryView>;
  /** Soft, non-locking title from the auto-titler; null if the session is gone. */
  autotitleChatSession: (
    id: string,
    title: string,
  ) => Promise<ChatSessionSummaryView | null>;
  setChatSessionPinned: (
    id: string,
    pinned: boolean,
  ) => Promise<ChatSessionSummaryView>;
  deleteChatSession: (id: string) => Promise<boolean>;
  getTemplateSlots: (
    templateId: string,
    locale?: string,
  ) => Promise<TemplateSlotView[]>;
  draftFromTemplate: (
    input: DraftTemplateRequest,
  ) => Promise<DraftTemplateResult>;
  pickDocumentFile: () => Promise<string | null>;
  openDocumentForEdit: (path: string) => Promise<OpenDocumentForEditResult>;
  savePatchedDocument: (
    input: SavePatchedDocumentRequest,
  ) => Promise<SavePatchedDocumentResult>;
  fillOpenedForm: (
    input: FillOpenedFormRequest,
  ) => Promise<FillOpenedFormResult>;
  saveRemoteCredentials: (input: {
    baseUrl: string;
    apiKey: string;
  }) => Promise<unknown>;
  saveGpuPreference: (preference: GpuPreference) => Promise<SetupSnapshot>;
  saveLlmSettings: (input: {
    inferenceRoute?: InferenceRouteMode;
    chatRoute?: ChatRouteMode;
    /** Local weight grade; JSON key kept for compatibility. */
    chatQualityMode?: ModelGrade;
    webSearchEnabled?: boolean;
    llmProviders?: LlmProviderSecretsView;
  }) => Promise<SetupSnapshot>;
  getAccountSnapshot: () => Promise<AccountSnapshot>;
  signInForBackup: (email: string) => Promise<AccountSnapshot>;
  signOutAccount: () => Promise<AccountSnapshot>;
  setBackupOptIn: (enabled: boolean) => Promise<AccountSnapshot>;
  createLocalBackup: () => Promise<DeskBackupResult>;
  restoreLocalBackup: (
    confirm?: NativeConfirmCopy,
  ) => Promise<DeskRestoreResult>;
  getCompanyProfile: () => Promise<CompanyProfileView>;
  saveCompanyProfile: (
    profile: CompanyProfileView,
  ) => Promise<CompanyProfileView>;
  getDeskProfile: () => Promise<DeskProfileView>;
  saveDeskProfile: (profile: DeskProfileView) => Promise<DeskProfileView>;
  pickAudioFile: () => Promise<string | null>;
  recordAsrConsent: (input: {
    speakerKind: AsrSpeakerKind;
    acknowledgedPlaceholders: boolean;
  }) => Promise<AsrConsentView>;
  listAsrBatch: () => Promise<AsrBatchItemView[]>;
  startAsrBatchItem: (input: {
    sourcePath: string;
    language?: string;
    consentId: string;
    speakerKind: AsrSpeakerKind;
  }) => Promise<AsrBatchItemView>;
  waitAsrBatchItem: (id: string) => Promise<AsrBatchItemView>;
  getRuntimeFallbackNotices: () => Promise<RuntimeFallbackNotice[]>;
  /** llama-server backends: what this machine needs and what it already has. */
  getBackendStatus: () => Promise<BackendStatusView>;
  installBackend: (backendId: string) => Promise<BackendStatusView>;
  removeBackend: (backendId: string) => Promise<BackendStatusView>;
  onBackendInstallProgress: (
    listener: (event: BackendInstallProgressEvent) => void,
  ) => () => void;
  /** Availability of the agent engine (bundled); gates first-run onboarding. */
  getEngineStatus: () => Promise<EngineStatusView>;
  /**
   * Ask console.redrob.ai for a connection code, so a workspace key can be
   * issued to this PC without anyone copying one. Paste stays available.
   */
  startDeviceConnect: () => Promise<DeviceConnectStartView>;
  /** Ask whether the code has been approved yet. Stores the key on success. */
  pollDeviceConnect: (id: string) => Promise<DeviceConnectPollView>;
  /** Stop waiting on a connection, so the app is not holding a live code. */
  cancelDeviceConnect: (id: string) => Promise<boolean>;
  /** Whether the console last refused a request for want of credit. */
  getCreditState: () => Promise<CreditStateView>;
  /**
   * Forget that refusal, on the person's word that they have paid. This is not a
   * claim that a payment settled: the next request is what proves it.
   */
  clearCreditBlock: () => Promise<CreditStateView>;
  getAsrSetupStatus: () => Promise<AsrSetupStatus>;
  installAsrPack: (options?: {
    includeTurbo?: boolean;
  }) => Promise<AsrSetupStatus>;
  onAsrInstallProgress: (
    listener: (event: AsrInstallProgressEvent) => void,
  ) => () => void;
  /** Push-to-talk: PCM16 LE mono 16kHz base64 → transcript text (VAD+ASR). */
  voiceTranscribePcm: (input: {
    pcmBase64: string;
    language?: string;
  }) => Promise<{ text: string; model: string }>;
  dayLogCapabilities: () => Promise<DayLogCapabilities>;
  getActiveDayLog: () => Promise<DayLogSession | null>;
  startDayLog: (input?: DayLogStartRequest) => Promise<DayLogSession>;
  stopDayLog: () => Promise<DayLogSession>;
  finalizeDayLog: () => Promise<DayLogSession>;
  listDayLogs: () => Promise<DayLogSession[]>;
  // MCP Management
  listMcpServers: () => Promise<McpServerView[]>;
  addMcpServer: (
    config: Omit<McpServerConfig, "id"> & { id?: string },
  ) => Promise<McpServerView>;
  updateMcpServer: (
    id: string,
    updates: Partial<Omit<McpServerConfig, "id">>,
  ) => Promise<McpServerView | null>;
  removeMcpServer: (id: string) => Promise<boolean>;
  connectMcpServer: (id: string) => Promise<McpServerView | null>;
  disconnectMcpServer: (id: string) => Promise<McpServerView | null>;
  listMcpTools: () => Promise<McpToolView[]>;
}

export type DayLogVisionRoute = "local" | "cloud";

export type DayLogSessionStatus =
  "recording" | "stopped" | "summarizing" | "done" | "error";

export interface DayLogCapture {
  id: string;
  at: string;
  path: string;
  bytes: number;
}

export interface DayLogSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  intervalMs: number;
  visionRoute: DayLogVisionRoute;
  status: DayLogSessionStatus;
  captures: DayLogCapture[];
  reportMarkdown?: string;
  error?: string;
  deleteCapturesAfterReport: boolean;
  captureFailures?: number;
  lastCaptureError?: string;
  /** An OS notification per capture; the window is never raised. */
  notifyOnCapture: boolean;
  locale: "en" | "ko";
}

export interface DayLogStartRequest {
  intervalMs?: number;
  visionRoute?: DayLogVisionRoute;
  deleteCapturesAfterReport?: boolean;
  /** Session-scoped cloud consent; required when visionRoute is cloud. Not sticky. */
  cloudOptIn?: boolean;
  /** Defaults on. Notifications only — capture never focuses the window. */
  notifyOnCapture?: boolean;
  locale?: "en" | "ko";
}

export interface DayLogCapabilities {
  cloudReady: boolean;
  localReady: boolean;
  /** When local is unavailable; often ERR_VISION_NO_CUDA… */
  localDisabledReason?: string | null;
}
