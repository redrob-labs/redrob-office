import type { FloorDb } from "../queue/sqlite.js";
import type { TimeSource } from "../time/index.js";
import { asNumber, asText } from "../queue/sqlite.js";

export type ChannelMemoryKind = "channel" | "shared";

export interface ChannelMemory {
  id: string;
  memberId: string;
  channelId: string;
  kind: ChannelMemoryKind;
  content: string;
  createdAt: number;
}

function rowToMemory(row: Record<string, unknown>): ChannelMemory {
  return {
    id: asText(row["id"]),
    memberId: asText(row["member_id"]),
    channelId: asText(row["channel_id"]),
    kind: asText(row["kind"]) as ChannelMemoryKind,
    content: asText(row["content"]),
    createdAt: asNumber(row["created_at"]),
  };
}

/**
 * What a teammate knows inside one chat. Lookups always take a channelId so
 * nothing leaks across rooms by accident. Shared memories exist only via an
 * explicit promote path and stay off by default.
 */
export class ChannelMemoryStore {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  list(input: {
    channelId: string;
    memberId?: string;
    includeShared?: boolean;
  }): ChannelMemory[] {
    const includeShared = Boolean(input.includeShared);
    const rows = input.memberId
      ? (this.#db
          .prepare(
            `SELECT * FROM memories_channel
             WHERE channel_id = ? AND member_id = ?
               AND (kind = 'channel' OR (? = 1 AND kind = 'shared'))
             ORDER BY created_at ASC`,
          )
          .all(input.channelId, input.memberId, includeShared ? 1 : 0) as Array<
          Record<string, unknown>
        >)
      : (this.#db
          .prepare(
            `SELECT * FROM memories_channel
             WHERE channel_id = ?
               AND (kind = 'channel' OR (? = 1 AND kind = 'shared'))
             ORDER BY created_at ASC`,
          )
          .all(input.channelId, includeShared ? 1 : 0) as Array<
          Record<string, unknown>
        >);
    return rows.map(rowToMemory);
  }

  add(input: {
    id: string;
    memberId: string;
    channelId: string;
    content: string;
    kind?: ChannelMemoryKind;
  }): ChannelMemory {
    const kind = input.kind ?? "channel";
    const createdAt = this.#clock.now();
    this.#db
      .prepare(
        `INSERT INTO memories_channel (id, member_id, channel_id, kind, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.memberId,
        input.channelId,
        kind,
        input.content,
        createdAt,
      );
    return {
      id: input.id,
      memberId: input.memberId,
      channelId: input.channelId,
      kind,
      content: input.content,
      createdAt,
    };
  }

  /** Promote a channel memory to shared. Off-by-default path; never automatic. */
  promote(id: string, channelId: string): ChannelMemory | null {
    const row = this.#db
      .prepare(
        "SELECT * FROM memories_channel WHERE id = ? AND channel_id = ?",
      )
      .get(id, channelId) as Record<string, unknown> | undefined;
    if (!row) return null;
    this.#db
      .prepare("UPDATE memories_channel SET kind = 'shared' WHERE id = ?")
      .run(id);
    return rowToMemory({ ...row, kind: "shared" });
  }

  remove(id: string, channelId: string): boolean {
    const result = this.#db
      .prepare(
        "DELETE FROM memories_channel WHERE id = ? AND channel_id = ?",
      )
      .run(id, channelId);
    return Number(result.changes ?? 0) > 0;
  }

  /** Wipe every memory a channel held, so a later channel can't inherit them. */
  clearChannel(channelId: string): number {
    const result = this.#db
      .prepare("DELETE FROM memories_channel WHERE channel_id = ?")
      .run(channelId);
    return Number(result.changes ?? 0);
  }
}
