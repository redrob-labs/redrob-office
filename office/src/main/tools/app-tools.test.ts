import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  appLaunchEnvironment,
  focusWindowLinux,
  resolveSpawnExecutable,
} from "./app-tools.js";

describe("native app launch environment", () => {
  it("opts Linux child apps into AT-SPI even when Electron opted out", () => {
    const env = appLaunchEnvironment("linux", {
      DISPLAY: ":1",
      NO_AT_BRIDGE: "1",
    });
    expect(env.NO_AT_BRIDGE).toBe("0");
    expect(env.GTK_MODULES?.split(":")).toEqual(
      expect.arrayContaining(["gail", "atk-bridge"]),
    );
    expect(env.DISPLAY).toBe(":1");
  });

  it("keeps existing GTK modules without duplicating the bridge", () => {
    const env = appLaunchEnvironment("linux", {
      GTK_MODULES: "custom:atk-bridge",
    });
    expect(env.GTK_MODULES).toBe("custom:atk-bridge:gail");
  });

  it("does not rewrite non-Linux app environments", () => {
    const source = { NO_AT_BRIDGE: "1" };
    expect(appLaunchEnvironment("win32", source)).toBe(source);
  });
});

describe("resolveSpawnExecutable", () => {
  it("case-folds a display-name target to the PATH binary on Linux", () => {
    const dir = mkdtempSync(join(tmpdir(), "redrob-launch-"));
    const binary = join(dir, "mousepad");
    writeFileSync(binary, "#!/bin/sh\n");
    chmodSync(binary, 0o755);
    // On a case-insensitive filesystem — the macOS and Windows runners — the
    // exact probe already finds `mousepad` under the name `Mousepad`, so the
    // fold never runs and there is no separate case to observe. Either way the
    // command has to come back as the binary that is actually on PATH.
    const caseInsensitiveFs = existsSync(join(dir, "Mousepad"));
    expect(resolveSpawnExecutable("Mousepad", "linux", dir)).toEqual({
      command: caseInsensitiveFs ? "Mousepad" : "mousepad",
      matched: caseInsensitiveFs ? "exact" : "casefold",
    });
  });

  it("keeps an exact PATH hit unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "redrob-launch-"));
    const binary = join(dir, "mousepad");
    writeFileSync(binary, "#!/bin/sh\n");
    chmodSync(binary, 0o755);
    expect(resolveSpawnExecutable("mousepad", "linux", dir)).toEqual({
      command: "mousepad",
      matched: "exact",
    });
  });

  /**
   * mousepad.exe then notepad.exe, both ENOENT, and the run concluded this
   * machine had no editor and left the draft unopened.
   */
  it("drops a .exe suffix that means nothing here", () => {
    const dir = mkdtempSync(join(tmpdir(), "redrob-launch-"));
    const binary = join(dir, "mousepad");
    writeFileSync(binary, "#!/bin/sh\n");
    chmodSync(binary, 0o755);
    expect(resolveSpawnExecutable("mousepad.exe", "linux", dir)).toEqual({
      command: "mousepad",
      matched: "exact",
    });
    expect(resolveSpawnExecutable("Notepad.exe", "linux", dir)).toEqual({
      command: "Notepad.exe",
      matched: "unchanged",
    });
  });

  it("does not rewrite Windows or path/URL targets", () => {
    expect(resolveSpawnExecutable("Mousepad", "win32", "/usr/bin")).toEqual({
      command: "Mousepad",
      matched: "unchanged",
    });
    expect(
      resolveSpawnExecutable("/usr/bin/Mousepad", "linux", "/usr/bin"),
    ).toEqual({ command: "/usr/bin/Mousepad", matched: "unchanged" });
    expect(
      resolveSpawnExecutable("https://example.com", "linux", "/usr/bin"),
    ).toEqual({ command: "https://example.com", matched: "unchanged" });
  });
});

describe("focusWindowLinux", () => {
  it("rejects an empty title before shelling out", async () => {
    expect(await focusWindowLinux("   ")).toEqual({
      ok: false,
      error: "Empty window title",
    });
  });
});
