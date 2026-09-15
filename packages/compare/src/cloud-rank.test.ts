import { LlmProviderError } from "@redrob/kernel";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cosineSimilarity, rankWithCloudEmbeddings } from "./cloud-rank.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cosineSimilarity", () => {
  it("measures direction rather than vector magnitude", () => {
    expect(cosineSimilarity([1, 0], [20, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 3])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-4, 0])).toBeCloseTo(-1);
    expect(cosineSimilarity([0, 0], [2, 1])).toBe(0);
  });

  it("rejects mismatched embedding dimensions", () => {
    expect(() => cosineSimilarity([1, 0], [1])).toThrow(
      /embedding dimensions/,
    );
  });
});

describe("rankWithCloudEmbeddings", () => {
  it("ranks by cosine similarity and restores response index order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          model: "text-embedding-3-small",
          data: [
            { index: 2, embedding: [0.8, 0.2] },
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
      ),
    );

    const result = await rankWithCloudEmbeddings({
      query: "query",
      items: [
        { id: "unrelated", text: "first" },
        { id: "best", text: "second" },
      ],
      k: 1,
      tier: "T4",
      provider: "openai",
      credential: { apiKey: "openai-test-key" },
    });

    expect(result.orderedIds).toEqual(["best"]);
    expect(result.scores[0]?.score).toBeCloseTo(0.9701, 4);
    expect(result.method).toBe("embed-rerank");
    expect(result.embedModelId).toBe("openai:text-embedding-3-small");
    expect(result.rerankModelId).toBe("cosine");
  });

  it("chunks query and item texts into batches of at most 64", async () => {
    const batchSizes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { input: string[] };
        batchSizes.push(body.input.length);
        return Response.json({
          model: "text-embedding-3-small",
          data: body.input.map((_text, index) => ({
            index,
            embedding: [1, 0],
          })),
        });
      }),
    );

    const result = await rankWithCloudEmbeddings({
      query: "query",
      items: Array.from({ length: 65 }, (_, index) => ({
        id: `item-${index}`,
        text: `candidate ${index}`,
      })),
      k: 3,
      tier: "T8",
      provider: "openai",
      credential: { apiKey: "openai-test-key" },
    });

    expect(batchSizes).toEqual([64, 2]);
    expect(result.scores).toHaveLength(3);
  });

  it("surfaces non-OK embedding responses as provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota exceeded", { status: 429 })),
    );

    await expect(
      rankWithCloudEmbeddings({
        query: "query",
        items: [{ id: "item", text: "candidate" }],
        k: 1,
        tier: "T4",
        provider: "openai",
        credential: { apiKey: "openai-test-key" },
      }),
    ).rejects.toThrow(LlmProviderError);
  });
});
