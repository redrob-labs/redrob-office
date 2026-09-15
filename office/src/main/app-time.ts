import { RealTimeSource, isoAt, type TimeSource } from "./office/time/index.js";

/**
 * The main process's clock, injected once at boot.
 *
 * Two different rules apply to time in this app and it is worth being explicit
 * about why they differ.
 *
 * Under `office/` nothing may reach for an ambient clock: every store and every
 * runtime takes its TimeSource through its constructor, because N Tasks may be
 * in flight on N different clocks and a store that quietly read a global would
 * stamp rows that contradict the run that produced them.
 *
 * The surrounding app services are not like that. There is exactly one of each
 * per process, they are already configured once at startup with their data
 * directory, and they only need the clock to stamp a record they are writing.
 * Threading a parameter through every one of them would add churn without
 * buying the multiplicity that motivates the rule. So they take the clock the
 * same way they take their data directory: injected at boot, from here.
 *
 * What this must never become is a way for `office/` to find a clock. It is not
 * exported from any office module and nothing under `office/` imports it.
 */

let clock: TimeSource = new RealTimeSource();

export function setMainClock(source: TimeSource): void {
  clock = source;
}

export function mainClock(): TimeSource {
  return clock;
}

/** Milliseconds since the epoch, on the main-process clock. */
export function nowMs(): number {
  return clock.now();
}

/** ISO-8601 for the current instant on the main-process clock. */
export function nowIso(): string {
  return isoAt(clock.now());
}
