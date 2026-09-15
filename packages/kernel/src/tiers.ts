import type { Tier } from "./types.js";

export interface TierModels {
  embed: string;
  rerank: string;
  text: string;
}

/**
 * Pack ids per memory tier.
 *
 * Only embed and rerank are really sized here now: the text model follows the
 * local model grade (flash → 4B, pro → 9B), and 4B is listed
 * on every tier because that is the floor a staff turn needs to answer in the
 * typed contract. Vision shares whichever text model is loaded. Embed/rerank
 * stay on Qwen3 until a 3.5 embedding stack exists.
 */
export const TIERS: Record<Tier, TierModels> = {
  T4: {
    embed: "qwen3-embedding-0.6b",
    rerank: "qwen3-reranker-0.6b",
    text: "qwen35-4b-q4",
  },
  T8: {
    embed: "qwen3-embedding-4b",
    rerank: "qwen3-reranker-0.6b",
    text: "qwen35-4b-q4",
  },
  T16: {
    embed: "qwen3-embedding-8b",
    rerank: "qwen3-reranker-4b",
    text: "qwen35-4b-q4",
  },
};
