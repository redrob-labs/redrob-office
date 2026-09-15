import { describe, expect, it } from "vitest";
import { assignFieldConfidences, partitionNeedsReview } from "@redrob/kernel";
import { extract } from "./index.js";

describe("extract", () => {
  it("fails loudly when nothing can serve a field-fill", async () => {
    const previous = process.env.REDROB_MODELS_DIR;
    delete process.env.REDROB_MODELS_DIR;
    await expect(
      extract({
        source: { kind: "text", content: "placeholder" },
        schemaId: "recruiting/resume",
        tierOverride: "T4",
      }),
    ).rejects.toThrow(/no field-fill route/i);
    if (previous !== undefined) process.env.REDROB_MODELS_DIR = previous;
  });

  it("routes handcrafted token confidence to review", () => {
    const raw = '{"name":"A"}';
    const fields = assignFieldConfidences([{ token: raw, logprob: -1 }], raw);
    expect(partitionNeedsReview(fields, 0.72).needsReview).toHaveLength(1);
  });
});
