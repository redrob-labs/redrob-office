import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DesktopBackend, MouseButton } from "./backend.js";
import { UnsupportedDesktopError } from "./backend.js";
import { chordToX11, type Chord } from "./keys.js";
import type { Point } from "./geometry.js";

const run = promisify(execFile);

/** X11's button numbers: 4 and 5 are the wheel, which is why scroll is a click. */
const BUTTON: Record<MouseButton, number> = { left: 1, middle: 2, right: 3 };

const WHEEL_UP = 4;
const WHEEL_DOWN = 5;

/** How far the pointer may jump between frames before it reads as a teleport. */
const GLIDE_MAX_STEP_PX = 45;
/** Ceiling on frames, so a cross-screen move is smooth but never a slideshow. */
const GLIDE_MAX_STEPS = 48;
/** Pause between frames. ~10ms * up to 48 steps ≈ half a second, human-paced. */
const GLIDE_STEP_MS = 10;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The frames a pointer passes through going from a→b, target included.
 *
 * A single `xdotool mousemove` teleports the cursor, which is invisible in a
 * recording and reads nothing like a person (or the way Cursor's own agent
 * drives a desktop). Interpolating with an ease-in-out curve makes the motion
 * legible: it starts slow, covers ground, and settles onto the target. Pure and
 * exported so the curve can be checked without a display.
 */
export function glidePath(
  from: Point,
  to: Point,
  opts?: { maxStepPx?: number; maxSteps?: number },
): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return [{ x: to.x, y: to.y }];
  const maxStepPx = opts?.maxStepPx ?? GLIDE_MAX_STEP_PX;
  const maxSteps = opts?.maxSteps ?? GLIDE_MAX_STEPS;
  const steps = Math.max(2, Math.min(maxSteps, Math.ceil(distance / maxStepPx)));
  const path: Point[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    // easeInOutQuad
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    path.push({
      x: Math.round(from.x + dx * eased),
      y: Math.round(from.y + dy * eased),
    });
  }
  // Rounding can leave the last frame a pixel short; land exactly on target.
  path[path.length - 1] = { x: to.x, y: to.y };
  return path;
}

/**
 * Linux, through `xdotool`.
 *
 * An external command rather than an FFI binding because X11 input synthesis
 * goes through XTEST, and shelling out to the tool that already wraps it keeps
 * a whole native dependency out of the build for a platform this app does not
 * ship to. It is the backend the tests can actually exercise, which is the
 * other reason it exists.
 */
export class X11Backend implements DesktopBackend {
  readonly name = "xdotool";

  async #xdotool(args: string[]): Promise<string> {
    try {
      const { stdout } = await run("xdotool", args, { timeout: 5_000 });
      return stdout;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new UnsupportedDesktopError(
        `xdotool ${args[0]} failed: ${message}`,
      );
    }
  }

  /** Walk the pointer to a target one interpolated frame at a time. */
  async #glideTo(point: Point): Promise<void> {
    let from: Point;
    try {
      from = await this.cursor();
    } catch {
      // No idea where it is, so nothing to interpolate from — land directly.
      from = point;
    }
    const path = glidePath(from, point);
    for (let i = 0; i < path.length; i += 1) {
      const step = path[i]!;
      await this.#xdotool(["mousemove", String(step.x), String(step.y)]);
      if (i < path.length - 1) await delay(GLIDE_STEP_MS);
    }
  }

  async moveTo(point: Point): Promise<void> {
    await this.#glideTo(point);
  }

  async click(point: Point, button: MouseButton, count: number): Promise<void> {
    // Glide over first so the click lands where the pointer visibly travelled,
    // then press without another jump.
    await this.#glideTo(point);
    await this.#xdotool([
      "click",
      "--repeat",
      String(count),
      String(BUTTON[button]),
    ]);
  }

  async typeText(text: string): Promise<void> {
    // `--` so text starting with a dash is typed rather than read as a flag.
    await this.#xdotool(["type", "--delay", "12", "--", text]);
  }

  async pressChord(chord: Chord): Promise<void> {
    await this.#xdotool(["key", "--delay", "12", chordToX11(chord)]);
  }

  async scroll(point: Point, ticks: number): Promise<void> {
    const button = ticks < 0 ? WHEEL_DOWN : WHEEL_UP;
    await this.#glideTo(point);
    await this.#xdotool([
      "click",
      "--repeat",
      String(Math.abs(ticks)),
      String(button),
    ]);
  }

  async cursor(): Promise<Point> {
    const stdout = await this.#xdotool(["getmouselocation", "--shell"]);
    const x = /X=(-?\d+)/.exec(stdout);
    const y = /Y=(-?\d+)/.exec(stdout);
    if (!x || !y)
      throw new UnsupportedDesktopError(
        "xdotool did not report a cursor position",
      );
    return { x: Number(x[1]), y: Number(y[1]) };
  }
}

/** Whether xdotool is installed and a display is attached to talk to. */
export async function x11Available(): Promise<boolean> {
  if (!process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]) return false;
  try {
    await run("xdotool", ["getmouselocation"], { timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}
