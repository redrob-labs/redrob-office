import { DEFAULT_LOCAL_PACK_TIER, type Tier } from "@redrob/kernel";
import { formatRankLatencyLog, rankAgainstQuery, type RankResult } from "@redrob/compare";
import { listDocuments, type Store } from "@redrob/store";
import { documentAsRankText } from "./assess.js";

export interface ScreenRankRequest {
  query: string;
  k: number;
  schemaId?: string;
}

export interface ScreenRankResult extends RankResult {
  items: Array<{ id: string; path: string; score: number }>;
  logLine: string;
}

export async function runScreenRank(store: Store, input: ScreenRankRequest): Promise<ScreenRankResult> {
  const schemaId = input.schemaId ?? "recruiting/resume";
  const docs = listDocuments(store, schemaId);
  if (docs.length === 0) {
    throw new Error("ERR_NO_DOCUMENTS");
  }
  const items = docs.map((doc) => ({
    id: doc.id,
    text: `${doc.path}\n${documentAsRankText(store, doc.id)}`,
  }));
  const tier = (process.env.REDROB_PACK_TIER as Tier | undefined) ?? DEFAULT_LOCAL_PACK_TIER;
  const ranked = await rankAgainstQuery({
    query: input.query,
    items,
    k: input.k,
    tier,
  });
  const pathById = new Map(docs.map((doc) => [doc.id, doc.path]));
  const scoreById = new Map(ranked.scores.map((entry) => [entry.id, entry.score]));
  return {
    ...ranked,
    items: ranked.orderedIds.map((id) => ({
      id,
      path: pathById.get(id) ?? id,
      score: scoreById.get(id) ?? 0,
    })),
    logLine: formatRankLatencyLog(ranked),
  };
}
