import { describe, expect, it } from "vitest";
import { UnsupportedDesktopError } from "./backend.js";
import {
  __setLinuxUiProbeForTest,
  linuxUiElementsAvailable,
  parseLinuxUiRead,
  readLinuxWindowElements,
} from "./ui-elements-linux.js";

// Captured live from the pyatspi reader run against Mousepad in this repo's
// headless X11 session (menu bar + text area), so the parser is checked
// against real AT-SPI output rather than a hand-drawn guess.
const MOUSEPAD = [
  '{"k": "w", "n": "mousepad", "t": "Untitled 1 - Mousepad", "x": 639, "y": 360, "w": 642, "h": 509}',
  '{"k": "f", "i": 0, "x": 639, "y": 360, "w": 642, "h": 509}',
  '{"k": "e", "n": "File", "r": "MenuItem", "x": 640, "y": 388, "w": 37, "h": 27, "en": true, "v": null, "i": 0}',
  '{"k": "e", "n": "Edit", "r": "MenuItem", "x": 677, "y": 388, "w": 39, "h": 27, "en": true, "v": null, "i": 0}',
  '{"k": "e", "n": "Search", "r": "MenuItem", "x": 716, "y": 388, "w": 60, "h": 27, "en": true, "v": null, "i": 0}',
  '{"k": "e", "n": "View", "r": "MenuItem", "x": 776, "y": 388, "w": 46, "h": 27, "en": true, "v": null, "i": 0}',
  '{"k": "e", "n": "Document", "r": "MenuItem", "x": 822, "y": 388, "w": 83, "h": 27, "en": true, "v": null, "i": 0}',
  '{"k": "e", "n": "Help", "r": "MenuItem", "x": 905, "y": 388, "w": 44, "h": 27, "en": true, "v": null, "i": 0}',
  '{"k": "e", "n": "", "r": "Edit", "x": 641, "y": 418, "w": 638, "h": 447, "en": true, "v": "", "i": 0}',
].join("\n");

describe("parseLinuxUiRead", () => {
  it("shapes the AT-SPI read into named, clickable elements", () => {
    const read = parseLinuxUiRead(MOUSEPAD, 1);
    expect(read.window.process).toBe("mousepad");
    expect(read.window.title).toContain("Mousepad");
    expect(read.window.rect).toEqual({ x: 639, y: 360, width: 642, height: 509 });

    // The six menu-bar entries plus the text area survive the filter.
    const names = read.elements.map((e) => e.name);
    expect(names).toContain("File");
    expect(names).toContain("Help");
    // The unnamed editable region is kept and labelled, not dropped.
    expect(names).toContain("text field");

    const file = read.elements.find((e) => e.name === "File");
    expect(file?.role).toBe("MenuItem");
    // Center is the physical pixel the click path aims at (no DPI remap on X11).
    expect(file?.center).toEqual({ x: 659, y: 402 });
    expect(file?.id).toMatch(/^e1\./);
  });

  it("reports open windows when nothing matched, instead of a bare failure", () => {
    const out = [
      '{"k": "c", "t": "gedit \\u2014 Untitled"}',
      '{"k": "c", "t": "firefox \\u2014 Home"}',
      '{"k": "err", "m": "no window matched"}',
    ].join("\n");
    expect(() => parseLinuxUiRead(out, 3)).toThrow(/no window matched/);
    expect(() => parseLinuxUiRead(out, 3)).toThrow(/gedit/);
  });
});

describe("linux ui availability", () => {
  it("degrades with a helpful message when pyatspi is absent", async () => {
    __setLinuxUiProbeForTest(false);
    try {
      expect(linuxUiElementsAvailable()).toBe(false);
      await expect(readLinuxWindowElements("Text Editor", 1)).rejects.toBeInstanceOf(
        UnsupportedDesktopError,
      );
      await expect(readLinuxWindowElements("Text Editor", 1)).rejects.toThrow(
        /pyatspi/,
      );
    } finally {
      __setLinuxUiProbeForTest(null);
    }
  });

  it("rejects an unsafe match string", async () => {
    __setLinuxUiProbeForTest(true);
    try {
      await expect(
        readLinuxWindowElements("bad; rm -rf /", 1),
      ).rejects.toThrow(/plain app or window name/);
    } finally {
      __setLinuxUiProbeForTest(null);
    }
  });
});
