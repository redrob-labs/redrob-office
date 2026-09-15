/**
 * A whole HTML page for a document, the same drawing the preview shows, sized
 * for paper. Electron prints this to PDF, so an export is the view on a page —
 * no office suite in the loop.
 */
import { marked } from "marked";
import type { DocRenderModel } from "../../../shared/doc-render.js";
import { HWP_STYLE, hwpHtmlBody } from "../../../shared/docview/hwp-html.js";
import { PPTX_STYLE, pptxHtmlBody } from "../../../shared/docview/pptx-html.js";
import { XLSX_STYLE, xlsxHtmlBody } from "../../../shared/docview/xlsx-html.js";

const MD_STYLE = `
.doc-md { font: 15px/1.6 -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; max-width: 780px; }
.doc-md h1 { font-size: 28px; margin: 0 0 12px; }
.doc-md h2 { font-size: 22px; margin: 24px 0 10px; }
.doc-md h3 { font-size: 18px; margin: 20px 0 8px; }
.doc-md p { margin: 10px 0; }
.doc-md ul, .doc-md ol { margin: 10px 0; padding-left: 24px; }
.doc-md code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
.doc-md pre { background: #f3f4f6; padding: 12px; border-radius: 8px; overflow: auto; }
.doc-md pre code { background: none; padding: 0; }
.doc-md blockquote { border-left: 3px solid #d1d5db; margin: 10px 0; padding: 2px 14px; color: #4b5563; }
.doc-md table { border-collapse: collapse; margin: 12px 0; }
.doc-md th, .doc-md td { border: 1px solid #e5e7eb; padding: 6px 10px; }
`;

/** The style and body for a model the app can draw itself (all but Word). */
export function modelStyleAndBody(
  model: DocRenderModel,
): { style: string; body: string } | null {
  if (model.kind === "md") {
    const html = marked.parse(model.text, { async: false }) as string;
    return { style: MD_STYLE, body: `<div class="doc-md">${html}</div>` };
  }
  if (model.kind === "xlsx") {
    return { style: XLSX_STYLE, body: xlsxHtmlBody(model.sheets) };
  }
  if (model.kind === "pptx") {
    return { style: PPTX_STYLE, body: pptxHtmlBody(model.slides) };
  }
  if (model.kind === "hwp") {
    return { style: (model.fontCss ?? "") + HWP_STYLE, body: hwpHtmlBody(model.pages) };
  }
  return null;
}
