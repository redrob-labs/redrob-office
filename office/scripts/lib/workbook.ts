/**
 * Reading a workbook back the way it was written.
 *
 * sheet.writeRange stores every cell as a shared string — company names, job
 * titles, and the numbers too ("8", "5", a skill count of "3"). A reader that
 * treated only bare numeric cells as numbers found nothing to check, so the
 * benchmark scored correct workbooks as empty. Everything here is text first,
 * and a number is the leading number of a cell's text, located by the column's
 * name rather than its position — a title two columns over ("…Video 360…") is
 * exactly the stray number a positional read picks up by mistake.
 */
import { readFileSync } from "node:fs";
import JSZip from "jszip";

export interface SheetInfo {
  name: string;
  dataRows: number;
  header: string[];
  rows: string[][];
}

export interface WorkbookInfo {
  charts: number;
  sheets: SheetInfo[];
  /** The file exists under a workbook's name but is not one. */
  unreadable?: boolean;
}

/**
 * The number a cell of a numeric column stands for.
 *
 * "8" -> 8, "5+ years" -> 5, and a range "3-5" -> its midpoint 4, since that is
 * what a person averaging the column would use — reading the low end of every
 * range instead pulls the average a whole year down. A title that merely
 * contains a number ("Video 360 Inventory") is not a number.
 */
function cellNumber(text: string): number {
  const trimmed = text.trim();
  const range = /^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/.exec(trimmed);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const hit = /-?\d+(?:\.\d+)?/.exec(trimmed);
  return hit && trimmed.startsWith(hit[0]) ? Number(hit[0]) : Number.NaN;
}

export async function inspectWorkbook(path: string): Promise<WorkbookInfo> {
  // A model that writes CSV text into a file called .xlsx produces something
  // JSZip cannot open, and the throw took a whole ten-run batch down with it.
  // A file that is not a workbook is a result to record, not a crash.
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(readFileSync(path));
  } catch {
    return { charts: 0, sheets: [], unreadable: true };
  }
  const charts = Object.keys(zip.files).filter((name) =>
    /^xl\/charts\/chart\d+\.xml$/.test(name),
  ).length;

  const shared: string[] = [];
  const sharedXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  for (const item of sharedXml.match(/<si\b[\s\S]*?<\/si>/g) ?? []) {
    shared.push(
      (item.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
        .map((t) => t.replace(/<[^>]+>/g, ""))
        .join("")
        .trim(),
    );
  }

  const workbookXml = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const relsXml = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const target = new Map<string, string>();
  for (const rel of relsXml.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = /Id="([^"]+)"/.exec(rel)?.[1];
    const to = /Target="([^"]+)"/.exec(rel)?.[1];
    if (id && to) target.set(id, to.replace(/^\/?xl\//, "").replace(/^\.\//, ""));
  }

  const cellText = (cell: string): string => {
    const raw = /<v>([^<]*)<\/v>/.exec(cell)?.[1] ?? "";
    if (/t="s"/.test(cell)) return (shared[Number(raw)] ?? "").trim();
    if (/t="(?:inlineStr|str)"/.test(cell)) {
      return (/<t[^>]*>([\s\S]*?)<\/t>/.exec(cell)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
    }
    return raw.trim();
  };

  const sheets: SheetInfo[] = [];
  const sheetEntries = workbookXml.match(/<sheet\b[^>]*\/?>/g) ?? [];
  for (const entry of sheetEntries) {
    const name = /name="([^"]*)"/.exec(entry)?.[1] ?? "";
    const rid = /r:id="([^"]+)"/.exec(entry)?.[1] ?? "";
    const part = target.get(rid);
    const xml = part ? ((await zip.file(`xl/${part}`)?.async("string")) ?? "") : "";
    const grid = (xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []).map((row) =>
      (row.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) ?? []).map(cellText),
    );
    const filled = grid.filter((row) => row.filter((cell) => cell !== "").length >= 2).length;
    const [header = [], ...rows] = grid;
    // The header is not one of the rows being counted.
    sheets.push({ name, dataRows: Math.max(0, filled - 1), header, rows });
  }
  return { charts, sheets };
}

/**
 * The numbers under a column named like `want`.
 *
 * Header-located, so the model's choice of column order does not matter and a
 * stray number in another column is never mistaken for the value wanted.
 */
export function columnNumbers(sheet: SheetInfo, want: RegExp): number[] {
  const index = sheet.header.findIndex((cell) => want.test(cell));
  if (index < 0) return [];
  return sheet.rows
    .map((row) => cellNumber(row[index] ?? ""))
    .filter((value) => Number.isFinite(value));
}

/** Rows as [label, count] under a named pair of columns — the Skills tally. */
export function labelledCounts(
  sheet: SheetInfo,
  labelWant: RegExp,
  countWant: RegExp,
): Array<{ label: string; value: number }> {
  const labelAt = sheet.header.findIndex((cell) => labelWant.test(cell));
  const countAt = sheet.header.findIndex((cell) => countWant.test(cell));
  if (labelAt < 0 || countAt < 0) return [];
  return sheet.rows
    .map((row) => ({ label: (row[labelAt] ?? "").trim(), value: cellNumber(row[countAt] ?? "") }))
    .filter((entry) => entry.label.length > 0 && Number.isFinite(entry.value));
}
