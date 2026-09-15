import { describe, expect, it, beforeEach } from "vitest";
import {
  DisplayFrameStore,
  FrameMismatchError,
  StaleFrameError,
  __resetDisplayFramesForTest,
} from "./display-frames.js";
import type { Display } from "./geometry.js";

const primary: Display = {
  id: 1,
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  primary: true,
};

const left: Display = {
  id: 2,
  x: -1280,
  y: 0,
  width: 1280,
  height: 1024,
  primary: false,
};

describe("DisplayFrameStore", () => {
  let store: DisplayFrameStore;

  beforeEach(() => {
    __resetDisplayFramesForTest();
    store = new DisplayFrameStore();
  });

  it("maps image pixels through scale onto the live display", () => {
    const [frame] = store.replaceFromCaptures([
      { display: primary, width: 960, height: 540, scale: 2 },
    ]);
    const resolved = store.resolveImagePoint(
      { frameId: frame!.frameId, x: 100, y: 50 },
      [primary, left],
    );
    expect(resolved.space).toBe("dip");
    // Pixel centers: (100.5)*2, (50.5)*2
    expect(resolved.point).toEqual({ x: 201, y: 101 });
  });

  it("maps image pixels onto the physical capture rect for GDI frames", () => {
    const [frame] = store.replaceFromCaptures([
      {
        display: primary,
        width: 960,
        height: 540,
        scale: 2,
        physical: { x: 100, y: 200, width: 1920, height: 1080 },
      },
    ]);
    const resolved = store.resolveImagePoint(
      { frameId: frame!.frameId, x: 480, y: 270 },
      [primary],
    );
    expect(resolved.space).toBe("physical");
    // Center of image → center of physical rect.
    expect(resolved.point).toEqual({
      x: Math.round(100 + (480.5 / 960) * 1920),
      y: Math.round(200 + (270.5 / 540) * 1080),
    });
  });

  it("rejects unknown frameIds after a new capture", () => {
    const [old] = store.replaceFromCaptures([
      { display: primary, width: 100, height: 100, scale: 1 },
    ]);
    store.replaceFromCaptures([
      { display: primary, width: 100, height: 100, scale: 1 },
    ]);
    expect(() =>
      store.resolveImagePoint(
        { frameId: old!.frameId, x: 1, y: 1 },
        [primary],
      ),
    ).toThrow(StaleFrameError);
  });

  it("rejects displayId that does not match the frame", () => {
    const [frame] = store.replaceFromCaptures([
      { display: primary, width: 100, height: 100, scale: 1 },
    ]);
    expect(() =>
      store.resolveImagePoint(
        { frameId: frame!.frameId, x: 1, y: 1, displayId: 99 },
        [primary],
      ),
    ).toThrow(FrameMismatchError);
  });

  it("rejects points outside the screenshot", () => {
    const [frame] = store.replaceFromCaptures([
      { display: primary, width: 100, height: 80, scale: 1 },
    ]);
    expect(() =>
      store.resolveImagePoint(
        { frameId: frame!.frameId, x: 100, y: 10 },
        [primary],
      ),
    ).toThrow(FrameMismatchError);
  });

  it("rejects when display geometry changed", () => {
    const [frame] = store.replaceFromCaptures([
      { display: primary, width: 100, height: 100, scale: 1 },
    ]);
    const moved: Display = { ...primary, x: 100 };
    expect(() =>
      store.resolveImagePoint(
        { frameId: frame!.frameId, x: 1, y: 1 },
        [moved],
      ),
    ).toThrow(StaleFrameError);
  });

  it("keeps every monitor from one batch valid until the next capture", () => {
    const frames = store.replaceFromCaptures([
      { display: primary, width: 960, height: 540, scale: 2 },
      { display: left, width: 640, height: 512, scale: 2 },
    ]);
    expect(frames).toHaveLength(2);
    const onLeft = store.resolveImagePoint(
      { frameId: frames[1]!.frameId, x: 10, y: 20 },
      [primary, left],
    );
    expect(onLeft.point).toEqual({
      x: -1280 + Math.round(10.5 * 2),
      y: Math.round(20.5 * 2),
    });
  });

  it("requires a frameId", () => {
    expect(() =>
      store.resolveImagePoint({ frameId: "  ", x: 1, y: 1 }, [primary]),
    ).toThrow(StaleFrameError);
  });
});
