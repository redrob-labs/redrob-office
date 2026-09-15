import {
  validateRubric,
  type RubricAxis,
  type RubricDefinition,
} from "@redrob/registry";

const AXIS_IDS = ["A", "B", "C", "D", "E"] as const;

function normalizeLine(line: string): string {
  return line
    .replace(/^[-*•·]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^#+\s+/, "")
    .trim();
}

function candidateLines(jdText: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of jdText.split(/\r?\n/)) {
    const line = normalizeLine(raw);
    if (line.length < 4 || line.length > 120) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

/**
 * Builds a scoring rubric from JD text without inventing candidate facts.
 * Axes come from JD lines; guidance stays grounded in that wording.
 */
export function draftRubricFromJd(jdText: string, rubricId: string): RubricDefinition {
  const trimmed = jdText.trim();
  if (!trimmed) throw new Error("JD text is empty.");
  if (!/^[a-z]+\/[a-z0-9.-]+$/.test(rubricId)) {
    throw new Error(`invalid rubric id: ${rubricId}`);
  }

  let lines = candidateLines(trimmed);
  if (lines.length === 0) {
    lines = [trimmed.replace(/\s+/g, " ").slice(0, 80)];
  }
  const content = lines.slice(0, 5);

  const axes: RubricAxis[] = [
    ...content.map((label, index) => ({
      id: AXIS_IDS[index]!,
      label: label.slice(0, 80),
      range: [1, 5] as [number, number],
      guidance: `JD 문구를 기준으로 본다: ${label.slice(0, 160)}`,
    })),
    {
      id: "F",
      label: "역할 적합도",
      range: [1, 5],
      guidance: "JD 필수 요건과의 적합만 본다. 보호 속성은 추론하지 않는다.",
    },
  ];

  return validateRubric({
    id: rubricId,
    version: 1,
    axes,
    rules: [
      {
        id: "unsupported-claim",
        kind: "model",
        severity: "info",
        prompt: "Identify claims without supporting detail in the artifact.",
      },
    ],
  });
}

export function slugifyRubricSuffix(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 48);
  return ascii || `role-${Date.now().toString(36)}`;
}
