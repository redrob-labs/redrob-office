import { describe, expect, it } from "vitest";
import { parseUiRead, uiaReadScript } from "./ui-elements-win32.js";

const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };

function line(row: Record<string, unknown>): string {
  return JSON.stringify(row);
}

const WINDOW = line({
  k: "w",
  hwnd: 1,
  n: "slack",
  t: "Slack",
  x: 0,
  y: 0,
  w: 1920,
  h: 1080,
});

describe("reading what a field holds", () => {
  // Without the value, an empty search box and one still holding the last
  // query look identical, and typing into the second appends to it.
  it("carries a field's contents through the parse", () => {
    const read = parseUiRead(
      [
        WINDOW,
        line({
          k: "e",
          i: 0,
          n: "Search",
          r: "ControlType.Edit",
          x: 400,
          y: 40,
          w: 300,
          h: 30,
          en: true,
          v: "redrob-labs",
        }),
      ].join("\n"),
      SCREEN,
      1,
    );
    expect(read.elements[0]?.value).toBe("redrob-labs");
  });

  it("leaves the value unset for a control that does not report one", () => {
    const read = parseUiRead(
      [
        WINDOW,
        line({
          k: "e",
          i: 0,
          n: "Send",
          r: "ControlType.Button",
          x: 400,
          y: 700,
          w: 60,
          h: 30,
          en: true,
          v: null,
        }),
      ].join("\n"),
      SCREEN,
      1,
    );
    expect(read.elements[0]?.value).toBeUndefined();
  });

  it("asks for the value in the same trip as everything else", () => {
    const script = uiaReadScript();
    expect(script).toMatch(/ValuePattern\]::ValueProperty/);
    expect(script).toMatch(/CacheRequest/);
  });

  it("answers each read with an end marker, and waits for the next one", () => {
    const script = uiaReadScript();
    expect(script).toMatch(/while \(\$true\)/);
    expect(script).toMatch(/k = 'end'/);
    expect(script).toMatch(/ReadLine/);
  });
});
