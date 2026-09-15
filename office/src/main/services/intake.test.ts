import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listTextFiles } from "./intake.js";

describe("listTextFiles", () => {
  it("finds nested intake files and skips formats it cannot decode", async () => {
    const root = await mkdtemp(join(tmpdir(), "redrob-intake-"));
    const nested = join(root, "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, "a.txt"), "hello");
    await writeFile(join(root, "b.md"), "# resume");
    await writeFile(join(root, "c.pdf"), "%PDF");
    await writeFile(join(root, "skip.png"), "\x89PNG");
    await writeFile(join(nested, "d.json"), "{}");

    const files = await listTextFiles(root);
    expect(files.some((path) => path.endsWith("a.txt"))).toBe(true);
    expect(files.some((path) => path.endsWith("b.md"))).toBe(true);
    // PDF and DOCX are decoded by @redrob/extract, so they are intake sources.
    expect(files.some((path) => path.endsWith("c.pdf"))).toBe(true);
    expect(files.some((path) => path.endsWith("d.json"))).toBe(true);
    expect(files.some((path) => path.endsWith("skip.png"))).toBe(false);
  });
});
