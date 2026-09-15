import type { LlmProviderCredential } from "./types.js";
import { LlmProviderError } from "./types.js";

export const OPENROUTER_EMBED_MODEL = "openai/text-embedding-3-small";
export const OPENAI_EMBED_MODEL = "text-embedding-3-small";

const DEFAULT_BASES = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

export async function embedTexts(input: {
  provider: "openai" | "openrouter";
  credential: LlmProviderCredential;
  model: string;
  texts: string[];
}): Promise<{ vectors: number[][]; modelId: string }> {
  const base =
    input.credential.baseUrl?.trim().replace(/\/+$/, "") ||
    DEFAULT_BASES[input.provider];
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${input.credential.apiKey.trim()}`,
  };
  if (input.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://redrob.app";
    headers["X-Title"] = "Redrob Office";
  }

  const response = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: input.model, input: input.texts }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new LlmProviderError(
      `${input.provider} embeddings failed: HTTP ${response.status} ${response.statusText}${
        detail ? ` — ${detail.slice(0, 240)}` : ""
      }`,
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: unknown; index?: unknown }>;
    model?: unknown;
  };
  if (!Array.isArray(payload.data) || payload.data.length !== input.texts.length) {
    throw new LlmProviderError(
      `${input.provider} embeddings returned ${payload.data?.length ?? 0} vectors for ${input.texts.length} texts`,
    );
  }

  const rows = [...payload.data];
  const indices = rows.map((row) => row.index);
  if (
    indices.every(
      (index) =>
        Number.isInteger(index) &&
        (index as number) >= 0 &&
        (index as number) < rows.length,
    ) &&
    new Set(indices).size === rows.length
  ) {
    rows.sort((a, b) => (a.index as number) - (b.index as number));
  }

  const vectors = rows.map((row) => {
    if (
      !Array.isArray(row.embedding) ||
      row.embedding.length === 0 ||
      !row.embedding.every(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value),
      )
    ) {
      throw new LlmProviderError(
        `${input.provider} embeddings returned an invalid vector`,
      );
    }
    return row.embedding;
  });
  const responseModel =
    typeof payload.model === "string" && payload.model.trim()
      ? payload.model.trim()
      : input.model;
  return {
    vectors,
    modelId: `${input.provider}:${responseModel}`,
  };
}
