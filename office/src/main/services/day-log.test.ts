import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSources: vi.fn(),
  captureDisplayPngNative: vi.fn(),
  notifyDesktop: vi.fn(),
}));

vi.mock("electron", () => ({
  desktopCapturer: { getSources: mocks.getSources },
  screen: {
    getPrimaryDisplay: () => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
    }),
  },
}));
vi.mock("../desktop/capture.js", () => ({
  captureDisplayPngNative: mocks.captureDisplayPngNative,
}));
vi.mock("./notify.js", () => ({ notifyDesktop: mocks.notifyDesktop }));
vi.mock("./setup.js", () => ({ loadSetupState: vi.fn() }));
vi.mock("./vision/index.js", () => ({
  generateVisionChat: vi.fn(),
  getVisionSidecarStatus: () => ({ disabled: false }),
  visionSidecarAssetsReady: async () => false,
}));

import {
  configureDayLogRoot,
  startDayLogSession,
  stopDayLogSession,
  getActiveDayLogSession,
} from "./day-log.js";

const PNG = Buffer.from("native-screenshot-bytes");

function thumbnailSource(): unknown {
  return [
    {
      display_id: "1",
      name: "Entire screen",
      thumbnail: {
        isEmpty: () => false,
        toPNG: () => Buffer.from("chromium-screenshot-bytes"),
      },
    },
  ];
}

describe("day log capture", () => {
  let root = "";

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), "redrob-daylog-test-"));
    configureDayLogRoot(root);
    mocks.getSources.mockResolvedValue(thumbnailSource());
  });

  afterEach(async () => {
    if (getActiveDayLogSession()?.status === "recording") {
      await stopDayLogSession();
    }
    rmSync(root, { recursive: true, force: true });
  });

  it("captures through the native path without touching desktopCapturer", async () => {
    mocks.captureDisplayPngNative.mockReturnValue({
      png: PNG,
      physical: { x: 0, y: 0, width: 1920, height: 1080 },
    });

    const session = await startDayLogSession({ intervalMs: 60_000 });

    expect(session.captures).toHaveLength(1);
    expect(mocks.getSources).not.toHaveBeenCalled();
    expect(session.captures[0]?.bytes).toBe(PNG.length);
    expect(readdirSync(join(root, "day-logs", session.id))).toContain(
      `${session.captures[0]!.id}.png`,
    );
  });

  it("falls back to desktopCapturer where no native path exists", async () => {
    mocks.captureDisplayPngNative.mockReturnValue(null);

    const session = await startDayLogSession({ intervalMs: 60_000 });

    expect(mocks.getSources).toHaveBeenCalledTimes(1);
    expect(mocks.getSources.mock.calls[0]?.[0]).toMatchObject({
      types: ["screen"],
    });
    expect(session.captures).toHaveLength(1);
  });

  it("notifies once per capture instead of surfacing the window", async () => {
    mocks.captureDisplayPngNative.mockReturnValue({
      png: PNG,
      physical: { x: 0, y: 0, width: 1920, height: 1080 },
    });

    await startDayLogSession({ intervalMs: 60_000, locale: "en" });

    expect(mocks.notifyDesktop).toHaveBeenCalledTimes(1);
    expect(mocks.notifyDesktop.mock.calls[0]?.[0]).toEqual({
      title: "Day log",
      body: "Screen captured — 1 so far.",
    });
  });

  it("stays quiet when the person turned capture notices off", async () => {
    mocks.captureDisplayPngNative.mockReturnValue({
      png: PNG,
      physical: { x: 0, y: 0, width: 1920, height: 1080 },
    });

    const session = await startDayLogSession({
      intervalMs: 60_000,
      notifyOnCapture: false,
    });

    expect(session.notifyOnCapture).toBe(false);
    expect(mocks.notifyDesktop).not.toHaveBeenCalled();
  });

  it("reports a failed capture once rather than every retry", async () => {
    mocks.captureDisplayPngNative.mockReturnValue(null);
    mocks.getSources.mockResolvedValue([]);

    const session = await startDayLogSession({
      intervalMs: 60_000,
      locale: "en",
    });

    expect(session.captures).toHaveLength(0);
    expect(mocks.notifyDesktop).toHaveBeenCalledTimes(1);
    expect(mocks.notifyDesktop.mock.calls[0]?.[0]?.body).toContain(
      "Screen capture failed",
    );
  });
});
