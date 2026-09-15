import { appendFile, mkdir, open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import type { TimeSource } from "../office/time/index.js";

/**
 * Append-only JSONL audit log. This is the only event store the office has:
 * the board, the timeline scrubber and the DailyBrief all replay from here,
 * and the execution path never talks to the renderer directly.
 *
 * `eventTime` and `displayTime` are separate fields and must stay that way.
 * `eventTime` is when the thing actually happened; it is evidence and is never
 * adjusted. `displayTime` is what a replay may place on a timeline so a
 * virtual day can be watched in two minutes. Collapsing them into one field
 * makes the log worthless as a record of what the machine really did.
 */

export type AuditKind = "tool_call" | "approval" | "policy_deny" | "error" | "lifecycle";

export type ApprovalState = "none" | "requested" | "granted" | "denied";

export interface AuditEntry {
  /** Real instant the event happened. Evidence. Never altered. */
  eventTime: number;
  /** Timeline position for replay. May be scaled; never used as evidence. */
  displayTime: number;
  traceId: string | null;
  taskId: string | null;
  staffMemberId: string | null;
  kind: AuditKind;
  /**
   * Fine-grained name within `kind` (e.g. "approval.queued", "task.finished").
   * `kind` buckets a row for filtering; the brief and the timeline need to tell
   * an approval from a finished task, which five buckets cannot express.
   */
  event: string;
  toolName: string | null;
  argsSummary: string;
  resultSummary: string;
  resultBytes: number;
  approvalState: ApprovalState;
  /** Snapshot of the policy evaluation that allowed or refused this. */
  scope: AuditScope | null;
}

export interface AuditScope {
  at: number;
  profile?: string;
  group?: string;
  allowed?: boolean;
  reason?: string;
}

let auditRoot: string | null = null;

export function configureToolAudit(userDataPath: string): string {
  auditRoot = join(userDataPath, "audit");
  return auditRoot;
}

/** Empty the JSONL log. Channel system notes are read from here. */
export async function clearAuditLog(): Promise<void> {
  if (!auditRoot) return;
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(auditRoot, { recursive: true });
  await writeFile(logPath(), "", "utf8");
}

function logPath(): string {
  if (!auditRoot) throw new Error("Audit log is not configured");
  return join(auditRoot, "events.jsonl");
}

export function summarizeArgs(args: Record<string, unknown>): string {
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string") {
      clone[k] = v.length > 120 ? `${v.slice(0, 117)}...(${v.length})` : v;
    } else if (Array.isArray(v)) {
      clone[k] = `array(len=${v.length})`;
    } else if (v && typeof v === "object") {
      clone[k] = "object";
    } else {
      clone[k] = v;
    }
  }
  return JSON.stringify(clone);
}

export interface AppendAuditInput {
  kind: AuditKind;
  event?: string;
  /**
   * Domain clock that stamps `eventTime`. Required: an optional clock would let
   * a call site silently fall back to wall time, which under a virtual clock
   * writes a timestamp that contradicts every other row in the same run.
   * Callers outside a scheduler pass an explicit RealTimeSource.
   */
  clock: TimeSource;
  /**
   * Replay position. Defaults to `eventTime`, i.e. no dramatisation. Only a
   * replay driver passes something different.
   */
  displayTime?: number;
  traceId?: string | null;
  taskId?: string | null;
  staffMemberId?: string | null;
  toolName?: string | null;
  args?: Record<string, unknown>;
  argsSummary?: string;
  resultSummary?: string;
  resultBytes?: number;
  approvalState?: ApprovalState;
  scope?: AuditScope | null;
}

export async function appendAudit(input: AppendAuditInput): Promise<AuditEntry> {
  const eventTime = input.clock.now();
  const resultSummary = (input.resultSummary ?? "").slice(0, 500);
  const row: AuditEntry = {
    eventTime,
    displayTime: input.displayTime ?? eventTime,
    traceId: input.traceId ?? null,
    taskId: input.taskId ?? null,
    staffMemberId: input.staffMemberId ?? null,
    kind: input.kind,
    event: input.event ?? input.kind,
    toolName: input.toolName ?? null,
    argsSummary: input.argsSummary ?? (input.args ? summarizeArgs(input.args) : ""),
    resultSummary,
    resultBytes: input.resultBytes ?? Buffer.byteLength(resultSummary, "utf8"),
    approvalState: input.approvalState ?? "none",
    scope: input.scope ?? null,
  };
  if (!auditRoot) return row;
  await mkdir(auditRoot, { recursive: true });
  await appendFile(logPath(), `${JSON.stringify(row)}\n`, "utf8");
  return row;
}

/**
 * Office lifecycle events. Same file, same schema — this only maps the
 * fine-grained office vocabulary onto the five audit kinds so callers do not
 * each invent their own bucketing. There is no second event store.
 */
export type OfficeEventName =
  | "runtime.started"
  | "runtime.stopped"
  | "power.event"
  | "task.enqueued"
  | "task.started"
  | "task.progress"
  | "task.checkpoint"
  | "task.finished"
  | "task.failed"
  | "task.aborted"
  | "task.rejected"
  | "message.accepted"
  | "message.rejected"
  | "message.delivered"
  | "gate.passed"
  | "gate.failed"
  | "governor.killed"
  | "governor.debounced"
  | "trace.budget.exceeded"
  | "meeting.opened"
  | "meeting.round"
  | "meeting.escalated"
  | "meeting.closed"
  | "approval.queued"
  | "approval.resolved"
  | "production.halted"
  | "production.resumed"
  | "directive.applied"
  | "budget.spent"
  | "budget.exhausted"
  | "brief.published"
  | "floor.greeted"
  /**
   * Intake had nothing workable to hand out and asked the person what they
   * want instead. The model's account of why it could not proceed rides along
   * in `detail.reason`, for whoever is debugging the office rather than for
   * whoever typed the line.
   */
  | "floor.needsGoal"
  /**
   * A seat could not use its own answer on the first turn of a person's goal.
   * `detail.reason` carries the parser or denial text, which is written for
   * whoever is debugging the office and never for the reader.
   */
  | "floor.glitch"
  /**
   * A seat answered a question instead of turning it into work. `resultSummary`
   * is the answer itself, written for the person who asked and in their
   * language, which makes it the one office event whose summary is not for a
   * maintainer.
   */
  | "floor.answered"
  /**
   * A lead's REQUEST was shortened before it hit the bus. The assignee already
   * gets the channel brief, so a pasted dataset is waste - and it is what made
   * the office look like it was typing the deliverable into chat.
   */
  | "floor.requestTrimmed"
  /**
   * A person spoke to work that was already running, so it joined that work
   * instead of opening a job of its own. Deliberately not a channel note: their
   * words are already in the thread, and a line under them confirming delivery
   * is bookkeeping.
   */
  | "floor.followUp"
  | "channel.created"
  | "member.mentioned"
  | "delegate.called"
  | "artifact.reverted"
  | "desktop.stopped";

function kindOf(event: OfficeEventName): AuditKind {
  if (event.startsWith("approval.")) return "approval";
  if (event === "message.rejected") return "policy_deny";
  if (event === "task.failed" || event === "governor.killed") return "error";
  return "lifecycle";
}

function approvalStateOf(event: OfficeEventName, approved?: boolean): ApprovalState {
  if (event === "approval.queued") return "requested";
  if (event === "approval.resolved") return approved ? "granted" : "denied";
  return "none";
}

export async function appendOfficeEvent(entry: {
  event: OfficeEventName;
  summary: string;
  clock: TimeSource;
  traceId?: string;
  taskId?: string;
  staffId?: string;
  messageId?: string;
  approved?: boolean;
  detail?: Record<string, unknown>;
}): Promise<AuditEntry> {
  const eventTime = entry.clock.now();
  const detail = entry.messageId
    ? { ...(entry.detail ?? {}), messageId: entry.messageId }
    : entry.detail;
  return appendAudit({
    kind: kindOf(entry.event),
    event: entry.event,
    clock: entry.clock,
    ...(entry.traceId ? { traceId: entry.traceId } : {}),
    ...(entry.taskId ? { taskId: entry.taskId } : {}),
    ...(entry.staffId ? { staffMemberId: entry.staffId } : {}),
    resultSummary: entry.summary,
    argsSummary: detail ? summarizeArgs(detail) : "",
    approvalState: approvalStateOf(entry.event, entry.approved),
    scope: { at: eventTime },
  });
}

/** First read window when the caller only wants recent rows. 256 KiB ≈ 700 rows. */
const TAIL_CHUNK_BYTES = 256 * 1024;

function parseChunk(
  text: string,
  options: { sinceEventTime?: number; kinds?: readonly AuditKind[] } | undefined,
  atFileStart: boolean,
): { rows: AuditEntry[]; reachedStart: boolean; carry: string } {
  const lines = text.split("\n");
  // A byte window opens mid-line unless it opens at byte 0. That head belongs
  // to the next (older) chunk, which ends with the rest of the same line.
  const carry = atFileStart ? "" : (lines.shift() ?? "");
  const rows: AuditEntry[] = [];
  let reachedStart = false;
  for (const line of lines) {
    if (!line) continue;
    let parsed: AuditEntry;
    try {
      parsed = JSON.parse(line) as AuditEntry;
    } catch {
      continue; // skip corrupt
    }
    if (options?.sinceEventTime !== undefined && parsed.eventTime < options.sinceEventTime) {
      // Rows are appended in eventTime order, so everything older than this
      // one is outside the requested range too.
      reachedStart = true;
      continue;
    }
    if (options?.kinds && !options.kinds.includes(parsed.kind)) continue;
    rows.push(parsed);
  }
  return { rows, reachedStart, carry };
}

/**
 * Chronological (oldest first) — the timeline scrubber reads forward.
 *
 * A bounded read (`sinceEventTime` or `limit`) walks backwards from the end of
 * the file in windows instead of parsing the whole log. The board rebuilds a
 * snapshot on every change, and parsing a log that only ever grows made the
 * Floor slower the longer it had been running.
 */
export async function readAudit(options?: {
  sinceEventTime?: number;
  kinds?: readonly AuditKind[];
  limit?: number;
}): Promise<AuditEntry[]> {
  if (!auditRoot) return [];
  const limit = options?.limit;
  const bounded = options?.sinceEventTime !== undefined || typeof limit === "number";
  let handle: FileHandle | undefined;
  try {
    handle = await open(logPath(), "r");
    const size = (await handle.stat()).size;
    if (size === 0) return [];

    if (!bounded) {
      const raw = await handle.readFile("utf8");
      return parseChunk(raw, options, true).rows;
    }

    // Walk backwards a chunk at a time, parsing each chunk once and keeping
    // the running result oldest-first.
    let rows: AuditEntry[] = [];
    let carry = "";
    let end = size;
    let chunkBytes = TAIL_CHUNK_BYTES;
    while (end > 0) {
      const start = Math.max(0, end - chunkBytes);
      const length = end - start;
      const buffer = Buffer.allocUnsafe(length);
      await handle.read(buffer, 0, length, start);
      const chunk = parseChunk(buffer.toString("utf8") + carry, options, start === 0);
      carry = chunk.carry;
      rows = chunk.rows.concat(rows);
      // Older rows can only fall outside the window or off the end of the
      // limit slice, so there is nothing left worth reading.
      if (chunk.reachedStart) break;
      if (typeof limit === "number" && rows.length >= limit) break;
      end = start;
      chunkBytes *= 4;
    }
    return typeof limit === "number" && rows.length > limit ? rows.slice(-limit) : rows;
  } catch {
    return [];
  } finally {
    await handle?.close().catch(() => {});
  }
}

/** Newest first, for the settings audit table. */
export async function readRecentAudit(limit = 200): Promise<AuditEntry[]> {
  const all = await readAudit({ limit: Math.max(1, Math.min(limit, 1000)) });
  return all.reverse();
}
