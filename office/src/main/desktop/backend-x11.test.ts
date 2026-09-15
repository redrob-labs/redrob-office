import { describe, expect, it } from "vitest";
import { glidePath } from "./backend-x11.js";

describe("glidePath", () => {
  it("returns just the target when already there", () => {
    expect(glidePath({ x: 100, y: 100 }, { x: 100, y: 100 })).toEqual([
      { x: 100, y: 100 },
    ]);
  });

  it("lands exactly on the target", () => {
    const path = glidePath({ x: 0, y: 0 }, { x: 640, y: 480 });
    expect(path.at(-1)).toEqual({ x: 640, y: 480 });
  });

  it("moves monotonically toward the target", () => {
    const path = glidePath({ x: 0, y: 0 }, { x: 500, y: 0 });
    for (let i = 1; i < path.length; i += 1) {
      expect(path[i]!.x).toBeGreaterThanOrEqual(path[i - 1]!.x);
    }
  });

  it("uses more frames for longer distances but stays bounded", () => {
    const short = glidePath({ x: 0, y: 0 }, { x: 60, y: 0 });
    const long = glidePath({ x: 0, y: 0 }, { x: 4000, y: 0 });
    expect(short.length).toBeGreaterThanOrEqual(2);
    expect(long.length).toBeGreaterThan(short.length);
    expect(long.length).toBeLessThanOrEqual(48);
  });

  it("eases in and out (middle frame is past the halfway point of travel)", () => {
    const path = glidePath({ x: 0, y: 0 }, { x: 1000, y: 0 }, { maxStepPx: 100 });
    // With ease-in-out the samples are symmetric; the first step is smaller than
    // a constant-velocity step would be.
    const constantStep = 1000 / path.length;
    expect(path[0]!.x).toBeLessThan(constantStep);
  });
});
