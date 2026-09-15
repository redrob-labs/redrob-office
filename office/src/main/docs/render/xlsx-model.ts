/**
 * A workbook read into the grid the app draws: cells with their fills and
 * alignment, the merges that join them, and the charts drawn on each sheet.
 */
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import type {
  XlsxCellView,
  XlsxRowView,
  XlsxSheetView,
} from "../../../shared/doc-render.js";
import { readChartsBySheet } from "./xlsx-charts.js";

const DEFAULT_COL_WIDTH = 8.43;
const MAX_ROWS = 400;
const MAX_COLS = 40;

function argbToHex(argb: string | undefined): string | undefined {
  if (!argb) return undefined;
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return `#${hex.toLowerCase()}`;
}

function fillColor(cell: ExcelJS.Cell): string | undefined {
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  if (!fill || fill.type !== "pattern" || fill.pattern === "none") return undefined;
  const fg = fill.fgColor as { argb?: string } | undefined;
  return argbToHex(fg?.argb);
}

function align(cell: ExcelJS.Cell): XlsxCellView["align"] | undefined {
  const h = cell.alignment?.horizontal;
  if (h === "center" || h === "right" || h === "left") return h;
  return undefined;
}

function usedBounds(ws: ExcelJS.Worksheet): { rows: number; cols: number } {
  let rows = ws.actualRowCount || ws.rowCount || 0;
  let cols = ws.actualColumnCount || ws.columnCount || 0;
  rows = Math.min(Math.max(rows, 1), MAX_ROWS);
  cols = Math.min(Math.max(cols, 1), MAX_COLS);
  return { rows, cols };
}

function mergeSpans(ws: ExcelJS.Worksheet): {
  anchor: Map<string, { colSpan: number; rowSpan: number }>;
  covered: Set<string>;
} {
  const anchor = new Map<string, { colSpan: number; rowSpan: number }>();
  const covered = new Set<string>();
  const merges = (ws as unknown as { _merges?: Record<string, { model?: MergeModel } | MergeModel> })._merges;
  if (!merges) return { anchor, covered };
  for (const value of Object.values(merges)) {
    const m = (value as { model?: MergeModel }).model ?? (value as MergeModel);
    if (!m || m.top == null) continue;
    anchor.set(`${m.top}:${m.left}`, {
      colSpan: m.right - m.left + 1,
      rowSpan: m.bottom - m.top + 1,
    });
    for (let r = m.top; r <= m.bottom; r += 1) {
      for (let c = m.left; c <= m.right; c += 1) {
        if (r === m.top && c === m.left) continue;
        covered.add(`${r}:${c}`);
      }
    }
  }
  return { anchor, covered };
}

interface MergeModel {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

function cellView(
  cell: ExcelJS.Cell,
  key: string,
  anchor: Map<string, { colSpan: number; rowSpan: number }>,
  covered: Set<string>,
): XlsxCellView {
  if (covered.has(key)) return { text: "", covered: true };
  const text = cell.text ?? "";
  const numeric = typeof cell.value === "number";
  const font = cell.font ?? {};
  const span = anchor.get(key);
  const view: XlsxCellView = { text };
  if (numeric) view.numeric = true;
  if (font.bold) view.bold = true;
  if (font.italic) view.italic = true;
  const color = argbToHex((font.color as { argb?: string } | undefined)?.argb);
  if (color && color !== "#000000") view.color = color;
  const fill = fillColor(cell);
  if (fill) view.fill = fill;
  const a = align(cell);
  if (a) view.align = a;
  if (span) {
    if (span.colSpan > 1) view.colSpan = span.colSpan;
    if (span.rowSpan > 1) view.rowSpan = span.rowSpan;
  }
  return view;
}

export async function readXlsxSheets(path: string): Promise<XlsxSheetView[]> {
  const buf = await readFile(path);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const chartsBySheet = await readChartsBySheet(buf);

  const sheets: XlsxSheetView[] = [];
  wb.eachSheet((ws) => {
    const { rows, cols } = usedBounds(ws);
    const { anchor, covered } = mergeSpans(ws);
    const columnWidths: number[] = [];
    for (let c = 1; c <= cols; c += 1) {
      columnWidths.push(ws.getColumn(c).width ?? DEFAULT_COL_WIDTH);
    }
    const rowViews: XlsxRowView[] = [];
    for (let r = 1; r <= rows; r += 1) {
      const row = ws.getRow(r);
      const cells: XlsxCellView[] = [];
      for (let c = 1; c <= cols; c += 1) {
        cells.push(cellView(row.getCell(c), `${r}:${c}`, anchor, covered));
      }
      const view: XlsxRowView = { cells };
      if (row.height) view.heightPt = row.height;
      rowViews.push(view);
    }
    sheets.push({
      name: ws.name,
      columnWidths,
      rows: rowViews,
      charts: chartsBySheet.get(ws.name) ?? [],
    });
  });
  return sheets;
}
