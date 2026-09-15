import { randomUUID } from "node:crypto";
import {
  fromDisplayPoint,
  resolvePoint,
  type Display,
  type Point,
} from "./geometry.js";

/**
 * OpenClaw-style screenshot frames.
 *
 * A click is only allowed against a frame the model was actually shown. Guessed
 * coordinates, replayed frameIds after a new capture, or a display whose
 * geometry changed since the shot all fail closed.
 *
 * When `physical` is set (Windows GDI captures), image pixels map straight into
 * that BitBlt rect — the same space SetCursorPos uses — so we never round-trip
 * through DIP and pick up per-monitor DPI errors.
 */

export type PhysicalRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DisplayFrame = {
  frameId: string;
  /** Shared by every image from one screen.capture call. */
  generation: number;
  displayId: number;
  display: Display;
  imageWidth: number;
  imageHeight: number;
  /** Multiply image pixels by this to get display-relative DIP (non-physical). */
  scale: number;
  /** Exact virtual-desktop pixels the PNG was taken from, when known. */
  physical?: PhysicalRect;
};

export type CaptureFrameInput = {
  display: Display;
  width: number;
  height: number;
  scale: number;
  physical?: PhysicalRect;
};

export type CoordinateSpace = "dip" | "physical";

export class StaleFrameError extends Error {
  readonly code = "STALE_FRAME";
  constructor(message: string) {
    super(message);
    this.name = "StaleFrameError";
  }
}

export class FrameMismatchError extends Error {
  readonly code = "FRAME_MISMATCH";
  constructor(message: string) {
    super(message);
    this.name = "FrameMismatchError";
  }
}

export class DisplayFrameStore {
  private generation = 0;
  private frames = new Map<string, DisplayFrame>();

  /** Drop every prior frame and register a new capture batch. */
  replaceFromCaptures(items: readonly CaptureFrameInput[]): DisplayFrame[] {
    this.generation += 1;
    this.frames.clear();
    const registered: DisplayFrame[] = [];
    for (const item of items) {
      const frame: DisplayFrame = {
        frameId: randomUUID(),
        generation: this.generation,
        displayId: item.display.id,
        display: { ...item.display },
        imageWidth: item.width,
        imageHeight: item.height,
        scale: item.scale,
        ...(item.physical ? { physical: { ...item.physical } } : {}),
      };
      this.frames.set(frame.frameId, frame);
      registered.push(frame);
    }
    return registered;
  }

  get(frameId: string): DisplayFrame | undefined {
    return this.frames.get(frameId);
  }

  clear(): void {
    this.frames.clear();
    this.generation = 0;
  }

  /**
   * Map screenshot pixels + frameId to a click point.
   * x,y are image coordinates (what the model sees), not pre-scaled DIP.
   */
  resolveImagePoint(
    input: {
      frameId: string;
      x: number;
      y: number;
      displayId?: number;
    },
    liveDisplays: readonly Display[],
  ): { point: Point; frame: DisplayFrame; space: CoordinateSpace } {
    const frameId = input.frameId.trim();
    if (!frameId) {
      throw new StaleFrameError(
        "frameId is required. Call screen.capture first and pass the frameId from that image.",
      );
    }
    const frame = this.frames.get(frameId);
    if (!frame) {
      throw new StaleFrameError(
        `Unknown or expired frameId ${frameId}. Take a fresh screen.capture — a new capture invalidates older frames.`,
      );
    }
    if (
      input.displayId !== undefined &&
      input.displayId !== frame.displayId
    ) {
      throw new FrameMismatchError(
        `displayId ${input.displayId} does not match frame ${frame.frameId} (display ${frame.displayId}).`,
      );
    }
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
      throw new FrameMismatchError("A point needs two finite coordinates");
    }
    if (
      input.x < 0 ||
      input.y < 0 ||
      input.x >= frame.imageWidth ||
      input.y >= frame.imageHeight
    ) {
      throw new FrameMismatchError(
        `(${input.x}, ${input.y}) is outside the screenshot ${frame.imageWidth}x${frame.imageHeight} for frame ${frame.frameId}.`,
      );
    }

    const live = liveDisplays.find((item) => item.id === frame.displayId);
    if (!live) {
      throw new StaleFrameError(
        `Display ${frame.displayId} from frame ${frame.frameId} is no longer attached. Capture again.`,
      );
    }
    if (!geometryMatches(frame.display, live)) {
      throw new StaleFrameError(
        `Display ${frame.displayId} geometry changed since frame ${frame.frameId}. Capture again.`,
      );
    }

    if (frame.physical) {
      const phys = frame.physical;
      // Pixel center → same space as BitBlt / SetCursorPos.
      const point: Point = {
        x: Math.round(
          phys.x + ((input.x + 0.5) / frame.imageWidth) * phys.width,
        ),
        y: Math.round(
          phys.y + ((input.y + 0.5) / frame.imageHeight) * phys.height,
        ),
      };
      if (
        point.x < phys.x ||
        point.y < phys.y ||
        point.x >= phys.x + phys.width ||
        point.y >= phys.y + phys.height
      ) {
        throw new FrameMismatchError(
          `Physical point (${point.x}, ${point.y}) left capture rect ${phys.width}x${phys.height} at ${phys.x},${phys.y}`,
        );
      }
      return { frame, point, space: "physical" };
    }

    const scaleX = frame.display.width / frame.imageWidth;
    const scaleY = frame.display.height / frame.imageHeight;
    const local: Point = {
      x: Math.round((input.x + 0.5) * scaleX),
      y: Math.round((input.y + 0.5) * scaleY),
    };
    return {
      frame,
      space: "dip",
      point: resolvePoint(liveDisplays, fromDisplayPoint(live, local)),
    };
  }
}

function geometryMatches(expected: Display, live: Display): boolean {
  return (
    expected.x === live.x &&
    expected.y === live.y &&
    expected.width === live.width &&
    expected.height === live.height
  );
}

/** Process-wide store used by screen.capture / input.* tools. */
export const displayFrames = new DisplayFrameStore();

/** Test helper. */
export function __resetDisplayFramesForTest(): void {
  displayFrames.clear();
}
