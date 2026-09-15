/**
 * Opt-in Redrob Remote API client (SPEC §4.3 / §14).
 * Does not call third-party LLM vendors. Fails loudly until configured.
 */

export interface RedrobRemoteConfig {
  baseUrl: string;
  apiKey: string;
  consentedAt: string;
}

export interface RedrobRemoteGenerateRequest {
  prompt: string;
  grammar: string;
  /** Schema / rubric id only — never attach raw document filenames in headers. */
  schemaOrRubricId: string;
}

export interface RedrobRemoteGenerateResponse {
  rawText: string;
  tokenLogprobs: Array<{ token: string; logprob: number }>;
}

export class RedrobRemoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedrobRemoteError";
  }
}

export function assertRemoteConfig(config: RedrobRemoteConfig | null): asserts config is RedrobRemoteConfig {
  if (!config) {
    throw new RedrobRemoteError(
      "Redrob Remote API is not configured. Complete first-run setup or open Settings.",
    );
  }
  if (!config.baseUrl.startsWith("https://") && !config.baseUrl.startsWith("http://localhost")) {
    throw new RedrobRemoteError(
      "Redrob Remote base URL must be https:// (or http://localhost for development).",
    );
  }
  if (config.apiKey.trim().length < 8) {
    throw new RedrobRemoteError("Redrob Remote API key is missing or too short.");
  }
  if (!config.consentedAt) {
    throw new RedrobRemoteError("Redrob Remote requires explicit consent before use.");
  }
}

/**
 * Constrained JSON over Redrob Remote. The server must return token logprobs;
 * inventing confidence is forbidden.
 */
export async function remoteGenerateConstrainedJson(
  config: RedrobRemoteConfig,
  request: RedrobRemoteGenerateRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<RedrobRemoteGenerateResponse> {
  assertRemoteConfig(config);
  const response = await fetchImpl(new URL("/v1/generate", config.baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      prompt: request.prompt,
      grammar: request.grammar,
      schemaOrRubricId: request.schemaOrRubricId,
      requireLogprobs: true,
    }),
  });
  if (!response.ok) {
    throw new RedrobRemoteError(
      `Redrob Remote generate failed: HTTP ${response.status} ${response.statusText}`,
    );
  }
  const payload = (await response.json()) as Partial<RedrobRemoteGenerateResponse>;
  if (typeof payload.rawText !== "string" || !Array.isArray(payload.tokenLogprobs)) {
    throw new RedrobRemoteError(
      "Redrob Remote response missing rawText/tokenLogprobs; refusing to invent confidence.",
    );
  }
  if (payload.tokenLogprobs.length === 0) {
    throw new RedrobRemoteError("Redrob Remote returned empty tokenLogprobs.");
  }
  for (const entry of payload.tokenLogprobs) {
    if (typeof entry.token !== "string" || typeof entry.logprob !== "number") {
      throw new RedrobRemoteError("Redrob Remote tokenLogprobs entries are malformed.");
    }
  }
  return { rawText: payload.rawText, tokenLogprobs: payload.tokenLogprobs };
}
