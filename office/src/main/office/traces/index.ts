import type { TimeSource } from "../time/index.js";
import { asNumber, asText, type FloorDb } from "../queue/sqlite.js";

export interface TraceBudget {
  /** Total tokens the whole derivation tree may spend. */
  tokens: number;
  /** Maximum message depth below the root. */
  depth: number;
}

export interface TraceRecord {
  id: string;
  rootTaskId: string | null;
  createdAt: number;
  tokenBudget: number;
  tokensSpent: number;
  maxDepth: number;
  deepest: number;
  state: "open" | "escalated" | "closed" | "aborted";
  /** Active STEER text, inherited by every task derived from this trace. */
  steer: string | null;
}

export type BudgetVerdict =
  | { ok: true }
  | { ok: false; kind: "tokens" | "depth"; reason: string };

function rowToTrace(row: Record<string, unknown>): TraceRecord {
  const steer = row["steer"];
  const state = asText(row["state"], "open");
  return {
    id: asText(row["id"]),
    rootTaskId: typeof row["root_task_id"] === "string" ? row["root_task_id"] : null,
    createdAt: asNumber(row["created_at"]),
    tokenBudget: asNumber(row["token_budget"]),
    tokensSpent: asNumber(row["tokens_spent"]),
    maxDepth: asNumber(row["max_depth"]),
    deepest: asNumber(row["deepest"]),
    state:
      state === "escalated" || state === "closed" || state === "aborted" ? state : "open",
    steer: typeof steer === "string" ? steer : null,
  };
}

/**
 * A Trace owns the budget for an entire derivation tree (I1). Exceeding it
 * stops derivation and raises ESCALATE; it never buys more headroom.
 */
export class TraceStore {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  open(id: string, budget: TraceBudget, rootTaskId?: string): TraceRecord {
    this.#db
      .prepare(
        `INSERT OR IGNORE INTO traces
         (id, root_task_id, created_at, token_budget, tokens_spent, max_depth, deepest, state)
         VALUES (?, ?, ?, ?, 0, ?, 0, 'open')`,
      )
      .run(id, rootTaskId ?? null, this.#clock.now(), budget.tokens, budget.depth);
    const trace = this.get(id);
    if (!trace) throw new Error(`Trace ${id} could not be opened`);
    return trace;
  }

  get(id: string): TraceRecord | null {
    const row = this.#db.prepare("SELECT * FROM traces WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToTrace(row) : null;
  }

  list(): TraceRecord[] {
    const rows = this.#db
      .prepare("SELECT * FROM traces ORDER BY created_at ASC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToTrace);
  }

  /**
   * Checked before every derived message. Returns the reason instead of
   * throwing so the caller can convert it into an ESCALATE.
   */
  checkDerivation(id: string, nextDepth: number, projectedTokens = 0): BudgetVerdict {
    const trace = this.get(id);
    if (!trace) return { ok: true };
    if (nextDepth > trace.maxDepth) {
      return {
        ok: false,
        kind: "depth",
        reason: `Trace depth ${nextDepth} exceeds limit ${trace.maxDepth}`,
      };
    }
    if (trace.tokensSpent + projectedTokens > trace.tokenBudget) {
      return {
        ok: false,
        kind: "tokens",
        reason: `Trace tokens ${trace.tokensSpent + projectedTokens} exceed budget ${trace.tokenBudget}`,
      };
    }
    return { ok: true };
  }

  spend(id: string, tokens: number): TraceRecord | null {
    this.#db
      .prepare("UPDATE traces SET tokens_spent = tokens_spent + ? WHERE id = ?")
      .run(Math.max(0, Math.round(tokens)), id);
    return this.get(id);
  }

  recordDepth(id: string, depth: number): void {
    this.#db
      .prepare("UPDATE traces SET deepest = MAX(deepest, ?) WHERE id = ?")
      .run(depth, id);
  }

  setState(id: string, state: TraceRecord["state"]): void {
    this.#db.prepare("UPDATE traces SET state = ? WHERE id = ?").run(state, id);
  }

  /** STEER attaches to the trace, so every later task in the lineage inherits it. */
  setSteer(id: string, body: string | null): void {
    this.#db.prepare("UPDATE traces SET steer = ? WHERE id = ?").run(body, id);
  }
}

export type DirectiveKind = "STEER" | "ABORT" | "PIN";

export interface DirectiveRecord {
  id: string;
  kind: DirectiveKind;
  traceId: string | null;
  body: string;
  createdAt: number;
  /** Domain time of the next checkpoint that will honour this directive. */
  appliesFrom: number;
  active: boolean;
}

function rowToDirective(row: Record<string, unknown>): DirectiveRecord {
  const kind = asText(row["kind"], "PIN");
  return {
    id: asText(row["id"]),
    kind: kind === "STEER" || kind === "ABORT" ? kind : "PIN",
    traceId: typeof row["trace_id"] === "string" ? row["trace_id"] : null,
    body: asText(row["body"]),
    createdAt: asNumber(row["created_at"]),
    appliesFrom: asNumber(row["applies_from"]),
    active: asNumber(row["active"]) === 1,
  };
}

export class DirectiveStore {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  add(input: {
    id: string;
    kind: DirectiveKind;
    traceId?: string | null;
    body: string;
    appliesFrom: number;
  }): DirectiveRecord {
    this.#db
      .prepare(
        `INSERT OR REPLACE INTO directives (id, kind, trace_id, body, created_at, applies_from, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        input.id,
        input.kind,
        input.traceId ?? null,
        input.body,
        this.#clock.now(),
        input.appliesFrom,
      );
    const row = this.#db.prepare("SELECT * FROM directives WHERE id = ?").get(input.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new Error("Directive insert failed");
    return rowToDirective(row);
  }

  /** Global PINs plus the STEER attached to this trace, once effective. */
  effectiveFor(traceId: string, at: number): DirectiveRecord[] {
    const rows = this.#db
      .prepare(
        `SELECT * FROM directives
         WHERE active = 1 AND applies_from <= ?
           AND (kind = 'PIN' OR trace_id = ?)
         ORDER BY created_at ASC`,
      )
      .all(at, traceId) as Array<Record<string, unknown>>;
    return rows.map(rowToDirective);
  }

  list(): DirectiveRecord[] {
    const rows = this.#db
      .prepare("SELECT * FROM directives ORDER BY created_at DESC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToDirective);
  }

  deactivate(id: string): void {
    this.#db.prepare("UPDATE directives SET active = 0 WHERE id = ?").run(id);
  }
}
