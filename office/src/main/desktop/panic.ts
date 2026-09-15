import { BrowserWindow, globalShortcut } from "electron";
import { appendOfficeEvent } from "../audit/tool-audit.js";
import { mainClock } from "../app-time.js";
import { isStopped, stopEverything } from "./index.js";

/**
 * The way out.
 *
 * Something driving the pointer can do the wrong thing faster than a person
 * can read about it, and the ordinary way to stop software — click its button
 * — is exactly what a runaway pointer takes away from you. So the stop is a
 * key combination the OS delivers before anything else sees it, and it works
 * whether or not this app has focus, which is the whole point: when it matters
 * the focused window will be somebody else's.
 *
 * It is deliberately not a toggle. Stopping is instant; starting again is a
 * deliberate act in Settings, so a stray second press cannot hand the pointer
 * back.
 */

export const PANIC_ACCELERATOR = "CommandOrControl+Alt+Escape";

let registered = false;

export function installDesktopPanicStop(): boolean {
  if (registered) return true;
  const ok = globalShortcut.register(PANIC_ACCELERATOR, () => {
    void trigger("hotkey");
  });
  registered = ok;
  return ok;
}

/** Also reachable from the UI, for the case where a hand is already on a mouse. */
export async function trigger(source: "hotkey" | "ui"): Promise<void> {
  const first = !isStopped();
  stopEverything();
  const { stopRecordingIfRunning } = await import("./record.js");
  await stopRecordingIfRunning();

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed())
      window.webContents.send("office:desktopStopped", { source });
  }
  if (!first) return;
  await appendOfficeEvent({
    clock: mainClock(),
    event: "desktop.stopped",
    summary: `Desktop control stopped by ${source === "hotkey" ? "the stop key" : "hand"}`,
    detail: { source, accelerator: PANIC_ACCELERATOR },
  }).catch(() => undefined);
}

export function uninstallDesktopPanicStop(): void {
  if (!registered) return;
  globalShortcut.unregister(PANIC_ACCELERATOR);
  registered = false;
}
