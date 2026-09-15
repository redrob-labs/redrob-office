import {
  ensureModel,
  MODEL_ARTIFACTS,
  readLlmProvidersFromEnv,
  TIERS,
  type Tier,
} from "@redrob/kernel";
import { rankWithCloudEmbeddings } from "./cloud-rank.js";

export interface RankItem {
  id: string;
  text: string;
}

export interface RankResult {
  orderedIds: string[];
  scores: Array<{ id: string; score: number }>;
  k: number;
  latencyMs: number;
  tierUsed: Tier;
  method: "lexical" | "embed-rerank";
  embedModelId: string;
  rerankModelId: string;
}

function modelsDirectory(): string {
  const configured = process.env.REDROB_MODELS_DIR;
  if (!configured) {
    throw new Error(
      "REDROB_MODELS_DIR is not configured. Set it to the directory containing downloaded local models.",
    );
  }
  return configured;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1),
  );
}

/**
 * Deterministic lexical ranking (token overlap). Not model inference —
 * used until embed/rerank adapters are wired. Never invents scores.
 */
export function rankLexically(options: {
  query: string;
  items: readonly RankItem[];
  k: number;
  tier: Tier;
}): RankResult {
  const startedAt = performance.now();
  if (!Number.isInteger(options.k) || options.k < 1) {
    throw new Error("Rerank K must be a positive integer");
  }
  const query = options.query.trim();
  if (!query) throw new Error("Rank query is empty.");
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) throw new Error("Rank query has no usable tokens.");

  const scored = options.items.map((item) => {
    const itemTokens = tokenize(item.text);
    let overlap = 0;
    for (const token of queryTokens) {
      if (itemTokens.has(token)) overlap += 1;
    }
    const score = overlap / queryTokens.size;
    return { id: item.id, score };
  });
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const top = scored.slice(0, Math.min(options.k, scored.length));
  return {
    orderedIds: top.map((entry) => entry.id),
    scores: top,
    k: options.k,
    latencyMs: performance.now() - startedAt,
    tierUsed: options.tier,
    method: "lexical",
    embedModelId: "lexical",
    rerankModelId: "lexical",
  };
}

/**
 * Screen ranking: embed → top-K → rerank.
 * Cloud embeddings use cosine similarity; the local adapter still falls back
 * to lexical ranking when its embed/rerank implementation is unavailable.
 */
export async function rankAgainstQuery(options: {
  query: string;
  items: readonly RankItem[];
  k: number;
  tier: Tier;
}): Promise<RankResult> {
  if (!Number.isInteger(options.k) || options.k < 1) {
    throw new Error("Rerank K must be a positive integer");
  }
  const providers = readLlmProvidersFromEnv();
  if (providers.openrouter) {
    return rankWithCloudEmbeddings({
      ...options,
      provider: "openrouter",
      credential: providers.openrouter,
    });
  }
  if (providers.openai) {
    return rankWithCloudEmbeddings({
      ...options,
      provider: "openai",
      credential: providers.openai,
    });
  }

  const modelsDir = modelsDirectory();
  const embedId = TIERS[options.tier].embed;
  const rerankId = TIERS[options.tier].rerank;
  const embedArtifact = MODEL_ARTIFACTS[embedId];
  const rerankArtifact = MODEL_ARTIFACTS[rerankId];
  if (!embedArtifact || !rerankArtifact) {
    throw new Error(`Missing embed/rerank artifacts for tier ${options.tier}`);
  }
  try {
    await ensureModel(embedArtifact, modelsDir);
    await ensureModel(rerankArtifact, modelsDir);
  } catch {
    return rankLexically(options);
  }

  // Adapter not wired yet — use lexical rather than inventing embed scores.
  return rankLexically(options);
}

/** Structured log line for the K/latency experiment surface in Desk. */
export function formatRankLatencyLog(
  result: Pick<RankResult, "k" | "latencyMs" | "tierUsed" | "method">,
): string {
  return `screen.rank method=${result.method} k=${result.k} latencyMs=${result.latencyMs.toFixed(1)} tier=${result.tierUsed}`;
}
