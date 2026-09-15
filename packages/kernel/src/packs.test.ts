import { describe, expect, it } from "vitest";
import { buildLocalPackPlan, DEFAULT_LOCAL_PACK_TIER, humanBytes } from "./packs.js";
import { assertRemoteConfig, remoteGenerateConstrainedJson } from "./remote.js";

describe("local pack plan", () => {
  it("defaults to T4 progressive roles", () => {
    expect(DEFAULT_LOCAL_PACK_TIER).toBe("T4");
    const plan = buildLocalPackPlan();
    expect(plan.tier).toBe("T4");
    expect(plan.roles.map((role) => role.role)).toEqual(["text", "embed", "rerank"]);
    expect(plan.minimalBytes).toBe(plan.roles[0]!.approxBytes);
    expect(plan.fullBytes).toBeGreaterThan(plan.minimalBytes);
  });

  it("formats human sizes", () => {
    expect(humanBytes(1749 * 1024 * 1024)).toContain("GB");
  });
});

describe("redrob remote", () => {
  it("rejects missing consent/config", () => {
    expect(() => assertRemoteConfig(null)).toThrow(/not configured/);
  });

  it("fails loudly when response lacks logprobs", async () => {
    await expect(
      remoteGenerateConstrainedJson(
        {
          baseUrl: "https://remote.example",
          apiKey: "test-key-123456",
          consentedAt: new Date().toISOString(),
        },
        { prompt: "x", grammar: "root ::= \"{}\"", schemaOrRubricId: "recruiting/resume" },
        async () =>
          new Response(JSON.stringify({ rawText: "{}" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    ).rejects.toThrow(/tokenLogprobs/);
  });
});
