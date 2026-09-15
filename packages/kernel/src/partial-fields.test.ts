import { describe, expect, it } from "vitest";

import {
  assignCompletedFieldConfidences,
  collectCompletedLeaves,
} from "./inference/partial-fields.js";

describe("collectCompletedLeaves", () => {
  it("returns closed fields from a partial object prefix", () => {
    const leaves = collectCompletedLeaves('{"name":"Ada","sc');
    expect(leaves).toEqual([{ path: "/name", start: 8, end: 13 }]);
  });

  it("ignores incomplete string values", () => {
    expect(collectCompletedLeaves('{"name":"Ad')).toEqual([]);
  });

  it("returns both fields when the object is complete", () => {
    const leaves = collectCompletedLeaves('{"name":"Ada","score":7}');
    expect(leaves.map((leaf) => leaf.path)).toEqual(["/name", "/score"]);
  });
});

describe("assignCompletedFieldConfidences", () => {
  it("emits confidence for closed fields only", () => {
    const tokens = [
      { token: '{"name":', logprob: -0.01 },
      { token: '"Ada"', logprob: -0.1 },
      { token: ',"sc', logprob: -0.01 },
    ];
    const partial = tokens.map((token) => token.token).join("");
    const fields = assignCompletedFieldConfidences(tokens, partial);
    expect(fields).toEqual([
      expect.objectContaining({ path: "/name", value: "Ada" }),
    ]);
  });
});
