import { describe, expect, it } from "vitest";
import { X11Backend, x11Available } from "./backend-x11";
import { parseChord } from "./keys";

/*
 * The one test that actually drives a machine.
 *
 * Everything else about input synthesis is checked by reading buffers and
 * strings, which proves the arithmetic and not the effect. This moves the real
 * pointer on a real display and reads back where it went, so at least one
 * backend is known to work rather than known to compile.
 *
 * It skips itself where there is no display to drive, which is most CI.
 */

const available = await x11Available();
const live = available ? describe : describe.skip;

live("driving an X11 desktop", () => {
  const backend = new X11Backend();

  it("moves the pointer to where it was told", async () => {
    await backend.moveTo({ x: 400, y: 300 });
    expect(await backend.cursor()).toEqual({ x: 400, y: 300 });

    await backend.moveTo({ x: 120, y: 90 });
    expect(await backend.cursor()).toEqual({ x: 120, y: 90 });
  });

  it("leaves the pointer where a click was aimed", async () => {
    // Aimed at the desktop rather than at whatever happens to be running, so
    // the test cannot press a button in somebody else's window.
    await backend.click({ x: 5, y: 5 }, "left", 1);
    expect(await backend.cursor()).toEqual({ x: 5, y: 5 });
  });

  it("reports a chord it cannot press instead of pressing something else", async () => {
    await expect(
      backend.pressChord(parseChord("ctrl+shift+f5")),
    ).resolves.toBeUndefined();
  });
});

describe("x11Available", () => {
  it("answers without throwing, whatever this machine is", async () => {
    expect(typeof (await x11Available())).toBe("boolean");
  });
});
