/**
 * A spreadsheet drawn as a grid, the way a person expects to see one.
 *
 * The cells become a table with their fills and alignment, and each chart on
 * the sheet is drawn beneath it from the numbers it carries. This is a view,
 * not the editor: it is what the file says, laid out to be read.
 */
import type { XlsxCellView, XlsxSheetView } from "../doc-render.js";
import { chartSvg } from "./chart-svg.js";
import { escapeHtml } from "./escape.js";

/** Character width to pixels: Excel's default column is ~8.43 chars ≈ 64px. */
function colPx(chars: number): number {
  return Math.round(chars * 7 + 8);
}

function cellStyle(cell: XlsxCellView): string {
  const parts: string[] = [];
  if (cell.fill) parts.push(`background:${cell.fill}`);
  if (cell.color) parts.push(`color:${cell.color}`);
  if (cell.bold) parts.push("font-weight:600");
  if (cell.italic) parts.push("font-style:italic");
  parts.push(`text-align:${cell.align ?? (cell.numeric ? "right" : "left")}`);
  return parts.join(";");
}

function cellHtml(cell: XlsxCellView): string {
  if (cell.covered) return "";
  const span =
    (cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "") +
    (cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "");
  return `<td style="${cellStyle(cell)}"${span}>${escapeHtml(cell.text)}</td>`;
}

function sheetHtml(sheet: XlsxSheetView): string {
  const cols = sheet.columnWidths
    .map((w) => `<col style="width:${colPx(w)}px"/>`)
    .join("");
  const rows = sheet.rows
    .map((row) => {
      const height = row.heightPt ? ` style="height:${Math.round(row.heightPt * 1.33)}px"` : "";
      return `<tr${height}>${row.cells.map(cellHtml).join("")}</tr>`;
    })
    .join("");
  const charts = sheet.charts
    .map((chart) => `<figure class="chart">${chartSvg(chart)}</figure>`)
    .join("");
  const tab = sheet.name
    ? `<div class="sheet-name">${escapeHtml(sheet.name)}</div>`
    : "";
  return `<section class="sheet">${tab}<table><colgroup>${cols}</colgroup><tbody>${rows}</tbody></table>${charts}</section>`;
}

export const XLSX_STYLE = `
.doc-xlsx { font: 13px -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; }
.doc-xlsx .sheet { margin: 0 0 28px; }
.doc-xlsx .sheet-name { font-weight: 600; font-size: 12px; color: #6b7280; margin: 0 0 6px; }
.doc-xlsx table { border-collapse: collapse; table-layout: fixed; }
.doc-xlsx td { border: 1px solid #e5e7eb; padding: 3px 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: middle; }
.doc-xlsx .chart { margin: 18px 0 0; }
.doc-xlsx .chart svg { max-width: 100%; height: auto; }
`;

export function xlsxHtmlBody(sheets: XlsxSheetView[]): string {
  if (sheets.length === 0) {
    return `<div class="doc-xlsx"><p style="color:#6b7280">This spreadsheet is empty.</p></div>`;
  }
  return `<div class="doc-xlsx">${sheets.map(sheetHtml).join("")}</div>`;
}
