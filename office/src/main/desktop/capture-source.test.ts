import { describe, expect, it } from "vitest";
import {
  assignCapturerSources,
  pickCapturerSource,
  sourceDisplayKey,
} from "./capture-source.js";

function source(input: {
  id: string;
  display_id?: string;
  width: number;
  height: number;
}) {
  return {
    id: input.id,
    name: "Screen",
    display_id: input.display_id ?? "",
    thumbnail: {
      isEmpty: () => false,
      getSize: () => ({ width: input.width, height: input.height }),
    },
  };
}

describe("pickCapturerSource", () => {
  it("matches display_id when present", () => {
    const sources = [
      source({ id: "screen:1:0", display_id: "1", width: 1600, height: 900 }),
      source({ id: "screen:2:0", display_id: "2", width: 900, height: 1600 }),
    ];
    expect(
      pickCapturerSource(sources, { id: 2, width: 1080, height: 1920 })?.id,
    ).toBe("screen:2:0");
  });

  it("parses screen:ZZ when display_id is empty", () => {
    const sources = [
      source({ id: "screen:10:0", width: 1600, height: 900 }),
      source({ id: "screen:20:0", width: 900, height: 1600 }),
    ];
    expect(
      pickCapturerSource(sources, { id: 20, width: 1080, height: 1920 })?.id,
    ).toBe("screen:20:0");
  });

  it("falls back to closest aspect ratio on dual monitors", () => {
    const sources = [
      source({ id: "screen:a:0", width: 1600, height: 900 }),
      source({ id: "screen:b:0", width: 900, height: 1600 }),
    ];
    expect(
      pickCapturerSource(sources, { id: 99, width: 1080, height: 1920 })?.id,
    ).toBe("screen:b:0");
  });

  it("does not give both identical landscape monitors the same source", () => {
    const sources = [
      source({ id: "screen:0:0", width: 1600, height: 900 }),
      source({ id: "screen:1:0", width: 1600, height: 900 }),
    ];
    const displays = [
      { id: 100, width: 1920, height: 1080, scaleFactor: 1, index: 0 },
      { id: 200, width: 1920, height: 1080, scaleFactor: 1, index: 1 },
    ];
    const a = pickCapturerSource(sources, displays[0]!, displays);
    const b = pickCapturerSource(sources, displays[1]!, displays);
    expect(a?.id).toBe("screen:0:0");
    expect(b?.id).toBe("screen:1:0");
    expect(a?.id).not.toBe(b?.id);
  });
});

describe("assignCapturerSources", () => {
  it("zips identical monitors by ordinal instead of duplicating", () => {
    const sources = [
      source({ id: "screen:0:0", width: 1280, height: 720 }),
      source({ id: "screen:1:0", width: 1280, height: 720 }),
    ];
    const displays = [
      { id: 11, width: 1920, height: 1080, index: 0 },
      { id: 22, width: 1920, height: 1080, index: 1 },
    ];
    const rows = assignCapturerSources(sources, displays);
    expect(rows.map((row) => row.source?.id)).toEqual([
      "screen:0:0",
      "screen:1:0",
    ]);
  });
});

describe("sourceDisplayKey", () => {
  it("prefers display_id", () => {
    expect(
      sourceDisplayKey({
        id: "screen:1:0",
        name: "Screen",
        display_id: "42",
        thumbnail: {
          isEmpty: () => false,
          getSize: () => ({ width: 1, height: 1 }),
        },
      }),
    ).toBe("42");
  });
});
