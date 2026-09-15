import type {
  CloudProviderId,
  InferenceRouteDecision,
  InferenceRouteRequest,
  InferenceWorkloadKind,
  LlmProviderSecrets,
} from "./types.js";

/**
 * One cloud model per provider.
 *
 * Flash/Pro used to swap weights for OpenRouter. Measuring the same hard
 * recruiting turn on every candidate said the product dial was the wrong
 * shape: GPT-5.6 Luna finished 10/10 at ~$0.005/run, while the previous
 * cheap default (gpt-5-mini) stopped short on long jobs and the Pro pick
 * (gemini-3.5-flash) cost ~100× more for a worse pass rate. One model is
 * enough; reasoning stays a per-model requirement, not a grade.
 */
export const CHEAP_MODELS: Record<CloudProviderId, string> = {
  openai: "redrob-ai",
  openrouter: "openai/gpt-5.6-luna",
  anthropic: "claude-sonnet-4-20250514",
};

/** The default cloud model for a provider. */
export function cloudModelForProvider(provider: CloudProviderId): string {
  return CHEAP_MODELS[provider];
}

/**
 * Models that 400 when thinking is off.
 *
 * OpenRouter returns "Reasoning is mandatory for this endpoint" for these, and
 * the Gateway then falls back to Redrob's weaker engine. Naming the level here
 * keeps the default from being unusable the moment it is selected.
 */
export function modelNeedsThinking(model: string): boolean {
  const id = model.toLowerCase();
  return (
    id.includes("gpt-5-mini") ||
    id.includes("gpt-5.6") ||
    /gemini-3(?:\.\d+)?-flash/.test(id)
  );
}

/**
 * Models that can look at a picture as well as read.
 *
 * Work that drives a screen has to see one, and the cheap defaults above are
 * text-only on some providers — which does not fail, it just makes the model
 * guess where to click. Anything that sends an image asks for these instead.
 */
export const VISION_MODELS: Record<
  CloudProviderId,
  { default: string; thinking: string }
> = {
  openai: { default: "redrob-ai", thinking: "redrob-ai" },
  openrouter: {
    default: "google/gemini-2.5-flash",
    thinking: "google/gemini-2.5-pro",
  },
  anthropic: {
    default: "claude-sonnet-4-20250514",
    thinking: "claude-sonnet-4-20250514",
  },
};

const THINKING_RE =
  /\b(why|how|debug|plan|compare|trade-?offs?|step by step|prove|reason|analyze|design)\b|(왜|어떻게|디버그|계획|비교|트레이드오프|단계별|추론|분석|설계)/i;

/**
 * Heuristic for when a reasoning / thinking model is worth the cost.
 * Field-fill never uses thinking (structured extract).
 */
export function needsThinking(
  kind: InferenceWorkloadKind,
  text: string,
): boolean {
  if (kind === "fieldFill") return false;
  if (kind === "hardJudge") return true;
  const trimmed = text.trim();
  if (trimmed.length < 80) return false;
  if (kind === "draft" && trimmed.length > 1200) return true;
  return THINKING_RE.test(trimmed) && trimmed.length >= 200;
}

/**
 * Whether this turn should ask the provider for a reasoning pass.
 *
 * Chat no longer has a Flash/Pro dial. Models that refuse thinking-off still
 * get it via modelNeedsThinking() in the chat path. Draft and hardJudge keep
 * the text heuristic.
 */
export function resolveThinkingFlag(request: InferenceRouteRequest): boolean {
  if (typeof request.thinkingOverride === "boolean")
    return request.thinkingOverride;
  if (request.workload.kind === "chat") return false;
  return needsThinking(request.workload.kind, request.workload.text);
}

function hasKey(providers: LlmProviderSecrets, id: CloudProviderId): boolean {
  const key = providers[id]?.apiKey?.trim() ?? "";
  return key.length >= 8;
}

/** Prefer cheap cloud hubs first when auto-routing off-device. */
const CHEAP_CLOUD_ORDER: CloudProviderId[] = [
  "openrouter",
  "openai",
  "anthropic",
];

function pickCheapestCloud(
  providers: LlmProviderSecrets,
): CloudProviderId | null {
  for (const id of CHEAP_CLOUD_ORDER) {
    if (hasKey(providers, id)) return id;
  }
  return null;
}

function cloudDecision(
  provider: CloudProviderId,
  thinking: boolean,
  reason: string,
  needsVision = false,
  cloudModel?: string,
): InferenceRouteDecision {
  // Vision still swaps: driving a screen needs a model that can see, and the
  // ones that can are not one family with a reasoning flag between them.
  const vision = VISION_MODELS[provider];
  return {
    provider,
    model: needsVision
      ? thinking
        ? vision.thinking
        : vision.default
      : (cloudModel?.trim() || CHEAP_MODELS[provider]),
    thinking,
    reason,
    confidenceDegraded: true,
  };
}

/**
 * Resolve where any inference workload should run.
 * Auto mix: logprobs workloads prefer local → Redrob → cheap cloud;
 * chat/draft prefer cheap cloud when keyed, else local.
 */
export function resolveInferenceRoute(
  request: InferenceRouteRequest,
): InferenceRouteDecision {
  const thinking = resolveThinkingFlag(request);
  const wantsLogprobs = request.workload.kind === "fieldFill";
  const redrobAvailable = Boolean(request.redrobAvailable);

  if (request.mode === "local") {
    if (!request.localAvailable) {
      throw new Error(
        "Local model is not available. Download a pack or pick a cloud provider.",
      );
    }
    return {
      provider: "local",
      model: "local",
      thinking: false,
      reason: "forced_local",
      confidenceDegraded: false,
    };
  }

  if (request.mode !== "auto") {
    if (!hasKey(request.providers, request.mode)) {
      throw new Error(
        `API key missing for ${request.mode}. Add it in Settings → Models.`,
      );
    }
    return cloudDecision(
      request.mode,
      thinking,
      thinking ? "manual_thinking" : "manual",
      request.needsVision === true,
      request.cloudModel,
    );
  }

  // --- auto (mix) ---
  // Field-fill still prefers local/Redrob for logprobs.
  if (wantsLogprobs) {
    if (request.localAvailable) {
      return {
        provider: "local",
        model: "local",
        thinking: false,
        reason: "auto_local_logprobs",
        confidenceDegraded: false,
      };
    }
    if (redrobAvailable) {
      return {
        provider: "redrob_remote",
        model: "redrob_remote",
        thinking: false,
        reason: "auto_redrob_logprobs",
        confidenceDegraded: false,
      };
    }
    const cloud = pickCheapestCloud(request.providers);
    if (cloud) return cloudDecision(cloud, false, "auto_cloud_no_logprobs");
    throw new Error(
      "No field-fill route. Download a local model, enable Redrob Remote, or add a cloud API key.",
    );
  }

  // Chat / draft / hardJudge: prefer cloud when a key exists (local GGUF is slow on many desks).
  const cloud = pickCheapestCloud(request.providers);
  if (cloud) {
    return cloudDecision(
      cloud,
      thinking,
      thinking ? "auto_cloud_thinking" : "auto_cloud",
      request.needsVision === true,
      request.cloudModel,
    );
  }

  if (request.localAvailable) {
    return {
      provider: "local",
      model: "local",
      thinking: false,
      reason: "auto_local_fallback",
      confidenceDegraded: false,
    };
  }

  throw new Error(
    "No inference route available. Enable a local model or add an OpenRouter / OpenAI / Anthropic key.",
  );
}

/** @deprecated Use resolveInferenceRoute */
export const resolveChatRoute = resolveInferenceRoute;

/** Next provider to try after a cloud failure (same ladder, skip failed). */
export function nextCloudFallback(
  failed: CloudProviderId,
  providers: LlmProviderSecrets,
): CloudProviderId | null {
  const start = CHEAP_CLOUD_ORDER.indexOf(failed);
  const rest = CHEAP_CLOUD_ORDER.slice(start + 1);
  for (const id of rest) {
    if (hasKey(providers, id)) return id;
  }
  return null;
}
