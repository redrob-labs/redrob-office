import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MeasuredTiming } from "../../shared/office-api.js";

/** Keep the file small enough to load on every start. */
export const MAX_MEASUREMENTS = 200;

export function measurementsPath(userData: string): string {
  return join(userData, "measurements.json");
}

function isMeasuredTiming(value: unknown): value is MeasuredTiming {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.operation === "string" &&
    typeof row.totalMs === "number" &&
    Number.isFinite(row.totalMs) &&
    typeof row.recordedAt === "string"
  );
}

export async function loadMeasurements(userData: string): Promise<MeasuredTiming[]> {
  try {
    const raw = await readFile(measurementsPath(userData), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMeasuredTiming).slice(-MAX_MEASUREMENTS);
  } catch {
    return [];
  }
}

export async function saveMeasurements(
  userData: string,
  timings: readonly MeasuredTiming[],
): Promise<void> {
  await mkdir(userData, { recursive: true });
  const trimmed = timings.slice(-MAX_MEASUREMENTS);
  await writeFile(
    measurementsPath(userData),
    `${JSON.stringify(trimmed, null, 2)}\n`,
    "utf8",
  );
}
