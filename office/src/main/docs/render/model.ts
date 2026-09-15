import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { DocRenderModel } from "../../../shared/doc-render.js";
import { HWP_FONT_FACE_CSS } from "./hwp-font.js";
import { readHwpPages } from "./hwp-model.js";
import { readPptxSlides } from "./pptx-model.js";
import { readXlsxSheets } from "./xlsx-model.js";

/**
 * Reduce a file on disk to the small model the app draws. Word travels as its
 * own bytes because a library lays it out in the page; the others become a grid
 * or a run of slides the app can draw itself.
 */
export async function buildRenderModel(path: string): Promise<DocRenderModel> {
  const ext = extname(path).toLowerCase();
  if (ext === ".md" || ext === ".markdown" || ext === ".txt") {
    return { kind: "md", text: await readFile(path, "utf8") };
  }
  if (ext === ".html" || ext === ".htm") {
    return { kind: "html", html: await readFile(path, "utf8") };
  }
  if (ext === ".docx") {
    const buf = await readFile(path);
    return { kind: "docx", base64: buf.toString("base64") };
  }
  if (ext === ".xlsx") {
    return { kind: "xlsx", sheets: await readXlsxSheets(path) };
  }
  if (ext === ".pptx") {
    const { slides, widthEmu, heightEmu } = await readPptxSlides(path);
    return { kind: "pptx", slides, widthEmu, heightEmu };
  }
  if (ext === ".hwp" || ext === ".hwpx") {
    return { kind: "hwp", pages: await readHwpPages(path), fontCss: HWP_FONT_FACE_CSS };
  }
  return { kind: "unsupported", reason: ext.replace(".", "") || "file" };
}
