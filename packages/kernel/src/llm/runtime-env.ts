import type { InferenceRouteMode, LlmProviderSecrets } from "./types.js";

const ROUTE_MODES: InferenceRouteMode[] = [
  "auto",
  "local",
  "openai",
  "openrouter",
  "anthropic",
];

export function parseInferenceRouteMode(value: unknown): InferenceRouteMode {
  if (value === "deepseek") return "openrouter";
  if (typeof value === "string" && (ROUTE_MODES as string[]).includes(value)) {
    return value as InferenceRouteMode;
  }
  return "auto";
}

export function readInferenceRouteFromEnv(): InferenceRouteMode {
  return parseInferenceRouteMode(process.env.REDROB_INFERENCE_ROUTE);
}

export function readLlmProvidersFromEnv(): LlmProviderSecrets {
  const raw = process.env.REDROB_LLM_PROVIDERS?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: LlmProviderSecrets = {};
    for (const id of ["openai", "openrouter", "anthropic"] as const) {
      const entry = (parsed as Record<string, unknown>)[id];
      if (!entry || typeof entry !== "object") continue;
      const apiKey = (entry as { apiKey?: unknown }).apiKey;
      const baseUrl = (entry as { baseUrl?: unknown }).baseUrl;
      if (typeof apiKey !== "string" || apiKey.trim().length < 8) continue;
      out[id] = {
        apiKey: apiKey.trim(),
        ...(typeof baseUrl === "string" && baseUrl.trim()
          ? { baseUrl: baseUrl.trim().replace(/\/$/, "") }
          : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function redrobAvailableFromEnv(): boolean {
  const baseUrl = process.env.REDROB_REMOTE_BASE_URL?.trim() ?? "";
  const apiKey = process.env.REDROB_REMOTE_API_KEY?.trim() ?? "";
  const consentedAt = process.env.REDROB_REMOTE_CONSENTED_AT?.trim() ?? "";
  const httpsOk = baseUrl.startsWith("https://") || baseUrl.startsWith("http://localhost");
  return httpsOk && apiKey.length >= 8 && Boolean(consentedAt);
}
