import type { TimeSource } from "../time/index.js";
import { asNumber, asText, type FloorDb } from "../queue/sqlite.js";
import type { TaskCheckpoint, TaskRecord, TaskState } from "./types.js";

function rowToTask(row: Record<string, unknown>): TaskRecord {
  const checkpointRaw = row["checkpoint"];
  let checkpoint: TaskCheckpoint | null = null;
  if (typeof checkpointRaw === "string" && checkpointRaw) {
    try {
      checkpoint = JSON.parse(checkpointRaw) as TaskCheckpoint;
    } catch {
      checkpoint = null;
    }
  }
  const payloadRaw = row["payload"];
  let payload: Record<string, unknown> | null = null;
  if (typeof payloadRaw === "string" && payloadRaw) {
    try {
      payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }
  return {
    id: asText(row["id"]),
    traceId: asText(row["trace_id"]),
    staffId: asText(row["staff_id"]),
    templateId: asText(row["template_id"]),
    title: asText(row["title"]),
    instruction: asText(row["instruction"]),
    state: asText(row["state"], "queued") as TaskState,
    createdAt: asNumber(row["created_at"]),
    notBefore: asNumber(row["not_before"]),
    payload,
    startedAt: row["started_at"] === null ? null : asNumber(row["started_at"]),
    finishedAt: row["finished_at"] === null ? null : asNumber(row["finished_at"]),
    checkpoint,
    result: typeof row["result"] === "string" ? row["result"] : null,
    tokens: asNumber(row["tokens"]),
    seat: row["seat"] === null || row["seat"] === undefined ? null : asNumber(row["seat"]),
  };
}

export class TaskStore {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  create(input: {
    id: string;
    traceId: string;
    staffId: string;
    templateId: string;
    title: string;
    instruction: string;
    seat?: number;
    /** Earliest domain time this may run. Delay is data, never a sleep. */
    notBefore?: number;
    payload?: Record<string, unknown>;
  }): TaskRecord {
    const now = this.#clock.now();
    this.#db
      .prepare(
        `INSERT OR REPLACE INTO tasks
         (id, trace_id, staff_id, template_id, title, instruction, state,
          created_at, not_before, payload, tokens, seat)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, 0, ?)`,
      )
      .run(
        input.id,
        input.traceId,
        input.staffId,
        input.templateId,
        input.title,
        input.instruction,
        now,
        input.notBefore ?? now,
        input.payload ? JSON.stringify(input.payload) : null,
        input.seat ?? null,
      );
    const task = this.get(input.id);
    if (!task) throw new Error(`Task ${input.id} could not be created`);
    return task;
  }

  get(id: string): TaskRecord | null {
    const row = this.#db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToTask(row) : null;
  }

  list(): TaskRecord[] {
    const rows = this.#db
      .prepare("SELECT * FROM tasks ORDER BY created_at ASC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToTask);
  }

  listByState(state: TaskState): TaskRecord[] {
    const rows = this.#db
      .prepare("SELECT * FROM tasks WHERE state = ? ORDER BY created_at ASC")
      .all(state) as Array<Record<string, unknown>>;
    return rows.map(rowToTask);
  }

  /**
   * Queued tasks whose `notBefore` has arrived. A task that is not yet due is
   * simply not returned — nothing waits on it.
   */
  claimable(limit = 16): TaskRecord[] {
    const rows = this.#db
      .prepare(
        `SELECT * FROM tasks
         WHERE state = 'queued' AND not_before <= ?
         ORDER BY not_before ASC, created_at ASC
         LIMIT ?`,
      )
      .all(this.#clock.now(), Math.max(1, limit)) as Array<Record<string, unknown>>;
    return rows.map(rowToTask);
  }

  /** Earliest `notBefore` still ahead of us, for the scheduler's wake timer. */
  nextDueAt(): number | null {
    const row = this.#db
      .prepare(
        "SELECT MIN(not_before) AS next FROM tasks WHERE state = 'queued' AND not_before > ?",
      )
      .get(this.#clock.now()) as Record<string, unknown> | undefined;
    const next = row?.["next"];
    return typeof next === "number" ? next : null;
  }

  /** Park a task until `at` instead of holding a runner open. */
  deferUntil(id: string, at: number): void {
    this.#db
      .prepare("UPDATE tasks SET state = 'queued', not_before = ? WHERE id = ?")
      .run(at, id);
  }

  markStarted(id: string): void {
    this.#db
      .prepare("UPDATE tasks SET state = 'running', started_at = ? WHERE id = ?")
      .run(this.#clock.now(), id);
  }

  setState(id: string, state: TaskState): void {
    this.#db.prepare("UPDATE tasks SET state = ? WHERE id = ?").run(state, id);
  }

  saveCheckpoint(id: string, checkpoint: TaskCheckpoint): void {
    this.#db
      .prepare("UPDATE tasks SET checkpoint = ?, state = 'checkpointed' WHERE id = ?")
      .run(JSON.stringify(checkpoint), id);
  }

  finish(id: string, state: TaskState, result: string, tokens: number): void {
    this.#db
      .prepare(
        "UPDATE tasks SET state = ?, finished_at = ?, result = ?, tokens = tokens + ? WHERE id = ?",
      )
      .run(state, this.#clock.now(), result.slice(0, 20_000), Math.max(0, tokens), id);
  }

  addTokens(id: string, tokens: number): void {
    this.#db
      .prepare("UPDATE tasks SET tokens = tokens + ? WHERE id = ?")
      .run(Math.max(0, Math.round(tokens)), id);
  }

  /** After a crash: anything mid-flight is checkpointed so it resumes cleanly. */
  recoverRunning(reason: TaskCheckpoint["reason"]): TaskRecord[] {
    const running = this.listByState("running");
    for (const task of running) {
      this.saveCheckpoint(task.id, {
        at: this.#clock.now(),
        iterations: task.checkpoint?.iterations ?? 0,
        partialText: task.checkpoint?.partialText ?? "",
        reason,
      });
    }
    return running;
  }
}
