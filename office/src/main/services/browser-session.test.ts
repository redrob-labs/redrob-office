import type { BrowserWindow } from "electron";
import { describe, expect, it } from "vitest";
import { inTheRenderer } from "./browser-session.js";

/** A window whose renderer answers, or does not. */
function stubWindow(answer: Promise<unknown>): BrowserWindow {
  return {
    webContents: {
      executeJavaScript: () => answer,
      once: () => undefined,
    },
  } as unknown as BrowserWindow;
}

describe("inTheRenderer", () => {
  it("returns what the page evaluated", async () => {
    expect(
      await inTheRenderer<string>(stubWindow(Promise.resolve("Careers")), "document.title"),
    ).toBe("Careers");
  });

  /**
   * One run opened a site whose renderer never came back and browser.open sat
   * there for fifteen minutes with the whole turn behind it.
   */
  it("gives up on a page that never answers, with somewhere to go next", async () => {
    await expect(
      inTheRenderer(stubWindow(new Promise(() => {})), "document.title", 20),
    ).rejects.toThrow(/BROWSER_PAGE_UNRESPONSIVE.*another source/s);
  });

  it("stops waiting when the window goes away", async () => {
    const closing = {
      webContents: {
        executeJavaScript: () => new Promise(() => {}),
        once: (_event: string, listener: () => void) => setTimeout(listener, 5),
      },
    } as unknown as BrowserWindow;
    await expect(inTheRenderer(closing, "document.title", 10_000)).rejects.toThrow(
      "BROWSER_WINDOW_CLOSED",
    );
  });
});
