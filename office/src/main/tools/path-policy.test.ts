import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertAllowedPath,
  assertAllowedPathEntry,
  isBlockedExactRoot,
  isHardDenied,
  isUnderAllowed,
} from "./path-policy.js";

/**
 * The policy resolves symlinks before judging a path, because otherwise a link
 * inside an allowed folder is an escape hatch out of it. On macOS `/tmp` is
 * itself a link to `/private/tmp`, so a fixture built from `tmpdir()` is only
 * comparable once it has been through the same resolution.
 */
const TMP = realpathSync(tmpdir());

describe("path-policy", () => {
  it("allows nested paths under an allowlisted folder", () => {
    const root = mkdtempSync(join(TMP, "redrob-allow-"));
    try {
      const nested = join(root, "notes", "x.md");
      expect(isUnderAllowed(join(root, "a.txt"), [root])).toBe(true);
      expect(assertAllowedPath(nested, [root])).toBe(nested);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects paths outside allowlist", () => {
    const root = mkdtempSync(join(TMP, "redrob-allow-"));
    try {
      expect(isUnderAllowed(join(TMP, "other-file.txt"), [root])).toBe(false);
      expect(() => assertAllowedPath(join(TMP, "other-file.txt"), [root])).toThrow(
        /Access denied/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks registering the home directory root", () => {
    expect(isBlockedExactRoot(homedir())).toBe(true);
    expect(() => assertAllowedPathEntry(homedir())).toThrow(/blocked/i);
  });

  it("hard-denies credential directories even under an allow root", () => {
    const root = mkdtempSync(join(TMP, "redrob-allow-"));
    try {
      const ssh = join(homedir(), ".ssh", "id_rsa");
      expect(isHardDenied(ssh) || !isUnderAllowed(ssh, [root])).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
