/**
 * Where a click is allowed to land.
 *
 * A model works from a screenshot and does arithmetic on it, so it will
 * eventually name a point that is off the screen or on a monitor that is not
 * there. Left alone that is a click at an unpredictable place on somebody's
 * desktop, so a point is checked against the screen before anything is sent.
 */

export interface Display {
  id: number;
  /** Top-left in the virtual desktop, which can be negative on a left monitor. */
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export class OffScreenError extends Error {}

function contains(display: Display, point: Point): boolean {
  return (
    point.x >= display.x &&
    point.x < display.x + display.width &&
    point.y >= display.y &&
    point.y < display.y + display.height
  );
}

/** The display a point falls on, or null when it falls between or beyond them. */
export function displayAt(
  displays: readonly Display[],
  point: Point,
): Display | null {
  return displays.find((display) => contains(display, point)) ?? null;
}

/**
 * The point to actually click.
 *
 * Refused rather than clamped: a point off the screen means the model's idea of
 * the screen is wrong, and sliding the click to the nearest edge would carry
 * out a wrong instruction instead of reporting it.
 */
export function resolvePoint(
  displays: readonly Display[],
  point: Point,
): Point {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new OffScreenError("A point needs two finite coordinates");
  }
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  if (displays.length === 0) throw new OffScreenError("No display is attached");
  if (!displayAt(displays, { x, y })) {
    const bounds = displays
      .map((d) => `${d.width}x${d.height} at ${d.x},${d.y}`)
      .join("; ");
    throw new OffScreenError(
      `(${x}, ${y}) is not on any display. Displays: ${bounds}`,
    );
  }
  return { x, y };
}

/**
 * A point given relative to one display, in the coordinates the desktop uses.
 * A screenshot of one monitor starts at its own 0,0, and everything a model
 * measures on that image is off by the monitor's offset until this is applied.
 */
export function fromDisplayPoint(display: Display, point: Point): Point {
  return {
    x: display.x + Math.round(point.x),
    y: display.y + Math.round(point.y),
  };
}
