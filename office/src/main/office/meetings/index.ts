import type { TimeSource } from "../time/index.js";
import { asNumber, asText, type FloorDb } from "../queue/sqlite.js";
import { MEETING_MAX_ROUNDS } from "../policy.js";

export interface MeetingRecord {
  id: string;
  traceId: string;
  topic: string;
  participants: string[];
  round: number;
  state: "open" | "escalated" | "closed";
  openedAt: number;
  closedAt: number | null;
  outcome: string | null;
}

export type RoundVerdict =
  | { ok: true; round: number }
  | { ok: false; round: number; reason: string };

function rowToMeeting(row: Record<string, unknown>): MeetingRecord {
  const state = asText(row["state"], "open");
  return {
    id: asText(row["id"]),
    traceId: asText(row["trace_id"]),
    topic: asText(row["topic"]),
    participants: JSON.parse(asText(row["participants"], "[]")) as string[],
    round: asNumber(row["round"]),
    state: state === "escalated" || state === "closed" ? state : "open",
    openedAt: asNumber(row["opened_at"]),
    closedAt: row["closed_at"] === null ? null : asNumber(row["closed_at"]),
    outcome: typeof row["outcome"] === "string" ? row["outcome"] : null,
  };
}

/**
 * Meetings are capped at two rounds (I6). A third round is not slowed down or
 * warned about: the room locks and the disagreement goes to the tray.
 */
export class MeetingRoom {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  open(input: { id: string; traceId: string; topic: string; participants: string[] }): MeetingRecord {
    this.#db
      .prepare(
        `INSERT OR IGNORE INTO meetings (id, trace_id, topic, participants, round, state, opened_at)
         VALUES (?, ?, ?, ?, 0, 'open', ?)`,
      )
      .run(
        input.id,
        input.traceId,
        input.topic,
        JSON.stringify(input.participants),
        this.#clock.now(),
      );
    const meeting = this.get(input.id);
    if (!meeting) throw new Error(`Meeting ${input.id} could not be opened`);
    return meeting;
  }

  get(id: string): MeetingRecord | null {
    const row = this.#db.prepare("SELECT * FROM meetings WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToMeeting(row) : null;
  }

  list(): MeetingRecord[] {
    const rows = this.#db
      .prepare("SELECT * FROM meetings ORDER BY opened_at ASC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToMeeting);
  }

  /**
   * Advance the round counter. Returns `ok: false` on the attempted third
   * round; the caller must escalate and close.
   */
  enterRound(id: string): RoundVerdict {
    const meeting = this.get(id);
    if (!meeting) return { ok: false, round: 0, reason: `Meeting ${id} not found` };
    if (meeting.state !== "open") {
      return { ok: false, round: meeting.round, reason: `Meeting ${id} is ${meeting.state}` };
    }
    const next = meeting.round + 1;
    if (next > MEETING_MAX_ROUNDS) {
      return {
        ok: false,
        round: next,
        reason: `Meeting ${id} reached round ${next}; the limit is ${MEETING_MAX_ROUNDS}`,
      };
    }
    this.#db.prepare("UPDATE meetings SET round = ? WHERE id = ?").run(next, id);
    return { ok: true, round: next };
  }

  escalateAndClose(id: string, outcome: string): MeetingRecord | null {
    this.#db
      .prepare(
        "UPDATE meetings SET state = 'escalated', closed_at = ?, outcome = ? WHERE id = ?",
      )
      .run(this.#clock.now(), outcome, id);
    return this.get(id);
  }

  close(id: string, outcome: string): MeetingRecord | null {
    this.#db
      .prepare("UPDATE meetings SET state = 'closed', closed_at = ?, outcome = ? WHERE id = ?")
      .run(this.#clock.now(), outcome, id);
    return this.get(id);
  }

  isLocked(id: string): boolean {
    const meeting = this.get(id);
    return !meeting || meeting.state !== "open";
  }
}

export { MEETING_MAX_ROUNDS };
