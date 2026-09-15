import { describe, expect, it } from "vitest";
import {
  displayAt,
  fromDisplayPoint,
  OffScreenError,
  resolvePoint,
  type Display,
} from "./geometry";

const primary: Display = {
  id: 1,
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  primary: true,
};
/** A second monitor to the left, which is where negative coordinates come from. */
const left: Display = {
  id: 2,
  x: -1280,
  y: 0,
  width: 1280,
  height: 1024,
  primary: false,
};

describe("resolvePoint", () => {
  it("passes a point that is on a screen", () => {
    expect(resolvePoint([primary], { x: 100, y: 200 })).toEqual({
      x: 100,
      y: 200,
    });
  });

  it("rounds, because a click lands on a pixel", () => {
    expect(resolvePoint([primary], { x: 10.6, y: 20.4 })).toEqual({
      x: 11,
      y: 20,
    });
  });

  it("accepts a point on a monitor left of the primary one", () => {
    expect(resolvePoint([primary, left], { x: -640, y: 500 })).toEqual({
      x: -640,
      y: 500,
    });
  });

  it("refuses a point past the right edge rather than sliding it back on", () => {
    expect(() => resolvePoint([primary], { x: 1920, y: 500 })).toThrow(
      OffScreenError,
    );
  });

  it("refuses the gap between two monitors", () => {
    expect(() => resolvePoint([primary, left], { x: -2000, y: 10 })).toThrow(
      OffScreenError,
    );
  });

  it("names the displays it does have, so the mistake is fixable", () => {
    expect(() => resolvePoint([primary], { x: 5000, y: 5000 })).toThrow(
      /1920x1080 at 0,0/,
    );
  });

  it("refuses coordinates that are not numbers", () => {
    expect(() => resolvePoint([primary], { x: Number.NaN, y: 0 })).toThrow(
      OffScreenError,
    );
    expect(() =>
      resolvePoint([primary], { x: Number.POSITIVE_INFINITY, y: 0 }),
    ).toThrow(OffScreenError);
  });

  it("refuses everything when no screen is attached", () => {
    expect(() => resolvePoint([], { x: 0, y: 0 })).toThrow(/No display/);
  });
});

describe("displayAt", () => {
  it("finds the screen a point is on", () => {
    expect(displayAt([primary, left], { x: 10, y: 10 })?.id).toBe(1);
    expect(displayAt([primary, left], { x: -10, y: 10 })?.id).toBe(2);
  });

  it("treats the far edge as belonging to the next screen, not this one", () => {
    expect(displayAt([primary], { x: 1919, y: 0 })?.id).toBe(1);
    expect(displayAt([primary], { x: 1920, y: 0 })).toBeNull();
  });
});

describe("fromDisplayPoint", () => {
  it("moves a point measured on one screenshot into desktop coordinates", () => {
    expect(fromDisplayPoint(left, { x: 100, y: 50 })).toEqual({
      x: -1180,
      y: 50,
    });
    expect(fromDisplayPoint(primary, { x: 100, y: 50 })).toEqual({
      x: 100,
      y: 50,
    });
  });
});
