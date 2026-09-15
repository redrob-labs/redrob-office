#!/usr/bin/env node
/**
 * Migrate pre-existing audit JSONL to the current schema.
 *
 * Two legacy files are folded into one `events.jsonl`:
 *   tools.jsonl  - tool calls, keyed on `at` (ISO wall clock)
 *   floor.jsonl  - office lifecycle events, keyed on `at` + `eventTime`
 *
 * `displayTime` is seeded equal to `eventTime`. The old logs never recorded a
 * presentation timestamp, so inventing one would be fabricating evidence; a
 * replay can set it later, but the migration will not guess.
 *
 * Usage:
 *   node scripts/migrate-audit-log.mjs [auditDir]
 *
 * Default auditDir is the Electron userData audit folder for this platform.
 * Writes events.jsonl and renames the originals to *.migrated.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile, rename, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

function defaultAuditDir() {
  const app = "redrob-office";
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), app, "audit");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", app, "audit");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), app, "audit");
}

function parseIso(value) {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : 0;
}

function lines(raw) {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** tools.jsonl row -> current schema. */
function fromToolRow(row) {
  const eventTime = parseIso(row.at);
  const resultSummary = String(row.resultSummary ?? "");
  const denied = row.approved === false && /denied by policy|denied/i.test(resultSummary);
  return {
    eventTime,
    displayTime: eventTime,
    traceId: null,
    taskId: null,
    staffMemberId: null,
    kind: row.error && denied ? "policy_deny" : row.error ? "error" : "tool_call",
    toolName: row.tool ?? null,
    argsSummary: String(row.argsSummary ?? ""),
    resultSummary,
    resultBytes: Buffer.byteLength(resultSummary, "utf8"),
    approvalState:
      row.approved === true ? "granted" : row.approved === false ? "denied" : "none",
    scope: null,
  };
}

/** floor.jsonl row -> current schema. */
function fromFloorRow(row) {
  const eventTime =
    typeof row.eventTime === "number" && Number.isFinite(row.eventTime)
      ? row.eventTime
      : parseIso(row.at);
  const summary = String(row.summary ?? "");
  const kind = String(row.kind ?? "");
  let mapped = "lifecycle";
  if (kind.startsWith("approval.")) mapped = "approval";
  else if (kind === "message.rejected") mapped = "policy_deny";
  else if (kind === "task.failed" || kind === "governor.killed") mapped = "error";
  return {
    eventTime,
    displayTime: eventTime,
    traceId: row.traceId ?? null,
    taskId: row.taskId ?? null,
    staffMemberId: row.staffId ?? null,
    kind: mapped,
    toolName: null,
    argsSummary: "",
    resultSummary: summary,
    resultBytes: Buffer.byteLength(summary, "utf8"),
    approvalState:
      kind === "approval.queued"
        ? "requested"
        : kind === "approval.resolved"
          ? row.detail?.approved === true
            ? "granted"
            : "denied"
          : "none",
    scope: { at: eventTime },
  };
}

async function main() {
  const dir = process.argv[2] ?? defaultAuditDir();
  if (!existsSync(dir)) {
    console.log(`No audit directory at ${dir} — nothing to migrate.`);
    return;
  }
  const present = await readdir(dir);
  const out = [];

  const toolsPath = join(dir, "tools.jsonl");
  if (present.includes("tools.jsonl")) {
    const rows = lines(await readFile(toolsPath, "utf8")).map(fromToolRow);
    out.push(...rows);
    console.log(`tools.jsonl: ${rows.length} rows`);
  }

  const floorPath = join(dir, "floor.jsonl");
  if (present.includes("floor.jsonl")) {
    const rows = lines(await readFile(floorPath, "utf8")).map(fromFloorRow);
    out.push(...rows);
    console.log(`floor.jsonl: ${rows.length} rows`);
  }

  if (out.length === 0) {
    console.log("No legacy rows found — nothing to migrate.");
    return;
  }

  out.sort((a, b) => a.eventTime - b.eventTime);

  const target = join(dir, "events.jsonl");
  const existing = present.includes("events.jsonl")
    ? lines(await readFile(target, "utf8"))
    : [];
  const merged = [...existing, ...out].sort((a, b) => a.eventTime - b.eventTime);

  await writeFile(target, merged.map((row) => `${JSON.stringify(row)}\n`).join(""), "utf8");
  if (present.includes("tools.jsonl")) await rename(toolsPath, `${toolsPath}.migrated`);
  if (present.includes("floor.jsonl")) await rename(floorPath, `${floorPath}.migrated`);

  console.log(`Wrote ${merged.length} rows to ${target}`);
  console.log("Originals renamed to *.migrated");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
