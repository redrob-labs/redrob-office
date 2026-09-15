import type { TimeSource } from "./time/index.js";
import { asNumber, asText, type FloorDb } from "./queue/sqlite.js";

export interface Interruption {
  /** Domain time the Floor stopped. */
  from: number;
  /** Domain time it resumed, or null while still stopped. */
  to: number | null;
  cause: "suspend" | "shutdown" | "crash" | "battery" | "budget" | "manual";
  note: string;
}

export interface FloorState {
  paused: boolean;
  productionHalted: boolean;
  updatedAt: number;
  interruptions: Interruption[];
}

const DEFAULT_STATE: Omit<FloorState, "updatedAt"> = {
  paused: false,
  productionHalted: false,
  interruptions: [],
};

/**
 * Floor state lives in SQLite, not memory, so a force-quit or an OS update
 * reboot comes back to the same state with its interruption history intact.
 */
export class FloorStateStore {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  load(): FloorState {
    const row = this.#db.prepare("SELECT * FROM floor_state WHERE id = 1").get() as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      const initial: FloorState = {
        ...DEFAULT_STATE,
        interruptions: [],
        updatedAt: this.#clock.now(),
      };
      this.save(initial);
      return initial;
    }
    let interruptions: Interruption[] = [];
    try {
      interruptions = JSON.parse(asText(row["interruptions"], "[]")) as Interruption[];
    } catch {
      interruptions = [];
    }
    return {
      paused: asNumber(row["paused"]) === 1,
      productionHalted: asNumber(row["production_halted"]) === 1,
      updatedAt: asNumber(row["updated_at"]),
      interruptions,
    };
  }

  save(state: FloorState): FloorState {
    this.#db
      .prepare(
        `INSERT INTO floor_state
         (id, paused, production_halted, updated_at, interruptions)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           paused = excluded.paused,
           production_halted = excluded.production_halted,
           updated_at = excluded.updated_at,
           interruptions = excluded.interruptions`,
      )
      .run(
        state.paused ? 1 : 0,
        state.productionHalted ? 1 : 0,
        this.#clock.now(),
        JSON.stringify(state.interruptions.slice(-100)),
      );
    return this.load();
  }

  patch(patch: Partial<FloorState>): FloorState {
    const current = this.load();
    return this.save({ ...current, ...patch, updatedAt: this.#clock.now() });
  }

  openInterruption(cause: Interruption["cause"], note: string): FloorState {
    const current = this.load();
    const open = current.interruptions.find((item) => item.to === null);
    if (open) return current;
    return this.save({
      ...current,
      interruptions: [
        ...current.interruptions,
        { from: this.#clock.now(), to: null, cause, note },
      ],
    });
  }

  closeInterruption(note?: string): FloorState {
    const current = this.load();
    const at = this.#clock.now();
    const interruptions = current.interruptions.map((item) =>
      item.to === null ? { ...item, to: at, note: note ?? item.note } : item,
    );
    return this.save({ ...current, interruptions });
  }

  interruptionsSince(from: number): Interruption[] {
    return this.load().interruptions.filter((item) => item.from >= from);
  }
}
