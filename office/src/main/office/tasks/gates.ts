import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { TimeSource } from "../time/index.js";
import { asNumber, type FloorDb } from "../queue/sqlite.js";

export type GateName = "hash" | "schema" | "grep" | "test";

export interface GateInput {
  /** File the deliverable claims to be derived from. */
  sourcePath?: string;
  /** File the deliverable was written to. */
  artifactPath?: string;
  /** Expected sha256 of the source, when the claim carries one. */
  expectedSha256?: string;
  /** Strings that must literally appear in the source for the claim to hold. */
  mustAppearInSource?: string[];
  /** Shell argv to run as the reproduction test. */
  testCommand?: { command: string; args: string[]; cwd: string };
  runShell?: (input: {
    command: string;
    args: string[];
    cwd: string;
  }) => Promise<{ ok: boolean; summary: string }>;
}

export interface GateResult {
  gate: GateName;
  passed: boolean;
  detail: string;
  /** Where the mismatch is, so a CHALLENGE can carry a real locator. */
  locator?: string;
}

async function sha256Of(path: string): Promise<string> {
  const buffer = await readFile(path);
  return createHash("sha256").update(buffer).digest("hex");
}

async function hashGate(input: GateInput): Promise<GateResult> {
  if (!input.sourcePath || !input.expectedSha256) {
    return { gate: "hash", passed: true, detail: "No hash claim to check" };
  }
  try {
    const actual = await sha256Of(input.sourcePath);
    if (actual === input.expectedSha256) {
      return { gate: "hash", passed: true, detail: `sha256 matches (${actual.slice(0, 12)})` };
    }
    return {
      gate: "hash",
      passed: false,
      detail: `sha256 mismatch: claimed ${input.expectedSha256.slice(0, 12)}, actual ${actual.slice(0, 12)}`,
      locator: `${input.sourcePath}#sha256`,
    };
  } catch (error) {
    return {
      gate: "hash",
      passed: false,
      detail: `source unreadable: ${error instanceof Error ? error.message : String(error)}`,
      locator: input.sourcePath,
    };
  }
}

async function schemaGate(input: GateInput): Promise<GateResult> {
  if (!input.artifactPath) {
    return { gate: "schema", passed: true, detail: "No artifact to parse" };
  }
  try {
    const raw = await readFile(input.artifactPath, "utf8");
    if (input.artifactPath.endsWith(".json")) {
      JSON.parse(raw);
      return { gate: "schema", passed: true, detail: "artifact parses as JSON" };
    }
    if (raw.trim().length === 0) {
      return {
        gate: "schema",
        passed: false,
        detail: "artifact is empty",
        locator: `${input.artifactPath}#0`,
      };
    }
    return { gate: "schema", passed: true, detail: `artifact has ${raw.length} chars` };
  } catch (error) {
    return {
      gate: "schema",
      passed: false,
      detail: `artifact invalid: ${error instanceof Error ? error.message : String(error)}`,
      locator: input.artifactPath,
    };
  }
}

async function grepGate(input: GateInput): Promise<GateResult> {
  const needles = input.mustAppearInSource ?? [];
  if (!input.sourcePath || needles.length === 0) {
    return { gate: "grep", passed: true, detail: "No literal claims to locate" };
  }
  let raw: string;
  try {
    raw = await readFile(input.sourcePath, "utf8");
  } catch (error) {
    return {
      gate: "grep",
      passed: false,
      detail: `source unreadable: ${error instanceof Error ? error.message : String(error)}`,
      locator: input.sourcePath,
    };
  }
  const lines = raw.split("\n");
  for (const needle of needles) {
    const index = lines.findIndex((line) => line.includes(needle));
    if (index < 0) {
      return {
        gate: "grep",
        passed: false,
        detail: `"${needle}" does not appear anywhere in ${input.sourcePath}`,
        locator: `${input.sourcePath}#missing:${needle}`,
      };
    }
  }
  return {
    gate: "grep",
    passed: true,
    detail: `all ${needles.length} claimed values located in source`,
  };
}

async function testGate(input: GateInput): Promise<GateResult> {
  if (!input.testCommand || !input.runShell) {
    return { gate: "test", passed: true, detail: "No reproduction command configured" };
  }
  const result = await input.runShell(input.testCommand);
  return {
    gate: "test",
    passed: result.ok,
    detail: result.summary,
    ...(result.ok ? {} : { locator: input.testCommand.command }),
  };
}

const RUNNERS: Record<GateName, (input: GateInput) => Promise<GateResult>> = {
  hash: hashGate,
  schema: schemaGate,
  grep: grepGate,
  test: testGate,
};

/**
 * Deterministic verification runs first and in a fixed order. Whatever these
 * settle is never re-litigated by a model; the model only sees the remainder.
 */
export async function runDeterministicGates(
  gates: readonly GateName[],
  input: GateInput,
): Promise<{ results: GateResult[]; allPassed: boolean; firstFailure: GateResult | null }> {
  const order: GateName[] = ["hash", "schema", "grep", "test"];
  const selected = order.filter((gate) => gates.includes(gate));
  const results: GateResult[] = [];
  for (const gate of selected) {
    const runner = RUNNERS[gate];
    const result = await runner(input);
    results.push(result);
  }
  const firstFailure = results.find((r) => !r.passed) ?? null;
  return { results, allPassed: !firstFailure, firstFailure };
}

export function recordGateResults(
  db: FloorDb,
  taskId: string,
  results: readonly GateResult[],
  rework: boolean,
  clock: TimeSource,
): void {
  const insert = db.prepare(
    "INSERT INTO gate_results (task_id, gate, passed, rework, at) VALUES (?, ?, ?, ?, ?)",
  );
  const at = clock.now();
  for (const result of results) {
    insert.run(taskId, result.gate, result.passed ? 1 : 0, rework ? 1 : 0, at);
  }
}

export interface GateStats {
  total: number;
  passed: number;
  passRate: number;
  reworkRate: number;
}

export function gateStats(db: FloorDb, sinceEventTime: number): GateStats {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(passed) AS passed,
              SUM(rework) AS rework
       FROM gate_results WHERE at >= ?`,
    )
    .get(sinceEventTime) as Record<string, unknown> | undefined;
  const total = asNumber(row?.["total"]);
  const passed = asNumber(row?.["passed"]);
  const rework = asNumber(row?.["rework"]);
  return {
    total,
    passed,
    passRate: total === 0 ? 1 : passed / total,
    reworkRate: total === 0 ? 0 : rework / total,
  };
}
