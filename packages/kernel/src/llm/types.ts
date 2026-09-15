/**
 * App-wide inference routing: local, Redrob Remote, or third-party cloud.
 * Cloud field-fill has no logprobs — confidence is forced low (needs review).
 */

export type CloudProviderId = "openai" | "openrouter" | "anthropic";

/** Where unconstrained / structured inference should run. */
export type InferenceRouteMode = "auto" | "local" | CloudProviderId;

/** @deprecated Use InferenceRouteMode */
export type ChatRouteMode = InferenceRouteMode;

export type InferenceWorkloadKind =
  "chat" | "draft" | "fieldFill" | "hardJudge";

/** @deprecated Use InferenceWorkloadKind */
export type ChatWorkloadKind = InferenceWorkloadKind;

export interface LlmProviderCredential {
  apiKey: string;
  /** Optional OpenAI-compatible base URL override (OpenAI). */
  baseUrl?: string;
}

export type LlmProviderSecrets = Partial<
  Record<CloudProviderId, LlmProviderCredential>
>;

export interface InferenceRouteRequest {
  mode: InferenceRouteMode;
  providers: LlmProviderSecrets;
  localAvailable: boolean;
  /** Redrob Remote credentials present (logprobs-capable cloud). */
  redrobAvailable?: boolean;
  workload: {
    kind: InferenceWorkloadKind;
    /** Latest user / document text for thinking heuristics. */
    text: string;
  };
  /**
   * This workload sends pictures. Work that drives a screen has to see one,
   * and the cheap default is text-only on some providers — which does not
   * fail, it leaves the model guessing where to click.
   */
  needsVision?: boolean;
  /** Absolute override — skips needsThinking when set. */
  thinkingOverride?: boolean;
  /**
   * Use this cloud model instead of the provider's default.
   *
   * Vision still picks its own: a text-only override cannot be handed work
   * that has to look at a screen.
   */
  cloudModel?: string;
}

/** @deprecated Use InferenceRouteRequest */
export type ChatRouteRequest = InferenceRouteRequest;

export type InferenceProviderId = "local" | "redrob_remote" | CloudProviderId;

export interface InferenceRouteDecision {
  provider: InferenceProviderId;
  model: string;
  thinking: boolean;
  reason: string;
  /** True when provider cannot return real logprobs. */
  confidenceDegraded: boolean;
}

/** @deprecated Use InferenceRouteDecision */
export type ChatRouteDecision = InferenceRouteDecision;

/** JSON-schema parameters for a function tool (OpenAI / Anthropic). */
export interface CloudToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object for the tool arguments. */
  parameters: Record<string, unknown>;
}

export interface CloudToolCall {
  id: string;
  name: string;
  /** JSON string of arguments. */
  arguments: string;
}

/**
 * Unified chat messages including tool rounds.
 * OpenAI `tool` role and Anthropic `tool_result` are both represented as role:"tool".
 * User content may be multimodal parts for vision-capable cloud models.
 */
export type CloudChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type CloudChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | CloudChatContentPart[] }
  | { role: "assistant"; content: string; toolCalls?: CloudToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface CloudChatRequest {
  provider: CloudProviderId;
  credential: LlmProviderCredential;
  model: string;
  messages: CloudChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Prefer provider reasoning / think modes when supported. */
  thinking?: boolean;
  tools?: CloudToolDefinition[];
  /** Default auto when tools are present. */
  toolChoice?: "auto" | "none" | "required";
  /**
   * GBNF the sampler must obey, so a malformed answer cannot be produced rather
   * than being caught after the fact.
   *
   * Only llama-server understands this, so it is sent for a loopback base URL
   * and dropped for every hosted provider - the callers that need a guarantee
   * are the ones driving a small local model, and a hosted model that keeps its
   * own contract does not need the sampler held. It cannot be combined with
   * `tools`: a constrained answer has no room for a tool call.
   */
  grammar?: string;
  /**
   * The answer has to be one JSON object, held by the provider rather than asked
   * for in words.
   *
   * This is the hosted half of `grammar`. A GBNF only means something to
   * llama-server, so a caller that needed a shape got a guarantee locally and a
   * polite request in the cloud - and a hosted model answering a complaint in
   * prose is exactly the failure that produced. Sent alongside the grammar and
   * under the same rule: never with tools, because a constrained answer has no
   * room for a tool call.
   */
  jsonOnly?: boolean;
  onTextChunk?: (chunk: string) => void;
  /** Provider chain-of-thought / reasoning tokens when exposed. */
  onReasoningChunk?: (chunk: string) => void;
}

export interface CloudChatResult {
  text: string;
  timingMs: number;
  modelId: string;
  provider: CloudProviderId;
  toolCalls?: CloudToolCall[];
  finishReason?: "stop" | "tool_calls" | "length" | "error";
  /** Aggregated reasoning / thinking text when the provider exposed it. */
  reasoning?: string;
}

export class LlmProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmProviderError";
  }
}
