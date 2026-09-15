import type { Chord } from "./keys.js";
import type { Point } from "./geometry.js";

/**
 * Driving the machine, behind one interface per platform.
 *
 * Every platform synthesises input through a different API, and none of them
 * can be tried on the others. Keeping the platform-specific part this small is
 * what makes each backend reviewable: the deciding — where a click may land,
 * what a chord means, whether this is allowed at all — happens above it, once,
 * where it can be tested without a desktop.
 */

export type MouseButton = "left" | "right" | "middle";

/** dip = Electron display.bounds space; physical = SetCursorPos / GDI pixels. */
export type CoordinateSpace = "dip" | "physical";

export type PointerOptions = {
  coordinateSpace?: CoordinateSpace;
};

export interface DesktopBackend {
  /** Named in errors, so a failure says which mechanism failed. */
  readonly name: string;
  moveTo(point: Point, options?: PointerOptions): Promise<void>;
  click(
    point: Point,
    button: MouseButton,
    count: number,
    options?: PointerOptions,
  ): Promise<void>;
  /** Literal text, not interpreted as keys. */
  typeText(text: string): Promise<void>;
  pressChord(chord: Chord): Promise<void>;
  scroll(
    point: Point,
    ticks: number,
    options?: PointerOptions,
  ): Promise<void>;
  /** Where the pointer is now, for verifying a move actually happened. */
  cursor(): Promise<Point>;
}

/** Why this machine cannot be driven, in words a person can act on. */
export class UnsupportedDesktopError extends Error {}
