import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRankLatencyLog, rankAgainstQuery, rankLexically } from "./rank.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("rankLexically", () => {
  it("orders by token overlap without inventing scores", () => {
    const result = rankLexically({
      query: "NestJS TypeScript backend",
      items: [
        { id: "a", text: "Python data science" },
        { id: "b", text: "NestJS TypeScript API backend" },
        { id: "c", text: "NestJS only" },
      ],
      k: 2,
      tier: "T4",
    });
    expect(result.method).toBe("lexical");
    expect(result.orderedIds[0]).toBe("b");
    expect(result.scores[0]?.score).toBeGreaterThan(0);
  });
});

describe("rankAgainstQuery", () => {
  it("fails loudly without cloud keys or REDROB_MODELS_DIR", async () => {
    const previousModelsDir = process.env.REDROB_MODELS_DIR;
    const previousProviders = process.env.REDROB_LLM_PROVIDERS;
    delete process.env.REDROB_MODELS_DIR;
    delete process.env.REDROB_LLM_PROVIDERS;
    try {
      await expect(
        rankAgainstQuery({
          query: "NestJS backend",
          items: [{ id: "1", text: "candidate" }],
          k: 5,
          tier: "T8",
        }),
      ).rejects.toThrow(/REDROB_MODELS_DIR/);
    } finally {
      restoreEnv("REDROB_MODELS_DIR", previousModelsDir);
      restoreEnv("REDROB_LLM_PROVIDERS", previousProviders);
    }
  });

  it("prefers OpenRouter cloud embeddings without a local models directory", async () => {
    const previousModelsDir = process.env.REDROB_MODELS_DIR;
    const previousProviders = process.env.REDROB_LLM_PROVIDERS;
    delete process.env.REDROB_MODELS_DIR;
    process.env.REDROB_LLM_PROVIDERS = JSON.stringify({
      openrouter: { apiKey: "openrouter-test-key" },
      openai: { apiKey: "openai-test-key" },
    });
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/embeddings");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer openrouter-test-key");
      expect(headers.get("HTTP-Referer")).toBe("https://redrob.app");
      expect(headers.get("X-Title")).toBe("Redrob Office");
      expect(JSON.parse(String(init?.body))).toEqual({
        model: "openai/text-embedding-3-small",
        input: ["backend engineer", "sales leader", "TypeScript backend engineer"],
      });
      return Response.json({
        model: "openai/text-embedding-3-small",
        data: [
          { index: 0, embedding: [1, 0] },
          { index: 1, embedding: [0, 1] },
          { index: 2, embedding: [1, 0] },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await rankAgainstQuery({
        query: "backend engineer",
        items: [
          { id: "sales", text: "sales leader" },
          { id: "backend", text: "TypeScript backend engineer" },
        ],
        k: 2,
        tier: "T8",
      });
      expect(result.method).toBe("embed-rerank");
      expect(result.orderedIds).toEqual(["backend", "sales"]);
      expect(result.embedModelId).toBe(
        "openrouter:openai/text-embedding-3-small",
      );
      expect(result.rerankModelId).toBe("cosine");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      restoreEnv("REDROB_MODELS_DIR", previousModelsDir);
      restoreEnv("REDROB_LLM_PROVIDERS", previousProviders);
    }
  });

  it("formats K latency logs for the Screen experiment surface", () => {
    expect(
      formatRankLatencyLog({ k: 20, latencyMs: 12.5, tierUsed: "T8", method: "lexical" }),
    ).toContain("k=20");
  });
});
