import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readAndValidateBackup,
  restoreBackupFiles,
  writeBackupFile,
} from "./backup.js";

describe("local backup", () => {
  it("round-trips encrypted files for the same email", async () => {
    const root = await mkdtemp(join(tmpdir(), "redrob-backup-"));
    const userData = join(root, "userData");
    const dest = join(root, "out.redrobbak");
    try {
      await mkdir(join(userData, "registry"), { recursive: true });
      await mkdir(join(userData, "artifacts"), { recursive: true });
      await writeFile(join(userData, "setup.json"), '{"mode":"local"}');
      await writeFile(
        join(userData, "account.json"),
        JSON.stringify({ email: "a@b.com", backup: { enabled: true } }),
      );
      await writeFile(join(userData, "redrob.sqlite"), "sqlite-bytes");
      await writeFile(join(userData, "registry", "rubric.json"), '{"id":1}');
      await writeFile(join(userData, "artifacts", "note.txt"), "hello");

      await writeBackupFile({
        userData,
        destPath: dest,
        email: "A@B.com",
        appVersion: "0.0.0-test",
      });

      const payload = await readAndValidateBackup(dest, "a@b.com");
      expect(payload.email).toBe("a@b.com");
      expect(payload.files["setup.json"]).toBeTruthy();

      const restored = join(root, "restored");
      await mkdir(restored, { recursive: true });
      await restoreBackupFiles(restored, payload);
      expect(await readFile(join(restored, "setup.json"), "utf8")).toBe('{"mode":"local"}');
      expect(await readFile(join(restored, "artifacts", "note.txt"), "utf8")).toBe("hello");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects the wrong email", async () => {
    const root = await mkdtemp(join(tmpdir(), "redrob-backup-"));
    const userData = join(root, "userData");
    const dest = join(root, "out.redrobbak");
    try {
      await mkdir(userData, { recursive: true });
      await writeFile(join(userData, "setup.json"), "{}");
      await writeBackupFile({
        userData,
        destPath: dest,
        email: "owner@example.com",
        appVersion: "0.0.0-test",
      });
      await expect(readAndValidateBackup(dest, "other@example.com")).rejects.toThrow(/decrypt|email/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
