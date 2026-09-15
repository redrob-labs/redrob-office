import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { configureToolAudit, readAudit, type AuditEntry } from "./tool-audit.js";

const ROWS = 4_000;
const BASE = 1_700_000_000_000;
let logFile = "";

function rowAt(index: number): AuditEntry {
  return {
    eventTime: BASE + index * 1_000,
    displayTime: BASE + index * 1_000,
    traceId: `trace-${index}`,
    taskId: `task-${index}`,
    staffMemberId: index % 2 === 0 ? "price-watcher" : "editor",
    kind: index % 3 === 0 ? "approval" : "tool_call",
    event: "message.accepted",
    toolName: "fs.read",
    argsSummary: "a".repeat(200),
    resultSummary: `row ${index}`,
    resultBytes: 200,
    approvalState: "none",
    scope: { at: BASE + index * 1_000 },
  };
}

/** Reference implementation: parse every line of the file. */
async function readWholeFile(options: {
  sinceEventTime?: number;
  kinds?: readonly AuditEntry["kind"][];
  limit?: number;
}): Promise<AuditEntry[]> {
  const raw = await readFile(logFile, "utf8");
  const out: AuditEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let parsed: AuditEntry;
    try {
      parsed = JSON.parse(line) as AuditEntry;
    } catch {
      continue;
    }
    if (options.sinceEventTime !== undefined && parsed.eventTime < options.sinceEventTime) continue;
    if (options.kinds && !options.kinds.includes(parsed.kind)) continue;
    out.push(parsed);
  }
  const limit = options.limit;
  return typeof limit === "number" && out.length > limit ? out.slice(-limit) : out;
}

describe("readAudit", () => {
  beforeAll(() => {
    const dir = configureToolAudit(mkdtempSync(join(tmpdir(), "audit-read-")));
    mkdirSync(dir, { recursive: true });
    logFile = join(dir, "events.jsonl");
    const lines: string[] = [];
    for (let i = 0; i < ROWS; i += 1) lines.push(JSON.stringify(rowAt(i)));
    // A corrupt line must not break the reader.
    lines.splice(ROWS - 50, 0, "{ not json");
    writeFileSync(logFile, `${lines.join("\n")}\n`, "utf8");
  });

  // The board rebuilds a snapshot on every change, so a bounded read must not
  // parse the whole log. It still has to agree with a full parse exactly.
  it.each([
    ["snapshot window with a limit", { sinceEventTime: BASE + (ROWS - 500) * 1_000, limit: 400 }],
    ["window with no limit", { sinceEventTime: BASE + (ROWS - 900) * 1_000 }],
    ["limit only", { limit: 200 }],
    ["limit larger than the log", { limit: ROWS + 10 }],
    ["window older than the log", { sinceEventTime: 0, limit: 50 }],
    ["kind filter with a limit", { kinds: ["approval"] as const, limit: 30 }],
    ["unbounded", {}],
  ])("matches a full parse: %s", async (_label, query) => {
    expect(await readAudit(query)).toEqual(await readWholeFile(query));
  });

  it("returns rows oldest first", async () => {
    const rows = await readAudit({ limit: 5 });
    expect(rows.map((row) => row.resultSummary)).toEqual([
      `row ${ROWS - 5}`,
      `row ${ROWS - 4}`,
      `row ${ROWS - 3}`,
      `row ${ROWS - 2}`,
      `row ${ROWS - 1}`,
    ]);
  });

  it("reads rows that straddle a chunk boundary", async () => {
    // Every row is ~500 bytes, so 4000 rows is well past the 256 KiB first
    // window and the reader has to stitch a split line back together.
    const rows = await readAudit({ limit: 2_000 });
    expect(rows).toHaveLength(2_000);
    expect(rows[0]?.resultSummary).toBe(`row ${ROWS - 2_000}`);
    expect(rows.at(-1)?.resultSummary).toBe(`row ${ROWS - 1}`);
  });
});
