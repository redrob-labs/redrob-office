import { describe, expect, it } from "vitest";
import { looksBlank, toTopDownOpaqueBgra } from "./capture-win32-gdi.js";

/** One BGRA pixel with the alpha byte left at 0, the way BitBlt returns it. */
function pixel(b: number, g: number, r: number): number[] {
  return [b, g, r, 0];
}

describe("toTopDownOpaqueBgra", () => {
  it("flips row order and forces alpha opaque", () => {
    // 1x2: bottom row red, top row blue (bottom-up means red comes first).
    const bottomUp = Buffer.from([...pixel(0, 0, 255), ...pixel(255, 0, 0)]);
    const out = toTopDownOpaqueBgra(bottomUp, 1, 2);
    expect([...out.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...out.subarray(4, 8)]).toEqual([0, 0, 255, 255]);
  });

  it("never leaves a transparent pixel behind", () => {
    const bottomUp = Buffer.alloc(4 * 4);
    const out = toTopDownOpaqueBgra(bottomUp, 2, 2);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });
});

describe("looksBlank", () => {
  it("catches a uniform readback", () => {
    expect(looksBlank(Buffer.alloc(4 * 16, 0))).toBe(true);
  });

  it("passes a picture with any variation", () => {
    const bgra = Buffer.alloc(4 * 4, 0);
    bgra[5] = 40;
    expect(looksBlank(bgra)).toBe(false);
  });
});
