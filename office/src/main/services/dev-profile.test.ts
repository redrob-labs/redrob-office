import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveUserDataDir, sanitizeProfile } from "./dev-profile.js";

describe("resolveUserDataDir", () => {
  it("returns the real userData dir when nothing is set", () => {
    expect(resolveUserDataDir("/data", {})).toBe("/data");
  });

  it("lets an explicit override win over a dev profile", () => {
    expect(
      resolveUserDataDir("/data", {
        userDataOverride: "/tmp/floor-demo",
        devProfile: "feature-x",
      }),
    ).toBe("/tmp/floor-demo");
  });

  it("files a dev profile under its own subtree", () => {
    // Built with `join` rather than written out: the real path carries the
    // host's separator, so a literal POSIX string only passes on POSIX.
    expect(resolveUserDataDir("/data", { devProfile: "Feature X" })).toBe(
      join("/data", "profiles", "feature-x"),
    );
  });
});

describe("sanitizeProfile", () => {
  it("keeps a safe single segment", () => {
    expect(sanitizeProfile("branch_1.2")).toBe("branch_1.2");
  });

  it("refuses traversal and hidden names", () => {
    expect(sanitizeProfile("..")).toBeNull();
    expect(sanitizeProfile("../etc")).toBeNull();
    expect(sanitizeProfile(".secret")).toBeNull();
    expect(sanitizeProfile("   ")).toBeNull();
    expect(sanitizeProfile(undefined)).toBeNull();
  });
});
