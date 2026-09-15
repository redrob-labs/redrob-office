import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const dir = process.env.REDROB_ARTIFACTS_DIR;
if (!dir) throw new Error("REDROB_ARTIFACTS_DIR is required");
await mkdir(dir, { recursive: true });

const mod = await import("@rhwp/core");
await mod.default({
  module_or_path: await readFile(require.resolve("@rhwp/core/rhwp_bg.wasm")),
});
const doc = mod.HwpDocument.createEmpty();
try {
  doc.insertText(0, 0, 0, "분기 실적 요약 — Redrob 한글 문서 데모 2026");
} catch (e) {
  console.log("insertText:", e?.message ?? e);
}
await writeFile(join(dir, "실적요약.hwpx"), Buffer.from(doc.exportHwpx()));
console.log("seeded hwpx in", dir);
