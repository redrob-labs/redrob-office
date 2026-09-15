import { createRequire } from "node:module";
import type {
  DesktopBackend,
  MouseButton,
  PointerOptions,
} from "./backend.js";
import { UnsupportedDesktopError } from "./backend.js";
import { chordToVirtualKeys, type Chord } from "./keys.js";
import type { Point } from "./geometry.js";
import {
  encodeChord,
  encodeClick,
  encodeScroll,
  encodeText,
  inputCount,
  INPUT_SIZE,
} from "./win32-input.js";

/**
 * Windows, through `user32` by FFI.
 *
 * `SendInput` is how the OS itself delivers input, so what it sends is
 * indistinguishable from a person at the keyboard — which is the point, and
 * also why it is the only part of this app that can act outside its own window.
 *
 * koffi rather than a compiled addon: it is already a dependency, it needs no
 * node-gyp step against Electron headers, and the whole binding is the three
 * calls below. Everything else — which key, which point, whether this is
 * allowed — is decided before anything reaches here.
 */

interface User32 {
  SendInput: (count: number, inputs: Buffer, size: number) => number;
  SetCursorPos: (x: number, y: number) => number;
  GetCursorPos: (point: Buffer) => number;
}

let user32: User32 | null = null;

function load(): User32 {
  if (user32) return user32;
  if (process.platform !== "win32") {
    throw new UnsupportedDesktopError("SendInput exists only on Windows");
  }
  if (process.arch !== "x64") {
    // The struct offsets below are the 64-bit ones; 32-bit INPUT is smaller,
    // and guessing at it would move the wrong pointer rather than fail.
    throw new UnsupportedDesktopError(
      `Controlling the desktop is built for x64 Windows, not ${process.arch}`,
    );
  }
  let koffi: typeof import("koffi");
  try {
    // Required lazily, and through `createRequire` because the main process is
    // ESM: loading the FFI runtime is pointless on a machine with no user32 to
    // bind, and every platform but one is such a machine.
    const require_ = createRequire(import.meta.url);
    koffi = require_("koffi") as typeof import("koffi");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UnsupportedDesktopError(
      `The FFI bridge could not be loaded: ${message}`,
    );
  }
  const lib = koffi.load("user32.dll");
  user32 = {
    SendInput: lib.func("__stdcall", "SendInput", "uint32", [
      "uint32",
      "void *",
      "int32",
    ]),
    SetCursorPos: lib.func("__stdcall", "SetCursorPos", "int32", [
      "int32",
      "int32",
    ]),
    GetCursorPos: lib.func("__stdcall", "GetCursorPos", "int32", ["void *"]),
  };
  return user32;
}

function send(inputs: Buffer): void {
  if (inputs.length === 0) return;
  const count = inputCount(inputs);
  const sent = load().SendInput(count, inputs, INPUT_SIZE);
  if (sent !== count) {
    // The usual cause is a process running as administrator holding the
    // foreground window: Windows refuses input from a lower integrity level.
    throw new UnsupportedDesktopError(
      `Windows accepted ${sent} of ${count} events. A window running as administrator will refuse input from this app.`,
    );
  }
}

function electronScreen(): typeof import("electron").screen | null {
  try {
    const require_ = createRequire(import.meta.url);
    return (require_("electron") as typeof import("electron")).screen;
  } catch {
    return null;
  }
}

/**
 * Tool geometry is Electron DIP (display.bounds). SetCursorPos / GetCursorPos
 * speak physical pixels — without this conversion every click misses on scaled
 * displays.
 */
function toPhysical(point: Point): Point {
  const api = electronScreen();
  if (!api?.dipToScreenPoint) return point;
  try {
    return api.dipToScreenPoint(point);
  } catch {
    return point;
  }
}

function toDip(point: Point): Point {
  const api = electronScreen();
  if (!api?.screenToDipPoint) return point;
  try {
    return api.screenToDipPoint(point);
  } catch {
    return point;
  }
}

export class Win32Backend implements DesktopBackend {
  readonly name = "user32.SendInput";

  async moveTo(point: Point, options?: PointerOptions): Promise<void> {
    // GDI frames already resolve into SetCursorPos space — do not DIP-convert again.
    const target =
      options?.coordinateSpace === "physical" ? point : toPhysical(point);
    if (load().SetCursorPos(target.x, target.y) === 0) {
      throw new UnsupportedDesktopError(
        `Windows refused to move the pointer to ${point.x},${point.y}`,
      );
    }
    // Clicking where the pointer is not is worse than refusing: Windows clamps
    // and rescales silently when the coordinate space is wrong.
    const landed = rawCursor();
    const drift = Math.max(
      Math.abs(landed.x - target.x),
      Math.abs(landed.y - target.y),
    );
    if (drift > LANDING_TOLERANCE_PX) {
      throw new UnsupportedDesktopError(
        `The pointer was asked for ${target.x},${target.y} but Windows put it at ${landed.x},${landed.y}. Take a fresh screen.capture and use its frameId.`,
      );
    }
  }

  async click(
    point: Point,
    button: MouseButton,
    count: number,
    options?: PointerOptions,
  ): Promise<void> {
    await this.moveTo(point, options);
    send(encodeClick(button, count));
  }

  async typeText(text: string): Promise<void> {
    send(encodeText(text));
  }

  async pressChord(chord: Chord): Promise<void> {
    const keys = chordToVirtualKeys(chord);
    if (!keys)
      throw new UnsupportedDesktopError(
        `No Windows key matches "${chord.key}"`,
      );
    send(encodeChord(keys));
  }

  async scroll(
    point: Point,
    ticks: number,
    options?: PointerOptions,
  ): Promise<void> {
    await this.moveTo(point, options);
    send(encodeScroll(ticks));
  }

  async cursor(): Promise<Point> {
    return toDip(rawCursor());
  }
}

/** How far Windows may place the pointer from where it was told to. */
const LANDING_TOLERANCE_PX = 2;

/** Pointer position in physical pixels, the space SetCursorPos speaks. */
function rawCursor(): Point {
  const point = Buffer.alloc(8);
  if (load().GetCursorPos(point) === 0) {
    throw new UnsupportedDesktopError(
      "Windows refused to report the pointer position",
    );
  }
  return { x: point.readInt32LE(0), y: point.readInt32LE(4) };
}

/** Whether this machine can be driven through user32 at all. */
export function win32Available(): boolean {
  if (process.platform !== "win32" || process.arch !== "x64") return false;
  try {
    load();
    return true;
  } catch {
    return false;
  }
}
