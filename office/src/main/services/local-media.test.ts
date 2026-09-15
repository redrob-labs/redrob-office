import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isUnderDir, readLocalMediaDataUrl } from "./local-media.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("local-media", () => {
  it("accepts paths inside the captures root", () => {
    expect(isUnderDir("/tmp/captures/a.png", "/tmp/captures")).toBe(true);
    expect(isUnderDir("/tmp/other/a.png", "/tmp/captures")).toBe(false);
  });

  it("returns a data URL for a png under the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "rr-media-"));
    dirs.push(root);
    const file = join(root, "shot.png");
    // Minimal PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await writeFile(file, png);
    const media = await readLocalMediaDataUrl(file, [root]);
    expect(media?.mime).toBe("image/png");
    expect(media?.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});
