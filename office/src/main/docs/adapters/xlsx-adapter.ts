import { randomUUID } from "node:crypto";
import { copyFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import ExcelJS from "exceljs";
import { injectBarChart } from "./xlsx-chart.js";
import {
  collectDrawings,
  refreshChartCaches,
  restoreDrawings,
} from "./xlsx-drawings.js";
import {
  cellAddr,
  colToLetter,
  hashDocOps,
  parseA1,
  summarizeSheetCells,
} from "../util.js";
import type {
  ApplyResult,
  DocumentAdapter,
  DocumentOutline,
  DocOp,
  SheetDiff,
  SheetOp,
} from "../types.js";

function isSheetOp(op: DocOp): op is SheetOp {
  return (
    op.op === "writeRange" ||
    op.op === "addFormula" ||
    op.op === "sort" ||
    op.op === "insertRows" ||
    op.op === "chart"
  );
}

function cellDisplay(v: ExcelJS.CellValue): string | number | boolean | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return v;
  if (typeof v === "object" && v && "result" in v) {
    const r = (v as ExcelJS.CellFormulaValue).result;
    if (
      typeof r === "string" ||
      typeof r === "number" ||
      typeof r === "boolean"
    )
      return r;
    return String(r ?? "");
  }
  if (typeof v === "object" && v && "text" in v) {
    return String(
      ((v as unknown as ExcelJS.CellRichTextValue).richText ?? [])
        .map((t) => t.text)
        .join("") ||
        (v as { text?: string }).text ||
        "",
    );
  }
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export class XlsxAdapter implements DocumentAdapter {
  readonly format = "xlsx" as const;
  path = "";
  private wb: ExcelJS.Workbook | null = null;
  private dirty = false;
  private pendingCharts: Array<Extract<SheetOp, { op: "chart" }>> = [];

  async open(path: string): Promise<void> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    this.wb = wb;
    this.path = path;
    this.dirty = false;
    this.pendingCharts = [];
  }

  async outline(): Promise<DocumentOutline> {
    if (!this.wb) throw new Error("Workbook not open");
    const sheets = this.wb.worksheets.map((ws) => {
      const dims = ws.dimensions;
      return {
        name: ws.name,
        rows: dims?.bottom ?? 0,
        cols: dims?.right ?? 0,
      };
    });
    return {
      format: "xlsx",
      path: this.path,
      title: basename(this.path),
      sheets,
    };
  }

  async snapshot(destPath: string): Promise<void> {
    await copyFile(this.path, destPath);
  }

  async readRange(args: Record<string, unknown>): Promise<unknown> {
    if (!this.wb) throw new Error("Workbook not open");
    const sheetName = String(args.sheet ?? this.wb.worksheets[0]?.name ?? "");
    const range = String(args.range ?? "A1");
    const ws = this.wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
    const [a, b] = range.split(":");
    const start = parseA1(a!);
    const end = parseA1(b || a!);
    const rows: Array<Array<string | number | boolean | null>> = [];
    for (let r = start.row; r <= end.row; r += 1) {
      const row: Array<string | number | boolean | null> = [];
      for (let c = start.col; c <= end.col; c += 1) {
        row.push(cellDisplay(ws.getCell(r, c).value));
      }
      rows.push(row);
    }
    return { sheet: sheetName, range, values: rows };
  }

  async search(query: string): Promise<Array<{ loc: string; text: string }>> {
    if (!this.wb) throw new Error("Workbook not open");
    const q = query.toLowerCase();
    const hits: Array<{ loc: string; text: string }> = [];
    for (const ws of this.wb.worksheets) {
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const text = String(cellDisplay(cell.value) ?? "");
          if (text.toLowerCase().includes(q)) {
            hits.push({
              loc: `${ws.name}!${cellAddr(colNumber, rowNumber)}`,
              text: text.slice(0, 200),
            });
          }
        });
      });
    }
    return hits.slice(0, 100);
  }

  private collectDiff(ops: SheetOp[]): SheetDiff {
    if (!this.wb) throw new Error("Workbook not open");
    const changes: Array<{ addr: string; before: unknown; after: unknown }> =
      [];
    let sheetName = this.wb.worksheets[0]?.name ?? "Sheet1";

    for (const op of ops) {
      if (op.op === "writeRange") {
        sheetName = op.sheet;
        const ws = this.wb.getWorksheet(op.sheet);
        if (!ws) throw new Error(`Sheet not found: ${op.sheet}`);
        const start = parseA1(op.start);
        for (let ri = 0; ri < op.values.length; ri += 1) {
          const rowVals = op.values[ri] ?? [];
          for (let ci = 0; ci < rowVals.length; ci += 1) {
            const addr = `${op.sheet}!${cellAddr(start.col + ci, start.row + ri)}`;
            const cell = ws.getCell(start.row + ri, start.col + ci);
            const before = cellDisplay(cell.value);
            const after = rowVals[ci] ?? null;
            if (String(before) !== String(after)) {
              changes.push({ addr, before, after });
            }
          }
        }
      } else if (op.op === "addFormula") {
        sheetName = op.sheet;
        const ws = this.wb.getWorksheet(op.sheet);
        if (!ws) throw new Error(`Sheet not found: ${op.sheet}`);
        const { row, col } = parseA1(op.cell);
        const cell = ws.getCell(row, col);
        changes.push({
          addr: `${op.sheet}!${op.cell}`,
          before: cellDisplay(cell.value),
          after: `=${op.formula.replace(/^=/, "")}`,
        });
      } else if (op.op === "sort") {
        sheetName = op.sheet;
        changes.push({
          addr: `${op.sheet}!${op.range}`,
          before: "(unsorted)",
          after: `sorted by col ${op.column} ${op.ascending === false ? "desc" : "asc"}`,
        });
      } else if (op.op === "insertRows") {
        sheetName = op.sheet;
        changes.push({
          addr: `${op.sheet}!R${op.startRow}`,
          before: null,
          after: `+${op.count} row(s)`,
        });
      } else if (op.op === "chart") {
        sheetName = op.sheet;
        changes.push({
          addr: `${op.sheet}!chart`,
          before: null,
          after: `${op.type} chart on ${op.dataRange}`,
        });
      }
    }

    const summarized = summarizeSheetCells(changes);
    return {
      kind: "sheet",
      sheet: sheetName,
      cells: summarized.cells,
      truncated: summarized.truncated,
      ...(summarized.summaryRanges
        ? { summaryRanges: summarized.summaryRanges }
        : {}),
    };
  }

  private applySheetOps(ops: SheetOp[]): void {
    if (!this.wb) throw new Error("Workbook not open");
    for (const op of ops) {
      if (op.op === "writeRange") {
        const ws = this.wb.getWorksheet(op.sheet);
        if (!ws) throw new Error(`Sheet not found: ${op.sheet}`);
        const start = parseA1(op.start);
        for (let ri = 0; ri < op.values.length; ri += 1) {
          const rowVals = op.values[ri] ?? [];
          for (let ci = 0; ci < rowVals.length; ci += 1) {
            ws.getCell(start.row + ri, start.col + ci).value = rowVals[
              ci
            ] as ExcelJS.CellValue;
          }
        }
      } else if (op.op === "addFormula") {
        const ws = this.wb.getWorksheet(op.sheet);
        if (!ws) throw new Error(`Sheet not found: ${op.sheet}`);
        const { row, col } = parseA1(op.cell);
        ws.getCell(row, col).value = {
          formula: op.formula.replace(/^=/, ""),
        };
      } else if (op.op === "sort") {
        const ws = this.wb.getWorksheet(op.sheet);
        if (!ws) throw new Error(`Sheet not found: ${op.sheet}`);
        const [a, b] = op.range.split(":");
        const start = parseA1(a!);
        const end = parseA1(b || a!);
        const matrix: ExcelJS.CellValue[][] = [];
        for (let r = start.row; r <= end.row; r += 1) {
          const row: ExcelJS.CellValue[] = [];
          for (let c = start.col; c <= end.col; c += 1) {
            row.push(ws.getCell(r, c).value);
          }
          matrix.push(row);
        }
        const colIdx = Math.max(0, op.column - 1);
        const asc = op.ascending !== false;
        matrix.sort((left, right) => {
          const lv = left[colIdx];
          const rv = right[colIdx];
          const ls = String(cellDisplay(lv) ?? "");
          const rs = String(cellDisplay(rv) ?? "");
          const cmp = ls.localeCompare(rs, undefined, { numeric: true });
          return asc ? cmp : -cmp;
        });
        for (let r = 0; r < matrix.length; r += 1) {
          for (let c = 0; c < (matrix[r]?.length ?? 0); c += 1) {
            ws.getCell(start.row + r, start.col + c).value = matrix[r]![c]!;
          }
        }
      } else if (op.op === "insertRows") {
        const ws = this.wb.getWorksheet(op.sheet);
        if (!ws) throw new Error(`Sheet not found: ${op.sheet}`);
        // ExcelJS spliceRows: start, countDelete, ...rows
        const blanks = Array.from({ length: op.count }, () => []);
        ws.spliceRows(op.startRow, 0, ...blanks);
      } else if (op.op === "chart") {
        this.pendingCharts.push(op);
      }
    }
    this.dirty = true;
  }

  async previewOps(ops: DocOp[]): Promise<ApplyResult> {
    const sheetOps = ops.filter(isSheetOp);
    const diff = this.collectDiff(sheetOps);
    return { diff, opHash: hashDocOps("xlsx", sheetOps) };
  }

  async applyOps(ops: DocOp[]): Promise<ApplyResult> {
    const sheetOps = ops.filter(isSheetOp);
    const preview = await this.previewOps(sheetOps);
    this.applySheetOps(sheetOps);
    return preview;
  }

  async save(): Promise<void> {
    if (!this.wb) throw new Error("Workbook not open");
    const tmp = join(
      dirname(this.path),
      `.${basename(this.path)}.tmp-${randomUUID().slice(0, 8)}.xlsx`,
    );
    const charts = [...this.pendingCharts];
    this.pendingCharts = [];
    // Taken before the write, because the write is what loses them.
    const drawings = await collectDrawings(this.path);
    await this.wb.xlsx.writeFile(tmp);
    await rename(tmp, this.path);
    for (const ch of charts) {
      // The numbers and their labels travel with the chart. A chart that only
      // points at a range renders as empty axes anywhere the reference is not
      // resolved for it, which is what a spreadsheet program does on open and
      // a converter does not.
      const series = this.readSeries(ch.sheet, ch.dataRange);
      await injectBarChart({
        xlsxPath: this.path,
        sheetName: ch.sheet,
        dataRange: ch.dataRange,
        ...(ch.title != null ? { title: ch.title } : {}),
        chartType: ch.type === "bar" ? "bar" : "column",
        values: series.values,
        categories: series.categories,
        seriesName: series.name,
        valueRef: series.valueRef,
        categoryRef: series.categoryRef,
      });
    }
    if (drawings) {
      await restoreDrawings(this.path, drawings, {
        // A chart injected just now supersedes the copy kept from before it.
        skip:
          charts.length > 0
            ? ["xl/charts/chart1.xml", "xl/drawings/drawing1.xml"]
            : [],
        refreshChart: (xml) =>
          refreshChartCaches(xml, (sheet, range) =>
            this.readRefCells(sheet, range),
          ),
      });
    }
    // Reload so subsequent ops see chart-injected package
    if (charts.length > 0 || drawings) {
      await this.open(this.path);
    }
    this.dirty = false;
  }

  /** The cells a chart reference names, in the order it names them. */
  private readRefCells(
    sheetName: string,
    range: string,
  ): (string | number | null)[] {
    if (!this.wb) return [];
    const ws = this.wb.getWorksheet(sheetName);
    if (!ws) return [];
    const plain = range.replace(/\$/g, "");
    const [startRef, endRef] = plain.split(":");
    if (!startRef) return [];
    const from = parseA1(startRef);
    const to = parseA1(endRef || startRef);
    const out: (string | number | null)[] = [];
    for (
      let row = Math.min(from.row, to.row);
      row <= Math.max(from.row, to.row);
      row += 1
    ) {
      for (
        let col = Math.min(from.col, to.col);
        col <= Math.max(from.col, to.col);
        col += 1
      ) {
        const raw = cellDisplay(ws.getCell(cellAddr(col, row)).value);
        out.push(typeof raw === "boolean" ? String(raw) : raw);
      }
    }
    return out;
  }

  /**
   * The numbers a chart is about, with the labels beside them.
   *
   * A range can be given either way round: just the numbers ("B2:B5"), or the
   * whole table including the labels and the header ("A1:B5"), which is how a
   * person describes a table and therefore what a model asks for. When the
   * range spans more than one column the rightmost holds the numbers and the
   * leftmost holds their names; when it is one column the names come from the
   * column beside it. A first row that is not a number is the header, and it
   * names the series rather than being plotted.
   */
  private readSeries(
    sheetName: string,
    range: string,
  ): {
    values: number[];
    categories: string[];
    name: string;
    valueRef: string;
    categoryRef: string;
  } {
    const empty = {
      values: [] as number[],
      categories: [] as string[],
      name: "",
      valueRef: "",
      categoryRef: "",
    };
    if (!this.wb) return empty;
    const ws = this.wb.getWorksheet(sheetName);
    if (!ws) return empty;
    const [startRef, endRef] = range.split(":");
    if (!startRef || !endRef) return empty;
    let from: { col: number; row: number };
    let to: { col: number; row: number };
    try {
      from = parseA1(startRef);
      to = parseA1(endRef);
    } catch {
      return empty;
    }

    const valueCol = Math.max(from.col, to.col);
    const labelCol =
      from.col === to.col ? from.col - 1 : Math.min(from.col, to.col);
    const firstRow = Math.min(from.row, to.row);
    const lastRow = Math.max(from.row, to.row);

    const values: number[] = [];
    const categories: string[] = [];
    let name = "";
    let firstDataRow = 0;
    let lastDataRow = 0;
    for (let row = firstRow; row <= lastRow; row += 1) {
      const raw = ws.getCell(cellAddr(valueCol, row)).value;
      const numeric = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(numeric) || raw === null || raw === "") {
        if (!name && typeof raw === "string" && raw.trim()) name = raw.trim();
        continue;
      }
      values.push(numeric);
      if (!firstDataRow) firstDataRow = row;
      lastDataRow = row;
      const label =
        labelCol >= 1 ? ws.getCell(cellAddr(labelCol, row)).value : null;
      categories.push(
        label == null || label === "" ? String(row) : String(label),
      );
    }

    // The reference has to name the numbers alone. Left pointing at the range
    // as given — labels, header and all — a reader that resolves it finds text
    // where it expects values and plots nothing, cache or no cache.
    const span = (col: number): string =>
      firstDataRow
        ? `$${colToLetter(col)}$${firstDataRow}:$${colToLetter(col)}$${lastDataRow}`
        : "";
    return {
      values,
      categories,
      name,
      valueRef: span(valueCol),
      categoryRef: labelCol >= 1 ? span(labelCol) : "",
    };
  }

  async close(): Promise<void> {
    this.wb = null;
    this.path = "";
    this.dirty = false;
    this.pendingCharts = [];
  }

  /** Ensure a worksheet exists (flows that create summary sheets). */
  ensureSheet(name: string): void {
    if (!this.wb) throw new Error("Workbook not open");
    if (!this.wb.getWorksheet(name)) {
      this.wb.addWorksheet(name);
    }
  }
}

/** Ensure a worksheet exists (used by flows that create summary sheets). */
export async function ensureSheet(
  adapter: XlsxAdapter,
  name: string,
): Promise<void> {
  adapter.ensureSheet(name);
}

export async function writeAtomicBuffer(
  path: string,
  buf: Buffer,
): Promise<void> {
  const tmp = `${path}.tmp-${randomUUID().slice(0, 8)}`;
  await writeFile(tmp, buf);
  await rename(tmp, path);
}
