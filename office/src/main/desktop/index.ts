import { createRequire } from "node:module";
import { nowMs } from "../app-time.js";
import { UnsupportedDesktopError, type DesktopBackend } from "./backend.js";
import { X11Backend, x11Available } from "./backend-x11.js";
import { Win32Backend, win32Available } from "./backend-win32.js";
import type { Display } from "./geometry.js";

/**
 * The one way into driving the machine.
 *
 * Two things are deliberately separated here. Whether the app *can* do this is
 * a property of the machine — the platform, whether the tooling is installed,
 * whether a display is attached. Whether it *may* is a decision the person
 * using it made in Settings. Answering them apart is what lets the app say
 * "your Linux desktop needs xdotool" instead of the same shrug for both.
 */

export type ControlState = "ready" | "off" | "unsupported" | "stopped";

export interface ControlStatus {
  state: ControlState;
  /** The backend that would be used, when there is one. */
  backend: string | null;
  /** Why it is not ready, in words a person can act on. */
  reason: string;
}

let backend: DesktopBackend | null = null;
let probed = false;
let unsupportedReason = "";

/** Set by the panic stop, and cleared only by the person who set it. */
let stopped = false;
let stoppedAt = 0;

async function probe(): Promise<void> {
  if (probed) return;
  probed = true;
  if (process.platform === "win32") {
    if (win32Available()) backend = new Win32Backend();
    else unsupportedReason = "user32 could not be loaded on this machine.";
    return;
  }
  if (process.platform === "linux") {
    if (await x11Available()) backend = new X11Backend();
    else
      unsupportedReason = "Install xdotool and run inside a graphical session.";
    return;
  }
  unsupportedReason = `Controlling the desktop is not implemented on ${process.platform} yet.`;
}

/**
 * Everything stops.
 *
 * A model with the mouse can do the wrong thing faster than a person can read
 * about it, so there is one switch that ends it, and it stays ended: clearing
 * it is a deliberate act rather than the next tool call finding it expired.
 */
export function stopEverything(): void {
  stopped = true;
  stoppedAt = nowMs();
}

export function resumeAfterStop(): void {
  stopped = false;
  stoppedAt = 0;
}

export function isStopped(): boolean {
  return stopped;
}

export function stoppedSince(): number {
  return stoppedAt;
}

/** What the machine and the settings between them allow, right now. */
export async function controlStatus(enabled: boolean): Promise<ControlStatus> {
  await probe();
  if (stopped) {
    return {
      state: "stopped",
      backend: backend?.name ?? null,
      reason: "Stopped by hand. Turn control back on in Settings to continue.",
    };
  }
  if (!backend)
    return { state: "unsupported", backend: null, reason: unsupportedReason };
  if (!enabled) {
    return {
      state: "off",
      backend: backend.name,
      reason: "Controlling this machine is off. Turn it on in Settings.",
    };
  }
  return { state: "ready", backend: backend.name, reason: "" };
}

export type DesktopControlGate = {
  ok: boolean;
  state: ControlState;
  /** True when this call flipped the Settings switch on. */
  justEnabled: boolean;
  reason: string;
};

/**
 * Asking someone to open Chrome and check the calendar is consent to look at
 * the screen. Settings starts with control off, so without this step every
 * "확인해줘" opens the browser and then apologises that capture is disabled.
 *
 * A panic stop stays stopped — only the person clears that.
 */
export async function resolveDesktopControlForWork(input: {
  enabled: boolean;
  turnOn: () => Promise<void>;
}): Promise<DesktopControlGate> {
  await probe();
  if (stopped) {
    return {
      ok: false,
      state: "stopped",
      justEnabled: false,
      reason: "Stopped by hand. Turn control back on in Settings to continue.",
    };
  }
  if (!backend) {
    return {
      ok: false,
      state: "unsupported",
      justEnabled: false,
      reason: unsupportedReason || "Desktop control is not available here.",
    };
  }
  if (input.enabled) {
    return { ok: true, state: "ready", justEnabled: false, reason: "" };
  }
  await input.turnOn();
  return { ok: true, state: "ready", justEnabled: true, reason: "" };
}

/** Flip Settings on when work needs the screen, unless a panic stop is active. */
export async function enableDesktopControlForRequestedWork(): Promise<DesktopControlGate> {
  const { getComputerUseConfig, updateComputerUseConfig } = await import(
    "../office/config.js"
  );
  const config = await getComputerUseConfig();
  return resolveDesktopControlForWork({
    enabled: config.desktopControl,
    turnOn: async () => {
      await updateComputerUseConfig({ desktopControl: true });
    },
  });
}

/**
 * The backend, or a refusal that says which of the two reasons applies.
 * Every tool goes through here, so there is one place the answer is decided.
 */
export async function requireBackend(
  enabled: boolean,
): Promise<DesktopBackend> {
  const status = await controlStatus(enabled);
  if (status.state !== "ready" || !backend) {
    throw new UnsupportedDesktopError(status.reason);
  }
  return backend;
}

/**
 * Electron is loaded when it is needed rather than when this module is, so the
 * decisions above can be tested in a plain Node process with no app running.
 */
function electronScreen(): typeof import("electron").screen {
  const require_ = createRequire(import.meta.url);
  return (require_("electron") as typeof import("electron")).screen;
}

/** The attached screens, in the coordinates a click is given in. */
export function displays(): Display[] {
  const screen = electronScreen();
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    primary: display.id === screen.getPrimaryDisplay().id,
  }));
}

/** Only for tests, which have no Electron `screen` to ask. */
export function __setBackendForTest(next: DesktopBackend | null): void {
  backend = next;
  probed = true;
  unsupportedReason = next ? "" : "no backend";
}

export { UnsupportedDesktopError } from "./backend.js";
export type { DesktopBackend, MouseButton } from "./backend.js";
export {
  displayFrames,
  DisplayFrameStore,
  StaleFrameError,
  FrameMismatchError,
  __resetDisplayFramesForTest,
} from "./display-frames.js";
export type { DisplayFrame, CaptureFrameInput } from "./display-frames.js";
