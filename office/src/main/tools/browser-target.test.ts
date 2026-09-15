import { describe, expect, it } from "vitest";
import { resolveBrowserTarget, systemBrowserNote } from "./browser-target";

describe("resolveBrowserTarget", () => {
  it("always opens in the system browser", () => {
    expect(resolveBrowserTarget(undefined, "app")).toBe("system");
    expect(resolveBrowserTarget(undefined, "system")).toBe("system");
    expect(resolveBrowserTarget("app", "system")).toBe("system");
    expect(resolveBrowserTarget("system", "app")).toBe("system");
  });
});

describe("systemBrowserNote", () => {
  it("says there is no in-app browser to drive", () => {
    const note = systemBrowserNote("https://example.com");
    expect(note).toContain("https://example.com");
    expect(note).toContain("default browser");
    expect(note).not.toContain('target "app"');
  });
});
