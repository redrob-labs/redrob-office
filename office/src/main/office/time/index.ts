/**
 * TimeSource — the clock the office runtime reads.
 *
 * Nothing under `office/` may call `Date.now()` directly. Shift transitions,
 * `notBefore`, IntakeCutoff and pace delays all resolve through an injected
 * TimeSource so a virtual 24 hours can be replayed in minutes.
 *
 * There is deliberately no module-level "current" clock and no accessor for
 * one. A global would let a store quietly read a different clock than the
 * scheduler that owns it, which is exactly the bug that makes replayed audit
 * logs untrustworthy. Every collaborator takes its clock through its
 * constructor, so N runtimes can run side by side on N clocks.
 */

export interface TimeSource {
  now(): number;
  /** 1 = realtime. 60 = one virtual minute per wall second. */
  readonly scale: number;
}

/** Cancels a pending wake. Idempotent. */
export type CancelWake = () => void;

/**
 * A clock that can also tell the scheduler when to look at the queue again.
 *
 * This is a timer, not a delay: it never parks a task mid-execution. Work that
 * needs to happen later is a queue row with `notBefore` set, and this only
 * decides when the pump next wakes to notice it.
 */
export interface SchedulingTimeSource extends TimeSource {
  /** Run `fn` once `virtualMs` of virtual time has elapsed. */
  wakeAfter(virtualMs: number, fn: () => void): CancelWake;
  /** Wall-clock milliseconds corresponding to `virtualMs` of virtual time. */
  toWallMs(virtualMs: number): number;
}

export class RealTimeSource implements SchedulingTimeSource {
  readonly scale = 1;

  now(): number {
    return Date.now();
  }

  toWallMs(virtualMs: number): number {
    return virtualMs;
  }

  wakeAfter(virtualMs: number, fn: () => void): CancelWake {
    const handle = setTimeout(fn, Math.max(0, virtualMs));
    return () => clearTimeout(handle);
  }
}

function isProductionBuild(): boolean {
  if (process.env["REDROB_OFFICE_FORCE_DEV_CLOCK"] === "1") return false;
  if (process.env["NODE_ENV"] === "test" || process.env["VITEST"]) return false;
  if (process.env["ELECTRON_RENDERER_URL"]) return false;
  const electronApp = (
    globalThis as { process?: { defaultApp?: boolean; resourcesPath?: string } }
  ).process;
  if (electronApp?.defaultApp) return false;
  // Packaged Electron unpacks into an `app.asar` under resourcesPath.
  return Boolean(electronApp?.resourcesPath?.includes("app.asar"));
}

/**
 * Virtual clock for the demo and tests.
 *
 * Refuses to construct in a packaged build, so a shipped app can never fake a
 * shift boundary or an audit timestamp.
 */
export class VirtualTimeSource implements SchedulingTimeSource {
  #now: number;
  #scale: number;
  #wakes: Array<{ at: number; fn: () => void; cancelled: boolean }> = [];

  constructor(startAt: number, scale = 60) {
    if (isProductionBuild()) {
      throw new Error("VirtualTimeSource is disabled in production builds");
    }
    this.#now = startAt;
    this.#scale = Math.max(1, scale);
  }

  get scale(): number {
    return this.#scale;
  }

  now(): number {
    return this.#now;
  }

  toWallMs(virtualMs: number): number {
    return Math.max(0, Math.round(virtualMs / this.#scale));
  }

  wakeAfter(virtualMs: number, fn: () => void): CancelWake {
    const entry = { at: this.#now + Math.max(0, virtualMs), fn, cancelled: false };
    this.#wakes.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }

  /** Jump forward, firing every wake whose deadline passed. */
  advance(virtualMs: number): void {
    this.setTo(this.#now + Math.max(0, virtualMs));
  }

  setTo(virtualTimestamp: number): void {
    if (virtualTimestamp < this.#now) {
      throw new Error("VirtualTimeSource cannot move backwards");
    }
    this.#now = virtualTimestamp;
    const due = this.#wakes.filter((w) => w.at <= this.#now && !w.cancelled);
    this.#wakes = this.#wakes.filter((w) => w.at > this.#now && !w.cancelled);
    for (const wake of due) wake.fn();
  }

  pendingWakes(): number {
    return this.#wakes.filter((w) => !w.cancelled).length;
  }
}

/**
 * ISO-8601 for an instant that has already been read from a TimeSource.
 *
 * This is formatting, not a clock read: it takes the timestamp rather than
 * fetching one, so a record stamped under a virtual clock serialises to the
 * virtual instant and not to wall time.
 */
export function isoAt(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/** Convenience for the common `isoAt(clock.now())`. */
export function isoNow(clock: TimeSource): string {
  return isoAt(clock.now());
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const DAY_MS = 24 * HOUR;

/** Local hour/minute of a timestamp, in the runtime's configured timezone offset. */
export function clockOf(timestamp: number, timezoneOffsetMinutes: number): {
  hour: number;
  minute: number;
  dayIndex: number;
} {
  const shifted = timestamp + timezoneOffsetMinutes * MINUTE;
  const dayIndex = Math.floor(shifted / DAY_MS);
  const rem = shifted - dayIndex * DAY_MS;
  return {
    hour: Math.floor(rem / HOUR),
    minute: Math.floor((rem % HOUR) / MINUTE),
    dayIndex,
  };
}

/** Next timestamp at local `hh:mm`, strictly after `from`. */
export function nextLocalTime(
  from: number,
  hour: number,
  minute: number,
  timezoneOffsetMinutes: number,
): number {
  const { dayIndex } = clockOf(from, timezoneOffsetMinutes);
  const base = dayIndex * DAY_MS + hour * HOUR + minute * MINUTE - timezoneOffsetMinutes * MINUTE;
  return base > from ? base : base + DAY_MS;
}

export { MINUTE, HOUR };
