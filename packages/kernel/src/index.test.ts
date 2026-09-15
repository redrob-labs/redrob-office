import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assignFieldConfidences,
  confidenceFromLogprobs,
  MODEL_ARTIFACTS,
  nextLowerTier,
  partitionNeedsReview,
  resolveModel,
  schemaFieldsToGbnf,
  slowdownPct,
  tierFromTotalRamMb,
  TIERS,
} from "./index.js";

describe("tierFromTotalRamMb", () => {
  it("assigns T4 under 8GB", () => {
    expect(tierFromTotalRamMb(7_999)).toBe("T4");
    expect(tierFromTotalRamMb(4_096)).toBe("T4");
  });

  it("assigns T8 from 8GB inclusive to under 16GB", () => {
    expect(tierFromTotalRamMb(8_000)).toBe("T8");
    expect(tierFromTotalRamMb(15_999)).toBe("T8");
  });

  it("assigns T16 at 16GB and above", () => {
    expect(tierFromTotalRamMb(16_000)).toBe("T16");
    expect(tierFromTotalRamMb(64_000)).toBe("T16");
  });
});

describe("confidenceFromLogprobs", () => {
  it("uses exp(minLogprob) as score, not the mean", () => {
    const result = confidenceFromLogprobs([-0.1, -2.0, -0.2]);
    expect(result.minLogprob).toBe(-2.0);
    expect(result.score).toBeCloseTo(Math.exp(-2.0), 10);
    expect(result.meanLogprob).toBeCloseTo((-0.1 + -2.0 + -0.2) / 3, 10);
    expect(result.tokenCount).toBe(3);
  });

  it("rejects empty logprob lists", () => {
    expect(() => confidenceFromLogprobs([])).toThrow(/at least one/);
  });
});

describe("assignFieldConfidences", () => {
  it("maps token spans to JSON leaf values", () => {
    const fields = assignFieldConfidences(
      [
        { token: '{"name":', logprob: -0.01 },
        { token: '"Ada"', logprob: -0.1 },
        { token: ',"score":', logprob: -0.01 },
        { token: "7", logprob: -2 },
        { token: "}", logprob: -0.01 },
      ],
      '{"name":"Ada","score":7}',
    );
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/name", value: "Ada" }),
        expect.objectContaining({ path: "/score", value: 7 }),
      ]),
    );
    expect(fields.find((field) => field.path === "/score")?.confidence.score).toBeCloseTo(
      Math.exp(-2),
    );
  });

  it("routes low-confidence fields to review", () => {
    const fields = [
      { path: "/reliable", confidence: confidenceFromLogprobs([-0.1]) },
      { path: "/uncertain", confidence: confidenceFromLogprobs([-2]) },
    ];
    const partition = partitionNeedsReview(fields, 0.5);
    expect(partition.accepted.map((field) => field.path)).toEqual(["/reliable"]);
    expect(partition.needsReview.map((field) => field.path)).toEqual(["/uncertain"]);
  });
});

describe("TIERS", () => {
  it("defines all three tiers with required model roles", () => {
    for (const tier of ["T4", "T8", "T16"] as const) {
      const models = TIERS[tier];
      expect(models.embed.length).toBeGreaterThan(0);
      expect(models.rerank.length).toBeGreaterThan(0);
      expect(models.text.length).toBeGreaterThan(0);
      expect(models.text.startsWith("qwen35-")).toBe(true);
    }
  });
});

describe("schemaFieldsToGbnf", () => {
  it("creates a non-empty grammar containing field names", () => {
    const grammar = schemaFieldsToGbnf([
      { path: "/name", type: "string", required: true },
      { path: "/age", type: "integer", required: false },
    ]);
    expect(grammar.length).toBeGreaterThan(0);
    expect(grammar).toContain("name");
    expect(grammar).toContain("age");
  });
});

describe("slowdownPct", () => {
  it("compares first and final decile means", () => {
    expect(slowdownPct([10, 10, 10, 10, 10, 10, 10, 10, 10, 20])).toBe(100);
  });
});

describe("nextLowerTier", () => {
  it("walks tiers down without dropping below T4", () => {
    expect(nextLowerTier("T16")).toBe("T8");
    expect(nextLowerTier("T8")).toBe("T4");
    expect(nextLowerTier("T4")).toBeNull();
  });
});

describe("resolveModel", () => {
  it("throws a download instruction when model weights are missing", async () => {
    const modelsDir = await mkdtemp(join(tmpdir(), "redrob-kernel-"));
    try {
      await expect(resolveModel(MODEL_ARTIFACTS["qwen35-4b-q4"]!, modelsDir)).rejects.toThrow(
        /Download it/,
      );
    } finally {
      await rm(modelsDir, { recursive: true, force: true });
    }
  });
});
