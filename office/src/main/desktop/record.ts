import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BrowserWindow, desktopCapturer } from "electron";
import { nowMs } from "../app-time.js";
import { UnsupportedDesktopError } from "./backend.js";
import { pickDisplay } from "./capture.js";

/**
 * Recording the screen.
 *
 * Video only exists in a renderer: `MediaRecorder` is a DOM API and the main
 * process has no equivalent. So a hidden window does the recording and hands
 * back the file, which also means no encoder dependency — Chromium already
 * ships one, and it is the same one the rest of the app renders with.
 *
 * The window is invisible and off the taskbar, but it is a real window: if the
 * app quits mid-recording it goes with it, so a recording that is still
 * running is stopped on the way out rather than left holding the screen.
 */

export interface Recording {
  path: string;
  bytes: number;
  durationMs: number;
}

interface Session {
  window: BrowserWindow;
  startedAt: number;
  directory: string;
  displayId: number;
  timeout: NodeJS.Timeout;
}

let session: Session | null = null;

/** Long enough for a task, short enough that a forgotten one is not a disk leak. */
const MAX_MS = 5 * 60_000;

export function isRecording(): boolean {
  return session !== null;
}

export async function startRecording(options: {
  directory: string;
  displayId?: number;
}): Promise<{ displayId: number; maxMs: number }> {
  if (session)
    throw new UnsupportedDesktopError("A recording is already running");
  const display = pickDisplay(options.displayId);

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1, height: 1 },
  });
  const source =
    sources.find((item) => item.display_id === String(display.id)) ??
    sources[0];
  if (!source)
    throw new UnsupportedDesktopError("No screen is available to record");

  const window = new BrowserWindow({
    show: false,
    width: 320,
    height: 240,
    skipTaskbar: true,
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });

  // The page asks for "a display"; which one is decided here, so the page
  // never chooses and there is no picker for anyone to see.
  window.webContents.session.setDisplayMediaRequestHandler(
    (_request, callback) => callback({ video: source }),
    { useSystemPicker: false },
  );

  // A real file, not `about:blank`: an opaque origin is not a secure context,
  // and `navigator.mediaDevices` does not exist in one.
  await mkdir(options.directory, { recursive: true });
  const page = join(options.directory, "recorder.html");
  await writeFile(
    page,
    '<!doctype html><meta charset="utf-8"><title>recorder</title>',
  );
  await window.loadFile(page);
  const started = (await window.webContents.executeJavaScript(
    `(async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        window.__chunks = [];
        recorder.ondataavailable = (event) => { if (event.data.size > 0) window.__chunks.push(event.data); };
        recorder.start(1000);
        window.__recorder = recorder;
        window.__stream = stream;
        return "ok";
      } catch (err) {
        return "error: " + (err && err.message ? err.message : String(err));
      }
    })()`,
  )) as string;

  if (started !== "ok") {
    window.destroy();
    throw new UnsupportedDesktopError(
      `The screen could not be recorded: ${started.replace(/^error: /, "")}`,
    );
  }

  const timeout = setTimeout(() => {
    void stopRecording().catch(() => undefined);
  }, MAX_MS);

  session = {
    window,
    startedAt: nowMs(),
    directory: options.directory,
    displayId: display.id,
    timeout,
  };
  return { displayId: display.id, maxMs: MAX_MS };
}

export async function stopRecording(): Promise<Recording> {
  const current = session;
  if (!current) throw new UnsupportedDesktopError("Nothing is being recorded");
  session = null;
  clearTimeout(current.timeout);

  try {
    const base64 = (await current.window.webContents.executeJavaScript(
      `(async () => {
        const recorder = window.__recorder;
        if (!recorder) return "";
        await new Promise((resolve) => {
          recorder.onstop = resolve;
          recorder.stop();
        });
        for (const track of window.__stream.getTracks()) track.stop();
        const blob = new Blob(window.__chunks, { type: "video/webm" });
        const buffer = await blob.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buffer);
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
      })()`,
    )) as string;

    const video = Buffer.from(base64, "base64");
    if (video.length === 0)
      throw new UnsupportedDesktopError("The recording came back empty");
    await mkdir(current.directory, { recursive: true });
    const path = join(
      current.directory,
      `screen-${current.startedAt}-${current.displayId}.webm`,
    );
    await writeFile(path, video);
    return {
      path,
      bytes: video.length,
      durationMs: nowMs() - current.startedAt,
    };
  } finally {
    if (!current.window.isDestroyed()) current.window.destroy();
  }
}

/** Called on the way out, so a recording never outlives the app that started it. */
export async function stopRecordingIfRunning(): Promise<void> {
  if (session) await stopRecording().catch(() => undefined);
}
