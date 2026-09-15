import { clockOf, type TimeSource } from "../time/index.js";
import { asNumber, type FloorDb } from "../queue/sqlite.js";
import type { OfficePolicy } from "../policy.js";

export interface Spend {
  tokens: number;
  budget: number;
  ratio: number;
  exhausted: boolean;
}

export interface ExhaustionEvent {
  at: number;
  action: "stop";
}

/**
 * One budget for the whole Floor, per local day. When it runs out the Floor
 * stops, and the DailyBrief says so at the top with the time.
 */
export class TokenMeter {
  readonly #db: FloorDb;
  readonly #policy: OfficePolicy;
  readonly #clock: TimeSource;
  #exhaustion: ExhaustionEvent | null = null;

  constructor(db: FloorDb, policy: OfficePolicy, clock: TimeSource) {
    this.#db = db;
    this.#policy = policy;
    this.#clock = clock;
  }

  #dayIndex(at = this.#clock.now()): number {
    return clockOf(at, this.#policy.timezoneOffsetMinutes).dayIndex;
  }

  #spendOf(tokens: number): Spend {
    const budget = this.#policy.tokenBudget;
    return {
      tokens,
      budget,
      ratio: budget === 0 ? 1 : tokens / budget,
      exhausted: tokens >= budget,
    };
  }

  spend(input: {
    staffId: string;
    traceId?: string;
    tokens: number;
    costMicros?: number;
  }): Spend {
    const at = this.#clock.now();
    this.#db
      .prepare(
        `INSERT INTO budget_ledger (day_index, staff_id, trace_id, tokens, cost_micros, at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        this.#dayIndex(at),
        input.staffId,
        input.traceId ?? null,
        Math.max(0, Math.round(input.tokens)),
        Math.max(0, Math.round(input.costMicros ?? 0)),
        at,
      );
    return this.daySpend();
  }

  daySpend(dayIndex = this.#dayIndex()): Spend {
    const row = this.#db
      .prepare("SELECT SUM(tokens) AS tokens FROM budget_ledger WHERE day_index = ?")
      .get(dayIndex) as Record<string, unknown> | undefined;
    return this.#spendOf(asNumber(row?.["tokens"]));
  }

  /**
   * Spend over a window rather than a calendar day. The morning brief covers
   * the last 24 hours, which spans two day indices.
   */
  spendSince(since: number): Spend {
    const row = this.#db
      .prepare("SELECT SUM(tokens) AS tokens FROM budget_ledger WHERE at >= ?")
      .get(since) as Record<string, unknown> | undefined;
    return this.#spendOf(asNumber(row?.["tokens"]));
  }

  costMicrosSince(since: number): number {
    const row = this.#db
      .prepare("SELECT SUM(cost_micros) AS cost FROM budget_ledger WHERE at >= ?")
      .get(since) as Record<string, unknown> | undefined;
    return asNumber(row?.["cost"]);
  }

  costMicros(dayIndex = this.#dayIndex()): number {
    const row = this.#db
      .prepare("SELECT SUM(cost_micros) AS cost FROM budget_ledger WHERE day_index = ?")
      .get(dayIndex) as Record<string, unknown> | undefined;
    return asNumber(row?.["cost"]);
  }

  /** Records the moment the budget ran out, and what the Floor did next. */
  noteExhaustion(): ExhaustionEvent {
    this.#exhaustion = { at: this.#clock.now(), action: "stop" };
    return this.#exhaustion;
  }

  lastExhaustion(): ExhaustionEvent | null {
    return this.#exhaustion;
  }

  /** Remaining tokens for the day; the Trace ceiling still applies on top. */
  remaining(): number {
    const spend = this.daySpend();
    return Math.max(0, spend.budget - spend.tokens);
  }
}
