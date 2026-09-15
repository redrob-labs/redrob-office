import type { TimeSource } from "../time/index.js";
import type { FloorMessage } from "../bus/types.js";
import { DEFAULT_CHANNEL_ID } from "../channels/index.js";
import { asNumber, asText, type FloorDb } from "./sqlite.js";

export interface QueuedRow {
  id: string;
  traceId: string;
  depth: number;
  type: string;
  from: string;
  to: string;
  channelId: string;
  createdAt: number;
  notBefore: number;
  meetingId?: string;
  message: FloorMessage;
  attempts: number;
  state: "pending" | "claimed" | "done" | "failed" | "dropped";
}

const STATES = new Set(["pending", "claimed", "done", "failed", "dropped"]);

function asState(value: unknown): QueuedRow["state"] {
  const text = asText(value, "pending");
  return STATES.has(text) ? (text as QueuedRow["state"]) : "pending";
}

function rowToQueued(row: Record<string, unknown>): QueuedRow {
  const message = JSON.parse(asText(row["payload"], "{}")) as FloorMessage;
  const meetingId = row["meeting_id"];
  return {
    id: asText(row["id"]),
    traceId: asText(row["trace_id"]),
    depth: asNumber(row["depth"]),
    type: asText(row["type"]),
    from: asText(row["sender"]),
    to: asText(row["recipient"]),
    channelId: asText(row["channel_id"], DEFAULT_CHANNEL_ID),
    createdAt: asNumber(row["created_at"]),
    notBefore: asNumber(row["not_before"]),
    ...(typeof meetingId === "string" && meetingId ? { meetingId } : {}),
    message,
    attempts: asNumber(row["attempts"]),
    state: asState(row["state"]),
  };
}

/**
 * SQLite-backed message queue. `not_before` is a column, so a paced message
 * costs nothing while it waits - no timer, no held runner, no sleep().
 */
export class FloorQueue {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  enqueue(message: FloorMessage): void {
    this.#db
      .prepare(
        `INSERT OR REPLACE INTO queue_messages
         (id, trace_id, depth, type, sender, recipient, channel_id, created_at,
          not_before, meeting_id, payload, state, attempts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
      )
      .run(
        message.id,
        message.traceId,
        message.depth,
        message.type,
        message.from,
        message.to,
        message.channelId,
        message.createdAt,
        message.notBefore,
        message.meetingId ?? null,
        JSON.stringify(message),
      );
  }

  /** Ready = pending and `not_before` has passed on the domain clock. */
  claimReady(limit: number): QueuedRow[] {
    if (limit <= 0) return [];
    const now = this.#clock.now();
    const rows = this.#db
      .prepare(
        `SELECT * FROM queue_messages
         WHERE state = 'pending' AND not_before <= ?
         ORDER BY not_before ASC, created_at ASC
         LIMIT ?`,
      )
      .all(now, limit) as Array<Record<string, unknown>>;
    const claimed: QueuedRow[] = [];
    const claim = this.#db.prepare(
      `UPDATE queue_messages
       SET state = 'claimed', claimed_at = ?, attempts = attempts + 1
       WHERE id = ? AND state = 'pending'`,
    );
    for (const row of rows) {
      const result = claim.run(now, asText(row["id"]));
      if (asNumber(result.changes) > 0) claimed.push(rowToQueued(row));
    }
    return claimed;
  }

  complete(id: string, state: "done" | "failed" | "dropped"): void {
    this.#db
      .prepare("UPDATE queue_messages SET state = ?, completed_at = ? WHERE id = ?")
      .run(state, this.#clock.now(), id);
  }

  /** Put a claimed message back, optionally re-paced. */
  release(id: string, notBefore?: number): void {
    if (notBefore === undefined) {
      this.#db.prepare("UPDATE queue_messages SET state = 'pending' WHERE id = ?").run(id);
      return;
    }
    this.#db
      .prepare("UPDATE queue_messages SET state = 'pending', not_before = ? WHERE id = ?")
      .run(notBefore, id);
  }

  /** Earliest domain time a pending message becomes ready, if any. */
  nextWakeAt(): number | null {
    const row = this.#db
      .prepare("SELECT MIN(not_before) AS next FROM queue_messages WHERE state = 'pending'")
      .get() as Record<string, unknown> | undefined;
    const next = row?.["next"];
    return next === null || next === undefined ? null : asNumber(next);
  }

  pendingCount(): number {
    const row = this.#db
      .prepare("SELECT COUNT(*) AS n FROM queue_messages WHERE state = 'pending'")
      .get() as Record<string, unknown> | undefined;
    return asNumber(row?.["n"]);
  }

  inFlightCount(): number {
    const row = this.#db
      .prepare("SELECT COUNT(*) AS n FROM queue_messages WHERE state = 'claimed'")
      .get() as Record<string, unknown> | undefined;
    return asNumber(row?.["n"]);
  }

  doneCount(): number {
    const row = this.#db
      .prepare("SELECT COUNT(*) AS n FROM queue_messages WHERE state = 'done'")
      .get() as Record<string, unknown> | undefined;
    return asNumber(row?.["n"]);
  }

  /** Crash recovery: claimed-but-unfinished rows go back to pending. */
  recoverClaimed(): number {
    const result = this.#db
      .prepare("UPDATE queue_messages SET state = 'pending' WHERE state = 'claimed'")
      .run();
    return asNumber(result.changes);
  }

  /**
   * Everything said on the bus since a point in time, in the order it was
   * said. Dropped rows are left out: a message the governor killed was never
   * heard by anyone. Pending rows are included so the channel can show that
   * someone is mid-sentence.
   *
   * Two messages can share a timestamp - a follow-up typed into a turn that is
   * already running is written in the same millisecond as the answer it is
   * about. The tie is broken by insertion order rather than by `id`, which is a
   * random UUID and would shuffle a conversation into a reply before its
   * question.
   */
  listSince(createdAfter: number, limit: number, channelId?: string): QueuedRow[] {
    const rows = (
      channelId
        ? this.#db
            .prepare(
              `SELECT * FROM queue_messages
               WHERE created_at > ? AND state != 'dropped' AND channel_id = ?
               ORDER BY created_at ASC, rowid ASC
               LIMIT ?`,
            )
            .all(createdAfter, channelId, limit)
        : this.#db
            .prepare(
              `SELECT * FROM queue_messages
               WHERE created_at > ? AND state != 'dropped'
               ORDER BY created_at ASC, rowid ASC
               LIMIT ?`,
            )
            .all(createdAfter, limit)
    ) as Array<Record<string, unknown>>;
    return rows.map(rowToQueued);
  }

  /** Everything a channel is still waiting on, so deleting it can clean up. */
  dropChannel(channelId: string): number {
    const result = this.#db
      .prepare(
        "UPDATE queue_messages SET state = 'dropped', completed_at = ? WHERE channel_id = ? AND state IN ('pending', 'claimed')",
      )
      .run(this.#clock.now(), channelId);
    return asNumber(result.changes);
  }

  /**
   * The channel a trace spoke in, for notes and tray cards that carry a trace
   * but no channel of their own. Null when the trace never reached the bus.
   */
  channelIdForTrace(traceId: string): string | null {
    const row = this.#db
      .prepare(
        "SELECT channel_id FROM queue_messages WHERE trace_id = ? ORDER BY created_at ASC LIMIT 1",
      )
      .get(traceId) as Record<string, unknown> | undefined;
    return row ? asText(row["channel_id"], DEFAULT_CHANNEL_ID) : null;
  }

  /** Traces that only ever spoke in this channel, for cascade deletes. */
  traceIdsInChannel(channelId: string): string[] {
    const rows = this.#db
      .prepare("SELECT DISTINCT trace_id FROM queue_messages WHERE channel_id = ?")
      .all(channelId) as Array<Record<string, unknown>>;
    return rows.map((row) => asText(row["trace_id"])).filter(Boolean);
  }

  deleteChannelMessages(channelId: string): number {
    const result = this.#db
      .prepare("DELETE FROM queue_messages WHERE channel_id = ?")
      .run(channelId);
    return asNumber(result.changes);
  }

  /** Every message on every channel. Used when the reader clears local data. */
  clearAll(): number {
    const result = this.#db.prepare("DELETE FROM queue_messages").run();
    return asNumber(result.changes);
  }

  listByTrace(traceId: string): QueuedRow[] {
    const rows = this.#db
      .prepare(
        "SELECT * FROM queue_messages WHERE trace_id = ? ORDER BY created_at ASC, rowid ASC",
      )
      .all(traceId) as Array<Record<string, unknown>>;
    return rows.map(rowToQueued);
  }

  /** Governor cycle-kill: drop everything still pending in a trace. */
  killTrace(traceId: string): number {
    const result = this.#db
      .prepare(
        "UPDATE queue_messages SET state = 'dropped', completed_at = ? WHERE trace_id = ? AND state = 'pending'",
      )
      .run(this.#clock.now(), traceId);
    return asNumber(result.changes);
  }
}
