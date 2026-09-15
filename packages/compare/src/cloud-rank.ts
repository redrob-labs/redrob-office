import {
  embedTexts,
  OPENAI_EMBED_MODEL,
  OPENROUTER_EMBED_MODEL,
  type LlmProviderCredential,
  type Tier,
} from "@redrob/kernel";
import type { RankItem, RankResult } from "./rank.js";

const EMBED_BATCH_SIZE = 64;

export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length !== b.length) {
    throw new Error(
      `Cannot compare embedding dimensions ${a.length} and ${b.length}`,
    );
  }
  let dot = 0;
  let aSquared = 0;
  let bSquared = 0;
  for (let index = 0; index < a.length; index += 1) {
    const aValue = a[index]!;
    const bValue = b[index]!;
    dot += aValue * bValue;
    aSquared += aValue * aValue;
    bSquared += bValue * bValue;
  }
  if (aSquared === 0 || bSquared === 0) return 0;
  return dot / Math.sqrt(aSquared * bSquared);
}

export async function rankWithCloudEmbeddings(options: {
  query: string;
  items: readonly RankItem[];
  k: number;
  tier: Tier;
  provider: "openai" | "openrouter";
  credential: LlmProviderCredential;
  model?: string;
}): Promise<RankResult> {
  const startedAt = performance.now();
  if (!Number.isInteger(options.k) || options.k < 1) {
    throw new Error("Rerank K must be a positive integer");
  }
  const query = options.query.trim();
  if (!query) throw new Error("Rank query is empty.");

  const model =
    options.model ??
    (options.provider === "openrouter"
      ? OPENROUTER_EMBED_MODEL
      : OPENAI_EMBED_MODEL);
  const texts = [query, ...options.items.map((item) => item.text)];
  const vectors: number[][] = [];
  let embedModelId = `${options.provider}:${model}`;

  for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
    const embedded = await embedTexts({
      provider: options.provider,
      credential: options.credential,
      model,
      texts: texts.slice(offset, offset + EMBED_BATCH_SIZE),
    });
    vectors.push(...embedded.vectors);
    embedModelId = embedded.modelId;
  }

  const queryVector = vectors[0]!;
  const scored = options.items.map((item, index) => ({
    id: item.id,
    score: cosineSimilarity(queryVector, vectors[index + 1]!),
  }));
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const top = scored.slice(0, Math.min(options.k, scored.length));

  return {
    orderedIds: top.map((entry) => entry.id),
    scores: top,
    k: options.k,
    latencyMs: performance.now() - startedAt,
    tierUsed: options.tier,
    method: "embed-rerank",
    embedModelId,
    rerankModelId: "cosine",
  };
}
