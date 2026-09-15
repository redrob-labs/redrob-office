/**
 * Day-log recording must not take the screen from the person being recorded.
 *
 * Opens a real app window, puts another application in front of it, then
 * records for long enough to take several captures and checks after every one
 * that the window the person was working in is still the focused window — and
 * that each capture spoke through a notification instead.
 *
 * Usage:
 *   DISPLAY=:1 ELECTRON_DISABLE_SANDBOX=1 \
 *     node scripts/run-electron-ts.mjs scripts/day-log-focus-e2e.ts
 */
import { app, BrowserWindow } from "electron";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  configureDayLogRoot,
  getActiveDayLogSession,
  startDayLogSession,
  stopDayLogSession,
  type DayLogSession,
} from "../src/main/services/day-log.js";
import { notices, type DesktopNotice } from "../src/main/services/notify.js";

const INTERVAL_MS = 60_000;
const CAPTURES_WANTED = 3;

function xdotool(args: string[]): string {
  return execFileSync("xdotool", args, { encoding: "utf8" }).trim();
}

function activeWindow(): { id: string; name: string } {
  const id = xdotool(["getactivewindow"]);
  let name = "(unnamed)";
  try {
    name = xdotool(["getwindowname", id]);
  } catch {
    /* some windows have no name */
  }
  return { id, name };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  app.on("window-all-closed", () => undefined);
  await app.whenReady();

  const root = mkdtempSync(join(tmpdir(), "redrob-daylog-focus-"));
  configureDayLogRoot(root);

  const seen: DesktopNotice[] = [];
  notices.on("notice", (notice: DesktopNotice) => {
    seen.push(notice);
    console.log(`[notice] ${notice.title} — ${notice.body}`);
  });

  const window = new BrowserWindow({ width: 900, height: 600, show: true });
  await window.loadURL(
    "data:text/html,<title>Redrob Office</title><body style='font:600 28px sans-serif;padding:40px'>Redrob Office</body>",
  );
  await sleep(1500);

  // Somebody else's app, in front, the way a real desk looks while recording.
  const other = spawn("mousepad", [], { stdio: "ignore", detached: true });
  await sleep(3000);
  const otherWindowId = xdotool(["search", "--name", "Mousepad"]).split("\n").pop()!;
  xdotool(["windowactivate", "--sync", otherWindowId]);
  await sleep(1000);

  const before = activeWindow();
  console.log(`[focus] before recording: ${before.name} (${before.id})`);
  if (!/mousepad/i.test(before.name)) {
    throw new Error(`Test setup failed: expected mousepad in front, got ${before.name}`);
  }

  const failures: string[] = [];
  const focusSamples: string[] = [];

  function sampleFocus(label: string): void {
    const now = activeWindow();
    focusSamples.push(`${label}: ${now.name}`);
    console.log(`[focus] ${label}: ${now.name} (${now.id})`);
    if (now.id !== before.id) {
      failures.push(`focus moved to "${now.name}" ${label}`);
    }
  }

  console.log(`[daylog] recording every ${INTERVAL_MS / 1000}s`);
  let session: DayLogSession = await startDayLogSession({
    intervalMs: INTERVAL_MS,
    visionRoute: "local",
    deleteCapturesAfterReport: false,
    notifyOnCapture: true,
    locale: "en",
  });
  sampleFocus("after capture 1");

  let captures = session.captures.length;
  const deadline = Date.now() + INTERVAL_MS * CAPTURES_WANTED + 20_000;
  while (captures < CAPTURES_WANTED && Date.now() < deadline) {
    await sleep(2000);
    const current = getActiveDayLogSession();
    if (!current) break;
    if (current.captures.length > captures) {
      captures = current.captures.length;
      sampleFocus(`after capture ${captures}`);
    }
  }

  session = await stopDayLogSession();
  window.destroy();
  try {
    process.kill(-other.pid!);
  } catch {
    /* already gone */
  }

  if (session.captures.length < CAPTURES_WANTED) {
    failures.push(
      `only ${session.captures.length} of ${CAPTURES_WANTED} captures were taken`,
    );
  }
  for (const capture of session.captures) {
    const bytes = statSync(capture.path).size;
    if (bytes < 1024) failures.push(`capture ${capture.id} is ${bytes} bytes`);
  }
  if (seen.length !== session.captures.length) {
    failures.push(
      `${seen.length} notifications for ${session.captures.length} captures`,
    );
  }

  console.log(
    JSON.stringify(
      {
        captures: session.captures.map((capture) => ({
          at: capture.at,
          bytes: capture.bytes,
        })),
        notifications: seen.map((notice) => notice.body),
        focusSamples,
      },
      null,
      2,
    ),
  );

  rmSync(root, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error("[daylog] FAILED:\n- " + failures.join("\n- "));
    app.exit(1);
    return;
  }
  console.log("[daylog] OK — focus never left the other app, one notice per capture");
  app.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
