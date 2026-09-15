import type { FloorDb } from "../queue/sqlite.js";
import type { TimeSource } from "../time/index.js";
import { asNumber, asText } from "../queue/sqlite.js";

export type ChannelEventType =
  | "message"
  | "progress"
  | "approval"
  | "artifact"
  | "delegate"
  /** Someone was invited (or similar room notice). Shown as a Slack-style line. */
  | "system";

export interface ChannelEvent {
  id: string;
  channelId: string;
  authorId: string;
  type: ChannelEventType;
  payload: Record<string, unknown>;
  ts: number;
}

function rowToEvent(row: Record<string, unknown>): ChannelEvent {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(asText(row["payload_json"]) || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = {};
  }
  return {
    id: asText(row["id"]),
    channelId: asText(row["channel_id"]),
    authorId: asText(row["author_id"]),
    type: asText(row["type"]) as ChannelEventType,
    payload,
    ts: asNumber(row["ts"]),
  };
}

/**
 * The single transcript log for every chat. Messages, progress, approvals,
 * artifacts and handoffs all append here so the UI never has two sources of
 * truth for the same room.
 */
export class ChannelEventStore {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  append(input: {
    id: string;
    channelId: string;
    authorId: string;
    type: ChannelEventType;
    payload: Record<string, unknown>;
    ts?: number;
  }): ChannelEvent {
    const ts = input.ts ?? this.#clock.now();
    this.#db
      .prepare(
        `INSERT INTO channel_events (id, channel_id, author_id, type, payload_json, ts)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.channelId,
        input.authorId,
        input.type,
        JSON.stringify(input.payload),
        ts,
      );
    return {
      id: input.id,
      channelId: input.channelId,
      authorId: input.authorId,
      type: input.type,
      payload: input.payload,
      ts,
    };
  }

  list(
    channelId: string,
    sinceTs = 0,
    limit = 500,
  ): ChannelEvent[] {
    const rows = this.#db
      .prepare(
        // Two events can share a timestamp - a virtual clock does not tick
        // between them, and a real one has coarser milliseconds than the code
        // that writes here. Insertion order is the only honest tiebreak, and
        // random ids sorted the handoff before the request that caused it.
        `SELECT * FROM channel_events
         WHERE channel_id = ? AND ts >= ?
         ORDER BY ts ASC, rowid ASC
         LIMIT ?`,
      )
      .all(channelId, sinceTs, limit) as Array<Record<string, unknown>>;
    return rows.map(rowToEvent);
  }

  clearChannel(channelId: string): number {
    const result = this.#db
      .prepare("DELETE FROM channel_events WHERE channel_id = ?")
      .run(channelId);
    return Number(result.changes ?? 0);
  }

  /**
   * Drop every event that follows the anchor in a channel, keeping the anchor
   * itself.
   *
   * Regenerating an answer rewrites a conversation from one user line onward.
   * The chat_sessions row is truncated to match, but this log is the room's
   * other source of truth: left untouched, the superseded replies come back on
   * the next poll (`ingestChannelEvents`) and re-corrupt the saved chat after a
   * refresh. Removing them here keeps both stores telling the same story.
   *
   * The boundary is the (ts, rowid) pair, the same order `list` returns, so a
   * later event that happens to share the anchor's millisecond is still dropped.
   */
  truncateAfter(channelId: string, anchorEventId: string): number {
    const row = this.#db
      .prepare(
        "SELECT ts, rowid FROM channel_events WHERE id = ? AND channel_id = ?",
      )
      .get(anchorEventId, channelId) as Record<string, unknown> | undefined;
    if (!row) return 0;
    const ts = asNumber(row["ts"]);
    const rowid = asNumber(row["rowid"]);
    const result = this.#db
      .prepare(
        `DELETE FROM channel_events
         WHERE channel_id = ?
           AND (ts > ? OR (ts = ? AND rowid > ?))`,
      )
      .run(channelId, ts, ts, rowid);
    return Number(result.changes ?? 0);
  }
}
