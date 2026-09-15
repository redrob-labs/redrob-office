import type { TimeSource } from "../time/index.js";
import type { TraceStore } from "../traces/index.js";
import type { FloorMessage, MessageType } from "./types.js";

export interface GovernorConfig {
  /** Repeats of the same (from→to, type) pair inside one trace before kill. */
  cycleLimit: number;
  /** Quiet window that closes a burst from one source. */
  debounceWindowMs: number;
  /** Runner pool size. This is the concurrency cap - nothing else. */
  concurrency: number;
}

export const DEFAULT_GOVERNOR: GovernorConfig = {
  cycleLimit: 3,
  debounceWindowMs: 45_000,
  concurrency: 3,
};

export type GovernorVerdict =
  | { action: "accept" }
  | { action: "debounce"; intoId: string }
  | { action: "kill"; reason: string }
  | { action: "escalate"; reason: string; kind: "tokens" | "depth" };

interface BurstState {
  lastAt: number;
  headId: string;
  count: number;
}

/**
 * Traffic control for the bus. Every rule here is a hard stop: there is no
 * config switch that turns budget, cycle detection or the concurrency cap off.
 */
export class Governor {
  readonly #config: GovernorConfig;
  readonly #traces: TraceStore;
  readonly #clock: TimeSource;
  readonly #pairCounts = new Map<string, number>();
  readonly #bursts = new Map<string, BurstState>();

  constructor(
    traces: TraceStore,
    clock: TimeSource,
    config: GovernorConfig = DEFAULT_GOVERNOR,
  ) {
    this.#traces = traces;
    this.#clock = clock;
    this.#config = {
      cycleLimit: Math.max(2, config.cycleLimit),
      debounceWindowMs: Math.max(0, config.debounceWindowMs),
      concurrency: Math.max(1, config.concurrency),
    };
  }

  get concurrency(): number {
    return this.#config.concurrency;
  }

  get config(): GovernorConfig {
    return { ...this.#config };
  }

  #pairKey(message: FloorMessage): string {
    return `${message.traceId}|${message.from}->${message.to}|${message.type}`;
  }

  #burstKey(message: FloorMessage): string {
    return `${message.traceId}|${message.from}|${message.type}|${message.to}`;
  }

  /** BLOCK / ESCALATE are exempt from pacing and debouncing. */
  static isUrgent(type: MessageType): boolean {
    return type === "BLOCK" || type === "ESCALATE";
  }

  inspect(message: FloorMessage, projectedTokens = 0): GovernorVerdict {
    const budget = this.#traces.checkDerivation(
      message.traceId,
      message.depth,
      projectedTokens,
    );
    if (!budget.ok) {
      return { action: "escalate", reason: budget.reason, kind: budget.kind };
    }

    const pairKey = this.#pairKey(message);
    const seen = (this.#pairCounts.get(pairKey) ?? 0) + 1;
    this.#pairCounts.set(pairKey, seen);
    if (seen > this.#config.cycleLimit) {
      return {
        action: "kill",
        reason: `Cycle detected: ${message.from}→${message.to} ${message.type} repeated ${seen}x in trace ${message.traceId}`,
      };
    }

    if (!Governor.isUrgent(message.type) && this.#config.debounceWindowMs > 0) {
      const burstKey = this.#burstKey(message);
      const now = this.#clock.now();
      const burst = this.#bursts.get(burstKey);
      if (burst && now - burst.lastAt < this.#config.debounceWindowMs) {
        burst.lastAt = now;
        burst.count += 1;
        return { action: "debounce", intoId: burst.headId };
      }
      this.#bursts.set(burstKey, { lastAt: now, headId: message.id, count: 1 });
    }

    return { action: "accept" };
  }

  /** Merged burst size for the head message, for the audit summary. */
  burstSizeOf(headId: string): number {
    for (const burst of this.#bursts.values()) {
      if (burst.headId === headId) return burst.count;
    }
    return 1;
  }

  forgetTrace(traceId: string): void {
    for (const key of [...this.#pairCounts.keys()]) {
      if (key.startsWith(`${traceId}|`)) this.#pairCounts.delete(key);
    }
    for (const key of [...this.#bursts.keys()]) {
      if (key.startsWith(`${traceId}|`)) this.#bursts.delete(key);
    }
  }
}
