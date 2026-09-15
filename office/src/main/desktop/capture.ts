import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { desktopCapturer, nativeImage, screen } from "electron";
import { nowMs } from "../app-time.js";
import { UnsupportedDesktopError } from "./backend.js";
import {
  assignCapturerSources,
  pickCapturerSource,
  type DisplayLike,
} from "./capture-source.js";
import {
  capturePhysicalRectPng,
  win32GdiCaptureAvailable,
} from "./capture-win32-gdi.js";
import type { Display } from "./geometry.js";

/**
 * Looking at the screen.
 *
 * A model driving a desktop needs to see what it is doing between every step,
 * so this has to be cheap and it has to be honest about scale: a click is
 * given in desktop coordinates, and an image scaled down without saying so is
 * how every coordinate afterwards ends up wrong. The capture reports the size
 * it actually took, and the scale back to the desktop, so the caller can
 * convert rather than assume.
 *
 * On Windows, Chromium's DXGI Desktop Duplication path frequently fails on
 * hybrid GPUs ("Failed to capture 1 frames within 500 milliseconds"). We
 * capture with GDI BitBlt instead, and only use desktopCapturer elsewhere.
 */

export interface Capture {
  path: string;
  width: number;
  height: number;
  /** The display this is a picture of. */
  display: Display;
  /**
   * Multiply a point measured on the image by this to get display pixels.
   * 1 when the capture is full size.
   */
  scale: number;
  bytes: number;
  /**
   * Virtual-desktop physical pixels this PNG was BitBlt'd from (Windows GDI).
   * When set, clicks map image→physical without a DIP round-trip.
   */
  physical?: { x: number; y: number; width: number; height: number };
}

function toDisplay(display: Electron.Display, primaryId: number): Display {
  return {
    id: display.id,
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    primary: display.id === primaryId,
  };
}

function toDisplayLike(
  display: Electron.Display,
  index: number,
): DisplayLike {
  return {
    id: display.id,
    width: display.bounds.width,
    height: display.bounds.height,
    scaleFactor: display.scaleFactor || 1,
    index,
  };
}

/** Physical pixels for a display — matches day-log / DXGI readback sizing. */
function physicalSize(display: Electron.Display): {
  width: number;
  height: number;
} {
  const scale = display.scaleFactor || 1;
  return {
    width: Math.max(1, Math.round(display.size.width * scale)),
    height: Math.max(1, Math.round(display.size.height * scale)),
  };
}

function thumbnailSizeFor(
  displays: readonly Electron.Display[],
  maxEdge: number,
): { width: number; height: number } {
  let width = 1;
  let height = 1;
  for (const display of displays) {
    const phys = physicalSize(display);
    width = Math.max(width, phys.width);
    height = Math.max(height, phys.height);
  }
  const shrink = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * shrink)),
    height: Math.max(1, Math.round(height * shrink)),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureFailureHint(detail: string): string {
  const base = `The screen could not be captured: ${detail}`;
  if (process.platform === "win32") {
    return (
      `${base}. Windows Desktop Duplication (DXGI) often fails during GPU switches ` +
      "or display-mode changes — wait a moment and try again, or set this app to the " +
      "integrated GPU in Windows Settings → System → Display → Graphics."
    );
  }
  return `${base}. On macOS this app needs Screen Recording permission in System Settings > Privacy & Security.`;
}

/**
 * Chromium's DXGI path logs "Failed to capture 1 frames within 500 milliseconds"
 * and can return blank thumbs. Retry with smaller sizes like day-log does.
 */
async function getScreenSources(
  targetDisplays: readonly Electron.Display[],
  maxEdge: number,
): Promise<Electron.DesktopCapturerSource[]> {
  const edges = [
    ...new Set([
      maxEdge,
      Math.min(maxEdge, 1280),
      Math.min(maxEdge, 960),
      Math.min(maxEdge, 640),
    ]),
  ];
  let lastDetail = "no screen sources";
  for (let attempt = 0; attempt < edges.length; attempt++) {
    if (attempt > 0) await sleep(300 * attempt);
    const thumbnailSize = thumbnailSizeFor(targetDisplays, edges[attempt]!);
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize,
      });
      if (sources.length === 0) {
        lastDetail = "no screen sources";
        continue;
      }
      if (sources.some((source) => !source.thumbnail.isEmpty())) {
        return sources;
      }
      lastDetail = "empty thumbnails (DXGI/WGC capture failed)";
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
    }
  }
  throw new UnsupportedDesktopError(captureFailureHint(lastDetail));
}

/** The display to capture: the one asked for, else the primary. */
export function pickDisplay(displayId?: number): Electron.Display {
  const all = screen.getAllDisplays();
  if (displayId !== undefined) {
    const found = all.find((display) => display.id === displayId);
    if (!found) {
      throw new UnsupportedDesktopError(
        `No display ${displayId}. Attached: ${all.map((d) => d.id).join(", ")}`,
      );
    }
    return found;
  }
  return screen.getPrimaryDisplay();
}

/**
 * Matches a capturer source to a display.
 *
 * Windows often leaves `display_id` empty, so the id match cannot be the only
 * way in — falling back to sources[0] always steals the wrong monitor.
 * Pass every attached display so identical landscape monitors zip by index.
 */
function pickSource(
  sources: Electron.DesktopCapturerSource[],
  display: Electron.Display,
): Electron.DesktopCapturerSource | null {
  const all = screen.getAllDisplays();
  const likes = all.map((item, index) => toDisplayLike(item, index));
  const target =
    likes.find((item) => item.id === display.id) ??
    toDisplayLike(display, 0);
  return pickCapturerSource(sources, target, likes);
}

export interface CaptureOptions {
  /** Where the PNG goes. Created if missing. */
  directory: string;
  displayId?: number;
  /**
   * Longest edge of the image. Smaller images cost the model far less to look
   * at; the scale back to the desktop is reported either way.
   */
  maxEdge?: number;
}

const DEFAULT_MAX_EDGE = 1600;

async function writePngCapture(
  png: Buffer,
  display: Electron.Display,
  primaryId: number,
  directory: string,
  physical?: { x: number; y: number; width: number; height: number },
): Promise<Capture> {
  const image = nativeImage.createFromBuffer(png);
  if (image.isEmpty()) {
    throw new UnsupportedDesktopError(
      captureFailureHint("empty image after encode"),
    );
  }
  await mkdir(directory, { recursive: true });
  const path = join(directory, `screen-${nowMs()}-${display.id}.png`);
  const bytes = image.toPNG();
  await writeFile(path, bytes);
  const size = image.getSize();
  const { width } = display.bounds;
  return {
    path,
    width: size.width,
    height: size.height,
    display: toDisplay(display, primaryId),
    scale: size.width > 0 ? width / size.width : 1,
    bytes: bytes.length,
    ...(physical ? { physical: { ...physical } } : {}),
  };
}

function shrinkPngToMaxEdge(png: Buffer, maxEdge: number): Buffer {
  let image = nativeImage.createFromBuffer(png);
  const size = image.getSize();
  const longest = Math.max(size.width, size.height);
  if (longest <= maxEdge) return png;
  const ratio = maxEdge / longest;
  image = image.resize({
    width: Math.max(1, Math.round(size.width * ratio)),
    height: Math.max(1, Math.round(size.height * ratio)),
  });
  return image.toPNG();
}

/**
 * A PNG of one display taken without Chromium's desktopCapturer.
 *
 * Worth reaching for beyond the DXGI failures it was written for:
 * `desktopCapturer.getSources` spins up Chromium's capture machinery, which on
 * Windows can pull focus away from whatever the person is working in. A BitBlt
 * touches nobody's window. Returns null where no native path exists.
 */
export function captureDisplayPngNative(
  display: Electron.Display,
  maxEdge: number,
): { png: Buffer; physical: { x: number; y: number; width: number; height: number } } | null {
  if (!win32GdiCaptureAvailable()) return null;
  const physical = screen.dipToScreenRect(null, display.bounds);
  const rect = {
    x: physical.x,
    y: physical.y,
    width: physical.width,
    height: physical.height,
  };
  return {
    png: shrinkPngToMaxEdge(capturePhysicalRectPng(rect), maxEdge),
    physical: rect,
  };
}

/** Prefer GDI on Windows so DXGI hybrid-GPU failures never block computer-use. */
async function captureDisplayGdi(
  display: Electron.Display,
  primaryId: number,
  directory: string,
  maxEdge: number,
): Promise<Capture> {
  const native = captureDisplayPngNative(display, maxEdge);
  if (!native) {
    throw new UnsupportedDesktopError(
      captureFailureHint("no native capture path on this platform"),
    );
  }
  // Clicks map through this same rect (even after shrink — image coords scale in).
  return writePngCapture(
    native.png,
    display,
    primaryId,
    directory,
    native.physical,
  );
}

async function writeCaptureFromSource(
  source: Electron.DesktopCapturerSource,
  display: Electron.Display,
  primaryId: number,
  directory: string,
): Promise<Capture> {
  const image = source.thumbnail;
  if (image.isEmpty()) {
    throw new UnsupportedDesktopError(
      captureFailureHint("empty thumbnail for the matched display"),
    );
  }
  return writePngCapture(image.toPNG(), display, primaryId, directory);
}

export async function captureScreen(options: CaptureOptions): Promise<Capture> {
  const display = pickDisplay(options.displayId);
  const primaryId = screen.getPrimaryDisplay().id;
  const maxEdge = Math.max(320, options.maxEdge ?? DEFAULT_MAX_EDGE);

  if (win32GdiCaptureAvailable()) {
    return captureDisplayGdi(display, primaryId, options.directory, maxEdge);
  }

  const sources = await getScreenSources([display], maxEdge);
  const source = pickSource(sources, display);
  if (!source) {
    throw new UnsupportedDesktopError(captureFailureHint("no matching screen source"));
  }
  return writeCaptureFromSource(
    source,
    display,
    primaryId,
    options.directory,
  );
}

/**
 * Capture every attached display.
 * Windows uses GDI per monitor (no DXGI). Elsewhere: one getSources + unique assign.
 */
export async function captureAllScreens(options: {
  directory: string;
  maxEdge?: number;
}): Promise<Capture[]> {
  const all = screen.getAllDisplays();
  if (all.length === 0) {
    throw new UnsupportedDesktopError("No display is attached");
  }
  const primaryId = screen.getPrimaryDisplay().id;
  const maxEdge = Math.max(320, options.maxEdge ?? DEFAULT_MAX_EDGE);

  if (win32GdiCaptureAvailable()) {
    const captures: Capture[] = [];
    for (const display of all) {
      captures.push(
        await captureDisplayGdi(
          display,
          primaryId,
          options.directory,
          maxEdge,
        ),
      );
    }
    return captures;
  }

  const sources = await getScreenSources(all, maxEdge);
  const likes = all.map((display, index) => toDisplayLike(display, index));
  const assigned = assignCapturerSources(sources, likes);
  const captures: Capture[] = [];
  for (const row of assigned) {
    if (!row.source) {
      throw new UnsupportedDesktopError(
        captureFailureHint(`no matching screen source for display ${row.display.id}`),
      );
    }
    const electronDisplay = all.find((item) => item.id === row.display.id);
    if (!electronDisplay) continue;
    captures.push(
      await writeCaptureFromSource(
        row.source,
        electronDisplay,
        primaryId,
        options.directory,
      ),
    );
  }
  return captures;
}
