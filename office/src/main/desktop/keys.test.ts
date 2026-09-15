import { describe, expect, it } from "vitest";
import {
  chordToVirtualKeys,
  chordToX11,
  KeyParseError,
  parseChord,
  virtualKey,
} from "./keys";

describe("parseChord", () => {
  it("reads a chord the way it is written down", () => {
    expect(parseChord("ctrl+shift+t")).toEqual({
      modifiers: ["ctrl", "shift"],
      key: "t",
    });
  });

  it("accepts the names each platform uses for the same modifier", () => {
    expect(parseChord("cmd+c").modifiers).toEqual(["meta"]);
    expect(parseChord("command+c").modifiers).toEqual(["meta"]);
    expect(parseChord("win+r").modifiers).toEqual(["meta"]);
    expect(parseChord("option+x").modifiers).toEqual(["alt"]);
  });

  it("puts modifiers in one order however they were typed", () => {
    expect(parseChord("shift+ctrl+a").modifiers).toEqual(["ctrl", "shift"]);
    expect(parseChord("ctrl+shift+a").modifiers).toEqual(["ctrl", "shift"]);
  });

  it("keeps a repeated modifier once", () => {
    expect(parseChord("ctrl+ctrl+a").modifiers).toEqual(["ctrl"]);
  });

  it("spells out the keys that cannot be written literally", () => {
    expect(parseChord("esc").key).toBe("escape");
    expect(parseChord("enter").key).toBe("return");
    expect(parseChord("pgdn").key).toBe("pagedown");
  });

  it("survives a chord whose key is the separator", () => {
    expect(parseChord("ctrl++")).toEqual({ modifiers: ["ctrl"], key: "plus" });
    expect(parseChord("ctrl+plus")).toEqual({
      modifiers: ["ctrl"],
      key: "plus",
    });
  });

  it("is case and space insensitive", () => {
    expect(parseChord("  CTRL + T ")).toEqual({
      modifiers: ["ctrl"],
      key: "t",
    });
  });

  it("refuses what it cannot press", () => {
    expect(() => parseChord("")).toThrow(KeyParseError);
    expect(() => parseChord("ctrl")).toThrow(KeyParseError);
    expect(() => parseChord("ctrl+a+b")).toThrow(KeyParseError);
  });
});

describe("chordToX11", () => {
  it("writes what xdotool expects", () => {
    expect(chordToX11(parseChord("ctrl+shift+t"))).toBe("ctrl+shift+t");
    expect(chordToX11(parseChord("cmd+space"))).toBe("super+space");
    expect(chordToX11(parseChord("enter"))).toBe("Return");
    expect(chordToX11(parseChord("pgup"))).toBe("Page_Up");
    expect(chordToX11(parseChord("f5"))).toBe("F5");
  });
});

describe("virtualKey", () => {
  it("maps letters, digits and function keys", () => {
    expect(virtualKey("a")).toBe(0x41);
    expect(virtualKey("z")).toBe(0x5a);
    expect(virtualKey("0")).toBe(0x30);
    expect(virtualKey("f1")).toBe(0x70);
    expect(virtualKey("f12")).toBe(0x7b);
  });

  it("maps the named keys", () => {
    expect(virtualKey("escape")).toBe(0x1b);
    expect(virtualKey("return")).toBe(0x0d);
  });

  it("has no code for something that is not a key", () => {
    expect(virtualKey("wibble")).toBeNull();
    expect(virtualKey("f25")).toBeNull();
  });
});

describe("chordToVirtualKeys", () => {
  it("lists modifiers before the key, so they are held first", () => {
    expect(chordToVirtualKeys(parseChord("ctrl+shift+t"))).toEqual([
      0x11, 0x10, 0x54,
    ]);
  });

  it("reports a chord it cannot press rather than pressing the wrong thing", () => {
    expect(chordToVirtualKeys({ modifiers: [], key: "wibble" })).toBeNull();
  });
});
