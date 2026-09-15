import type { TimeSource } from "../time/index.js";
import { asNumber, asText, type FloorDb } from "../queue/sqlite.js";
import { APPROVAL_TRAY_HALT_THRESHOLD } from "../policy.js";
import type { EvidenceRef } from "../bus/types.js";

export type ApprovalKind = "outbound" | "escalation" | "meeting-deadlock" | "budget";

export interface ApprovalItem {
  id: string;
  traceId: string;
  taskId: string | null;
  staffId: string;
  kind: ApprovalKind;
  /** One line. The tray is read standing up. */
  headline: string;
  detail: string;
  evidence: EvidenceRef[];
  /** The opposing view, shown beside the recommendation. */
  dissent: string | null;
  options: string[];
  createdAt: number;
  state: "pending" | "approved" | "rejected";
  resolvedAt: number | null;
  decision: string | null;
}

function rowToItem(row: Record<string, unknown>): ApprovalItem {
  const state = asText(row["state"], "pending");
  return {
    id: asText(row["id"]),
    traceId: asText(row["trace_id"]),
    taskId: typeof row["task_id"] === "string" ? row["task_id"] : null,
    staffId: asText(row["staff_id"]),
    kind: asText(row["kind"], "escalation") as ApprovalKind,
    headline: asText(row["headline"]),
    detail: asText(row["detail"]),
    evidence: JSON.parse(asText(row["evidence"], "[]")) as EvidenceRef[],
    dissent: typeof row["dissent"] === "string" ? row["dissent"] : null,
    options: JSON.parse(asText(row["options"], "[]")) as string[],
    createdAt: asNumber(row["created_at"]),
    state: state === "approved" || state === "rejected" ? state : "pending",
    resolvedAt: row["resolved_at"] === null ? null : asNumber(row["resolved_at"]),
    decision: typeof row["decision"] === "string" ? row["decision"] : null,
  };
}

/**
 * The physical in-tray. It is a view over the existing approval gate, not a
 * second permission system: nothing is granted here that the security bundle
 * did not already require a human for.
 *
 * Past five pending items the Floor halts production (I3).
 */
export class ApprovalTray {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  queue(input: {
    id: string;
    traceId: string;
    taskId?: string | null;
    staffId: string;
    kind: ApprovalKind;
    headline: string;
    detail: string;
    evidence: EvidenceRef[];
    dissent?: string | null;
    options: string[];
  }): ApprovalItem {
    this.#db
      .prepare(
        `INSERT OR REPLACE INTO approvals
         (id, trace_id, task_id, staff_id, kind, headline, detail, evidence, dissent,
          options, created_at, state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .run(
        input.id,
        input.traceId,
        input.taskId ?? null,
        input.staffId,
        input.kind,
        input.headline.slice(0, 300),
        input.detail.slice(0, 4_000),
        JSON.stringify(input.evidence),
        input.dissent ?? null,
        JSON.stringify(input.options),
        this.#clock.now(),
      );
    const item = this.get(input.id);
    if (!item) throw new Error(`Approval ${input.id} could not be queued`);
    return item;
  }

  get(id: string): ApprovalItem | null {
    const row = this.#db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToItem(row) : null;
  }

  pending(): ApprovalItem[] {
    const rows = this.#db
      .prepare("SELECT * FROM approvals WHERE state = 'pending' ORDER BY created_at ASC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToItem);
  }

  all(): ApprovalItem[] {
    const rows = this.#db
      .prepare("SELECT * FROM approvals ORDER BY created_at DESC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToItem);
  }

  pendingCount(): number {
    const row = this.#db
      .prepare("SELECT COUNT(*) AS n FROM approvals WHERE state = 'pending'")
      .get() as Record<string, unknown> | undefined;
    return asNumber(row?.["n"]);
  }

  /** True once the tray is over the line and producers must stop. */
  isOverflowing(): boolean {
    return this.pendingCount() > APPROVAL_TRAY_HALT_THRESHOLD;
  }

  resolve(id: string, approved: boolean, decision: string): ApprovalItem | null {
    this.#db
      .prepare(
        "UPDATE approvals SET state = ?, resolved_at = ?, decision = ? WHERE id = ? AND state = 'pending'",
      )
      .run(
        approved ? "approved" : "rejected",
        this.#clock.now(),
        decision.slice(0, 500),
        id,
      );
    return this.get(id);
  }

  /** Empty the tray. Pending cards die with the chat that raised them. */
  clearAll(): number {
    const result = this.#db.prepare("DELETE FROM approvals").run();
    return asNumber(result.changes);
  }
}

export { APPROVAL_TRAY_HALT_THRESHOLD };
