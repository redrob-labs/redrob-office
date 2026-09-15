/**
 * The renderer's clock.
 *
 * Kept separate from the main process clock rather than shared: the renderer
 * cannot import main-process modules, and the two answer different questions.
 * A timestamp taken here is the user's local machine time at the moment of an
 * interaction, which is why chat sends it to the main process as
 * `clientNowIso` instead of letting the backend guess.
 *
 * Reading the clock through here rather than calling `Date.now()` inline keeps
 * one seam to move when a view needs to be replayed against recorded time.
 */

export interface TimeSource {
  now(): number;
}

class RealTimeSource implements TimeSource {
  now(): number {
    return Date.now();
  }
}

let clock: TimeSource = new RealTimeSource();

export function setRendererClock(source: TimeSource): void {
  clock = source;
}

/** Milliseconds since the epoch. */
export function nowMs(): number {
  return clock.now();
}

/** ISO-8601 for the current instant. */
export function nowIso(): string {
  return new Date(clock.now()).toISOString();
}

/** ISO-8601 for an instant already read from the clock. Formatting, not a read. */
export function isoAt(timestamp: number): string {
  return new Date(timestamp).toISOString();
}
