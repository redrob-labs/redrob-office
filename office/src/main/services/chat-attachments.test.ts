import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachDroppedFiles } from "./chat-attachments.js";

/**
 * Files that arrive without a path.
 *
 * Electron 32 took `File.path` away and a pasted screenshot never had one, so
 * everything dropped on the composer comes across as bytes. These cover what
 * that costs: a picture has to survive to disk to be shown and sent, and a text
 * file has to come back decoded like a picked one.
 */

let userData = "";

beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), "redrob-attach-"));
});

afterEach(async () => {
  await rm(userData, { recursive: true, force: true });
});

const bytes = (text: string): Uint8Array =>
  new Uint8Array(Buffer.from(text, "utf8"));

describe("attachDroppedFiles", () => {
  it("decodes a dropped text file", async () => {
    const [file] = await attachDroppedFiles(
      [{ name: "notes.md", bytes: bytes("# Q3\n\nrevenue up") }],
      userData,
    );
    expect(file?.name).toBe("notes.md");
    expect(file?.text).toContain("revenue up");
    expect(file?.image).toBeUndefined();
  });

  it("keeps a pasted picture on disk, byte for byte", async () => {
    // A one-pixel PNG: the header is what says this is an image at all.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAgAABQABDQottAAAAABJRU5ErkJggg==",
      "base64",
    );
    const [file] = await attachDroppedFiles(
      [{ name: "image.png", type: "image/png", bytes: new Uint8Array(png) }],
      userData,
    );
    expect(file?.image?.mime).toBe("image/png");
    expect(file?.text).toBe("");
    const staged = await readFile(file?.image?.path ?? "");
    expect(staged.equals(png)).toBe(true);
  });

  it("trusts the clipboard's type when the blob has no useful name", async () => {
    const [file] = await attachDroppedFiles(
      [{ name: "blob", type: "image/png", bytes: bytes("not really a png") }],
      userData,
    );
    expect(file?.image?.mime).toBe("image/png");
  });

  it("refuses a file nothing can read, rather than attaching a name", async () => {
    await expect(
      attachDroppedFiles(
        [{ name: "installer.exe", bytes: bytes("MZ") }],
        userData,
      ),
    ).rejects.toThrow(/Unsupported file type/);
  });

  it("takes five and no more, so one drop cannot fill the turn", async () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      name: `note-${index}.txt`,
      bytes: bytes(`note ${index}`),
    }));
    const files = await attachDroppedFiles(many, userData);
    expect(files).toHaveLength(5);
  });

  it("shares one character budget across the batch", async () => {
    const wall = "x".repeat(30_000);
    const files = await attachDroppedFiles(
      [
        { name: "a.txt", bytes: bytes(wall) },
        { name: "b.txt", bytes: bytes(wall) },
        { name: "c.txt", bytes: bytes(wall) },
      ],
      userData,
    );
    const total = files.reduce((sum, file) => sum + file.charCount, 0);
    expect(total).toBeLessThanOrEqual(64_000);
    expect(files.some((file) => file.truncated)).toBe(true);
  });
});
