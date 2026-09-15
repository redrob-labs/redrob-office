import type { FieldErrorClass, BenchFieldScore } from "./types.js";

function normalizeScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value).trim().toLowerCase();
}

function isAbsent(value: unknown): boolean {
  const normalized = normalizeScalar(value);
  return (
    normalized === "" ||
    normalized === "null" ||
    normalized === "없음" ||
    normalized === "none" ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "-"
  );
}

/**
 * Classify one field against gold for workload (d).
 * - ok: both absent, or equal when present
 * - miss: gold present, prediction absent
 * - hallucination: gold absent, prediction present
 * - value_wrong: both present but differ
 */
export function classifyField(gold: unknown, predicted: unknown): FieldErrorClass {
  const goldAbsent = isAbsent(gold);
  const predAbsent = isAbsent(predicted);
  if (goldAbsent && predAbsent) return "ok";
  if (!goldAbsent && predAbsent) return "miss";
  if (goldAbsent && !predAbsent) return "hallucination";
  return normalizeScalar(gold) === normalizeScalar(predicted) ? "ok" : "value_wrong";
}

export function scoreFields(
  gold: Record<string, unknown>,
  predicted: Record<string, unknown>,
): BenchFieldScore[] {
  const paths = new Set([...Object.keys(gold), ...Object.keys(predicted)]);
  return [...paths].sort().map((path) => {
    const g = gold[path];
    const p = predicted[path];
    return {
      path,
      gold: g ?? null,
      predicted: p ?? null,
      classification: classifyField(g, p),
    };
  });
}
