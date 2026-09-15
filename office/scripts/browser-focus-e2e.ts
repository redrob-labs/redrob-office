/**
 * The agent's browser must not take the screen from the person using it.
 *
 * `browser.open` used to `show()` then `focus()` the window, which pulled the
 * keyboard out from under whoever was typing somewhere else. Nothing about the
 * run needs it: the page is read and driven through the DOM. This puts another
 * application in front, opens and drives a page, and fails if the focused
 * window ever moves.
 *
 * Usage:
 *   DISPLAY=:1 ELECTRON_DISABLE_SANDBOX=1 \
 *     node scripts/run-electron-ts.mjs scripts/browser-focus-e2e.ts
 */
import { app } from "electron";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  browserOpen,
  browserScroll,
  browserSnapshot,
  closeAgentBrowser,
} from "../src/main/services/browser-session.js";

const PAGE = "https://example.com/";

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

  const media = mkdtempSync(join(tmpdir(), "redrob-browser-focus-"));

  // Somebody else's app, in front, the way a real desk looks mid-task.
  const other = spawn("mousepad", [], { stdio: "ignore", detached: true });
  await sleep(3000);
  const otherWindowId = xdotool(["search", "--name", "Mousepad"])
    .split("\n")
    .pop()!;
  xdotool(["windowactivate", "--sync", otherWindowId]);
  await sleep(1000);

  const before = activeWindow();
  console.log(`[focus] before: ${before.name} (${before.id})`);
  if (!/mousepad/i.test(before.name)) {
    throw new Error(
      `Test setup failed: expected mousepad in front, got ${before.name}`,
    );
  }

  const failures: string[] = [];
  const samples: string[] = [];

  function sampleFocus(label: string): void {
    const now = activeWindow();
    samples.push(`${label}: ${now.name}`);
    console.log(`[focus] ${label}: ${now.name} (${now.id})`);
    if (now.id !== before.id) {
      failures.push(`focus moved to "${now.name}" ${label}`);
    }
  }

  const opened = await browserOpen(PAGE, media);
  sampleFocus("after browser.open");

  const scrolled = await browserScroll("down", 300, media);
  sampleFocus("after browser.scroll");

  const snapshot = await browserSnapshot(media);
  sampleFocus("after browser.elements");

  closeAgentBrowser();
  try {
    process.kill(-other.pid!);
  } catch {
    /* already gone */
  }

  // The point of not focusing is that the run still works: a page that never
  // came forward has to be as readable as one that did.
  if (!opened.title) failures.push("browser.open returned no page title");
  if (opened.elements.length === 0) {
    failures.push("browser.open found no interactive elements");
  }
  if (snapshot.url !== opened.url) {
    failures.push(`snapshot url ${snapshot.url} != ${opened.url}`);
  }
  for (const state of [opened, scrolled, snapshot]) {
    if (!state.screenshotPath) {
      failures.push("a step produced no screenshot");
      continue;
    }
    const bytes = statSync(state.screenshotPath).size;
    if (bytes < 1024) failures.push(`screenshot is only ${bytes} bytes`);
  }

  console.log(
    JSON.stringify(
      {
        page: { url: opened.url, title: opened.title },
        elements: opened.elements.length,
        focusSamples: samples,
      },
      null,
      2,
    ),
  );

  rmSync(media, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error("[browser] FAILED:\n- " + failures.join("\n- "));
    app.exit(1);
    return;
  }
  console.log(
    "[browser] OK — the page was opened, scrolled and read without focus ever leaving the other app",
  );
  app.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
