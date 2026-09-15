import { describe, expect, it } from "vitest";
import { confidenceFromLogprobs } from "@redrob/kernel";
import type { RubricAxis } from "@redrob/registry";
import { interpretCloudScores, parseCloudScoreObject } from "./cloud-score.js";

const CONF = confidenceFromLogprobs([-20]);

const AXES: RubricAxis[] = [
  { id: "experience", label: "Experience", range: [0, 5], guidance: "Years and depth." },
  { id: "skills", label: "Skills", range: [0, 5], guidance: "Relevant stack." },
  { id: "leadership", label: "Leadership", range: [0, 5], guidance: "Mentoring." },
];

const LINES = new Map<number, string>([
  [1, "name: Kim Minjun"],
  [2, "skills: TypeScript, Node.js, distributed systems"],
  [3, "totalExperienceMonths: 84"],
]);

describe("interpretCloudScores", () => {
  it("keeps a score only when its quote actually appears in the cited lines", () => {
    const parsed = parseCloudScoreObject(
      JSON.stringify({
        // Valid: quote is a real substring of line 3.
        experience: { lines: [3], quote: "84", score: 4 },
        // Valid: quote is a real substring of line 2.
        skills: { lines: [2], quote: "TypeScript, Node.js", score: 5 },
        // Invented quote: not in line 1 → must be rejected, not trusted.
        leadership: { lines: [1], quote: "led a team of 10", score: 5 },
      }),
    );
    const { scores, unscoredAxes, scoreByAxis } = interpretCloudScores(parsed, LINES, AXES, CONF);

    const byId = Object.fromEntries(scores.map((s) => [s.axisId, s]));
    expect(byId.experience?.value).toBe(4);
    expect(byId.skills?.value).toBe(5);
    expect(byId.skills?.evidence.lineRefs).toEqual([2]);
    // The fabricated citation is not scored.
    expect(byId.leadership).toBeUndefined();
    expect(unscoredAxes).toContainEqual({ axisId: "leadership", reason: "citation_failed" });
    // The raw model number is still surfaced for streaming even when rejected.
    expect(scoreByAxis.get("leadership")).toBe(5);
  });

  it("marks an out-of-range score as an error and a missing axis as absent", () => {
    const parsed = parseCloudScoreObject(
      JSON.stringify({
        experience: { lines: [3], quote: "84", score: 9 },
        skills: { lines: [], quote: "", score: null },
      }),
    );
    const { scores, unscoredAxes } = interpretCloudScores(parsed, LINES, AXES, CONF);
    expect(scores).toHaveLength(0);
    expect(unscoredAxes).toContainEqual({ axisId: "experience", reason: "error" });
    expect(unscoredAxes).toContainEqual({ axisId: "skills", reason: "absent" });
    expect(unscoredAxes).toContainEqual({ axisId: "leadership", reason: "absent" });
  });

  it("tolerates a fenced JSON block", () => {
    const parsed = parseCloudScoreObject(
      "```json\n{\"experience\": {\"lines\": [3], \"quote\": \"84\", \"score\": 3}}\n```",
    );
    const { scores } = interpretCloudScores(parsed, LINES, AXES, CONF);
    expect(scores.find((s) => s.axisId === "experience")?.value).toBe(3);
  });
});
