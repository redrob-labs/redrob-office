import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  allowAlways,
  alwaysAllowedIn,
  configureChatPermissions,
  isAlwaysAllowed,
  revokeAlways,
} from "./chat-permissions";

const dirs: string[] = [];

afterEach(async () => {
  revokeAlways();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("standing permission", () => {
  it("is not given until it is asked for", () => {
    expect(isAlwaysAllowed("chat-1", "screen.capture")).toBe(false);
  });

  it("holds for the tool it was given for", () => {
    allowAlways("chat-1", "screen.capture");
    expect(isAlwaysAllowed("chat-1", "screen.capture")).toBe(true);
  });

  it("does not spread to other tools", () => {
    allowAlways("chat-1", "screen.capture");
    expect(isAlwaysAllowed("chat-1", "input.click")).toBe(false);
  });

  it("does not spread to other conversations", () => {
    allowAlways("chat-1", "screen.capture");
    expect(isAlwaysAllowed("chat-2", "screen.capture")).toBe(false);
  });

  it("can be shown back, so a person can see what they have granted", () => {
    allowAlways("chat-1", "input.click");
    allowAlways("chat-1", "screen.capture");
    expect(alwaysAllowedIn("chat-1")).toEqual(["input.click", "screen.capture"]);
    expect(alwaysAllowedIn("chat-2")).toEqual([]);
  });

  it("is taken back one conversation at a time", () => {
    allowAlways("chat-1", "screen.capture");
    allowAlways("chat-2", "screen.capture");
    revokeAlways("chat-1");
    expect(isAlwaysAllowed("chat-1", "screen.capture")).toBe(false);
    expect(isAlwaysAllowed("chat-2", "screen.capture")).toBe(true);
  });

  it("granting twice is granting once", () => {
    allowAlways("chat-1", "screen.capture");
    allowAlways("chat-1", "screen.capture");
    expect(alwaysAllowedIn("chat-1")).toEqual(["screen.capture"]);
  });

  it("survives a restart of the permission store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rr-perms-"));
    dirs.push(dir);
    configureChatPermissions(dir);
    allowAlways("chat-ch~general", "screen.capture");
    const saved = await readFile(join(dir, "chat-permissions.json"), "utf8");
    expect(saved).toMatch(/screen\.capture/);
    // Re-read from disk the way boot does after a restart.
    configureChatPermissions(dir);
    expect(isAlwaysAllowed("chat-ch~general", "screen.capture")).toBe(true);
  });
});
