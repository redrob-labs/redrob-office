import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  generateHwpxFromMarkdown,
  parseDocument,
  patchDocument,
} from "./edit.js";

describe("kordoc edit", () => {
  it("parses and patches an HWPX document", async () => {
    const made = await generateHwpxFromMarkdown("# 원본 제목\n\n바꿀 문장입니다.");
    const parsed = await parseDocument(made.path);
    expect(parsed.fileType).toBe("hwpx");
    expect(parsed.markdown).toContain("바꿀 문장");

    const edited = parsed.markdown.replace("바꿀 문장입니다.", "수정된 문장입니다.");
    const patched = await patchDocument({ original: made.path, editedMarkdown: edited });
    expect(patched.format).toBe("hwpx");
    expect(patched.applied).toBeGreaterThanOrEqual(1);
    expect((await readFile(patched.path)).byteLength).toBeGreaterThan(200);

    const again = await parseDocument(patched.path);
    expect(again.markdown).toContain("수정된 문장");
  });

  it("generates HWPX from markdown via kordoc", async () => {
    const result = await generateHwpxFromMarkdown("# 안내\n\n본문입니다.");
    expect(result.path.endsWith(".hwpx")).toBe(true);
    const parsed = await parseDocument(result.path);
    expect(parsed.markdown).toMatch(/안내|본문/);
  });
});
