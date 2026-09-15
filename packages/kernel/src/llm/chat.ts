import {
  getLlamaServerStatus,
  llamaServerApiKey,
  requireLlamaServerBaseUrl,
} from "../inference/llama-server.js";
import { anthropicChat } from "./anthropic.js";
import { openaiCompatibleChat } from "./openai-compatible.js";
import {
  cloudModelForProvider,
  VISION_MODELS,
  nextCloudFallback,
} from "./route.js";
import type {
  CloudChatMessage,
  CloudChatRequest,
  CloudChatResult,
  CloudProviderId,
  CloudToolDefinition,
  LlmProviderSecrets,
} from "./types.js";
import { LlmProviderError } from "./types.js";

export async function generateCloudChat(
  request: CloudChatRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudChatResult> {
  if (request.provider === "anthropic") {
    return anthropicChat(request, fetchImpl);
  }
  return openaiCompatibleChat(request, fetchImpl);
}

/**
 * Tool-calling chat against the in-process llama-server.
 *
 * Same OpenAI tools wire format the cloud path uses, so OfficeRuntime can
 * treat local and cloud as one TaskModelCall. The server must already be up;
 * callers that own startup (the inference host / Floor binder) ensure that.
 */
export async function generateLocalChatWithTools(
  input: {
    messages: CloudChatMessage[];
    maxTokens?: number;
    temperature?: number;
    thinking?: boolean;
    tools?: CloudToolDefinition[];
    toolChoice?: "auto" | "none" | "required";
    /** GBNF the sampler must obey. Cannot be combined with tools. */
    grammar?: string;
    onTextChunk?: (chunk: string) => void;
    onReasoningChunk?: (chunk: string) => void;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<CloudChatResult> {
  const baseUrl = requireLlamaServerBaseUrl();
  const status = getLlamaServerStatus();
  const result = await openaiCompatibleChat(
    {
      provider: "openai",
      credential: {
        apiKey: llamaServerApiKey(),
        baseUrl: `${baseUrl}/v1`,
      },
      model: status.modelId ?? "local",
      messages: input.messages,
      thinking: Boolean(input.thinking),
      ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.tools ? { tools: input.tools } : {}),
      ...(input.toolChoice ? { toolChoice: input.toolChoice } : {}),
      ...(input.grammar ? { grammar: input.grammar } : {}),
      ...(input.onTextChunk ? { onTextChunk: input.onTextChunk } : {}),
      ...(input.onReasoningChunk ? { onReasoningChunk: input.onReasoningChunk } : {}),
    },
    fetchImpl,
  );
  return {
    ...result,
    modelId: status.modelId ? `local:${status.modelId}` : "local",
  };
}

/** Congestion, not refusal: the same request will work shortly. */
export function isBusy(message: string): boolean {
  return /rate.?limit|429|too many requests|temporarily\s+(?:unavailable|rate)|overloaded|capacity/i.test(
    message,
  );
}

/** Long enough for a per-second pool to refill, short enough to sit through. */
const BUSY_RETRY_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run cloud chat with one fallback hop to the next cheaper configured provider.
 */
export async function generateCloudChatWithFallback(
  input: {
    provider: CloudProviderId;
    model: string;
    thinking: boolean;
    providers: LlmProviderSecrets;
    messages: CloudChatMessage[];
    maxTokens?: number;
    temperature?: number;
    tools?: CloudToolDefinition[];
    toolChoice?: "auto" | "none" | "required";
    /** Passed through, and dropped by providers that cannot compile a GBNF. */
    grammar?: string;
    /** The hosted equivalent: the provider itself holds the answer to JSON. */
    jsonOnly?: boolean;
    onTextChunk?: (chunk: string) => void;
    onReasoningChunk?: (chunk: string) => void;
    /** Called when a failed attempt already streamed text the caller must discard. */
    onStreamReset?: () => void;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<CloudChatResult> {
  let streamedAny = false;
  const sink = input.onTextChunk;
  const onTextChunk = sink
    ? (chunk: string): void => {
        streamedAny = true;
        sink(chunk);
      }
    : undefined;
  const reasoningSink = input.onReasoningChunk;
  const onReasoningChunk = reasoningSink
    ? (chunk: string): void => {
        streamedAny = true;
        reasoningSink(chunk);
      }
    : undefined;

  const attempt = async (provider: CloudProviderId, model: string, thinking: boolean) => {
    const credential = input.providers[provider];
    if (!credential?.apiKey?.trim()) {
      throw new LlmProviderError(`Missing API key for ${provider}`);
    }
    return generateCloudChat(
      {
        provider,
        credential,
        model,
        messages: input.messages,
        thinking,
        ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.tools ? { tools: input.tools } : {}),
        ...(input.toolChoice ? { toolChoice: input.toolChoice } : {}),
        ...(input.grammar ? { grammar: input.grammar } : {}),
        ...(input.jsonOnly ? { jsonOnly: true } : {}),
        ...(onTextChunk ? { onTextChunk } : {}),
        ...(onReasoningChunk ? { onReasoningChunk } : {}),
      },
      fetchImpl,
    );
  };

  try {
    return await attempt(input.provider, input.model, input.thinking);
  } catch (firstError) {
    // A shared pool that is busy this second is usually free the next one, and
    // the provider says so in the error. Hopping to another provider over a
    // moment's congestion loses the model mid-task for no reason.
    if (firstError instanceof LlmProviderError && isBusy(firstError.message)) {
      if (streamedAny) {
        streamedAny = false;
        input.onStreamReset?.();
      }
      await sleep(BUSY_RETRY_MS);
      try {
        return await attempt(input.provider, input.model, input.thinking);
      } catch {
        // Still busy; the provider hop below is the next best thing.
      }
    }
    // Reasoning-only empty replies: one hop with thinking off before provider fallback.
    if (
      input.thinking &&
      firstError instanceof LlmProviderError &&
      /empty content/i.test(firstError.message)
    ) {
      if (streamedAny) {
        streamedAny = false;
        input.onStreamReset?.();
      }
      try {
        return await attempt(input.provider, input.model, false);
      } catch {
        // Fall through to the cheaper-provider hop.
      }
    }
    const next = nextCloudFallback(input.provider, input.providers);
    if (!next) throw firstError;
    const hasImageParts = input.messages.some(
      (message) => message.role === "user" && Array.isArray(message.content),
    );
    const wasVisionModel = Object.values(VISION_MODELS).some(
      (entry) =>
        entry.default === input.model || entry.thinking === input.model,
    );
    const vision = VISION_MODELS[next];
    const model =
      hasImageParts || wasVisionModel
        ? input.thinking
          ? vision.thinking
          : vision.default
        : cloudModelForProvider(next);
    // The failed attempt may have already streamed a partial answer. The retry
    // restarts from scratch, so tell the caller to drop what it showed.
    if (streamedAny) {
      streamedAny = false;
      input.onStreamReset?.();
    }
    try {
      return await attempt(next, model, input.thinking);
    } catch {
      throw firstError;
    }
  }
}
