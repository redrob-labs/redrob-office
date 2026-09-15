import { describe, expect, it } from "vitest";
import { citationHolds, excludeDeterministicFindings, numberLines } from "./index.js";
import { dateContinuity } from "./rules/index.js";

describe("compare", () => {
  it("detects overlapping employment dates deterministically", () => {
    const findings = dateContinuity("date-continuity", "warn", {
      employment: [
        { startDate: "2024-01-01", endDate: "2024-06-01" },
        { startDate: "2024-05-01", endDate: "2024-12-01" },
      ],
    });
    expect(findings.some((finding) => /overlap/i.test(finding.message))).toBe(true);
    expect(findings[0]?.confidence.score).toBe(1);
  });

  it("never accepts model findings for deterministic rules", () => {
    expect(
      excludeDeterministicFindings(
        [{ ruleId: "date-continuity" }, { ruleId: "unsupported-claim" }],
        new Set(["date-continuity"]),
      ),
    ).toEqual([{ ruleId: "unsupported-claim" }]);
  });

  it("numberLines uses stable 1-based indices for prompt and verify", () => {
    const { numberedText, lines } = numberLines("alpha\nbeta\ngamma");
    expect(numberedText).toBe("1|alpha\n2|beta\n3|gamma");
    expect(lines.get(2)).toBe("beta");
  });

  it("rejects hallucinated citations that are not on the cited line", () => {
    const { lines } = numberLines("TypeScript and Node.js\nPython only");
    expect(citationHolds(lines, [1], "TypeScript")).toBe(true);
    expect(citationHolds(lines, [1], "Python")).toBe(false);
    expect(citationHolds(lines, [2], "Python")).toBe(true);
  });
});
