/**
 * The charts drawn on each sheet of a workbook, read back from the file.
 *
 * A chart is a part of its own inside the package, tied to a sheet through a
 * drawing. ExcelJS does not surface them, so this walks that chain and reads
 * the numbers each chart cached — the same numbers the app wrote when it drew
 * the chart, so a chart it made draws back exactly.
 */
import JSZip from "jszip";
import type { XlsxChartView } from "../../../shared/doc-render.js";

function pts(cache: string | undefined): string[] {
  if (!cache) return [];
  const out: { idx: number; v: string }[] = [];
  const re = /<c:pt[^>]*idx="(\d+)"[^>]*>\s*<c:v>([\s\S]*?)<\/c:v>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cache)) !== null) {
    out.push({ idx: Number(m[1]), v: decode(m[2] ?? "") });
  }
  out.sort((a, b) => a.idx - b.idx);
  return out.map((p) => p.v);
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function firstBlock(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}[\\s\\S]*?</${tag}>`).exec(xml);
  return m?.[0];
}

function chartType(xml: string): XlsxChartView["type"] | null {
  if (xml.includes("<c:pieChart") || xml.includes("<c:pie3DChart")) return "pie";
  if (xml.includes("<c:lineChart")) return "line";
  // The app's own writer emits <c:colChart>; real files use <c:barChart> with a
  // direction. Read both.
  if (xml.includes("<c:colChart")) return "column";
  if (xml.includes("<c:barChart") || xml.includes("<c:bar3DChart")) {
    const dir = /<c:barDir[^>]*val="([^"]+)"/.exec(xml)?.[1];
    return dir === "bar" ? "bar" : "column";
  }
  return null;
}

function parseChart(xml: string): XlsxChartView | null {
  const type = chartType(xml);
  if (!type) return null;
  const title =
    /<c:title[\s\S]*?<a:t>([\s\S]*?)<\/a:t>/.exec(xml)?.[1] != null
      ? decode(/<c:title[\s\S]*?<a:t>([\s\S]*?)<\/a:t>/.exec(xml)![1] ?? "")
      : "";

  const serBlocks = xml.match(/<c:ser>[\s\S]*?<\/c:ser>/g) ?? [];
  let categories: string[] = [];
  const series = serBlocks.map((ser, i) => {
    const name =
      pts(firstBlock(firstBlock(ser, "c:tx") ?? "", "c:strCache"))[0] ??
      `Series ${i + 1}`;
    const cat = firstBlock(ser, "c:cat");
    const catCache =
      firstBlock(cat ?? "", "c:strCache") ?? firstBlock(cat ?? "", "c:numCache");
    const cats = pts(catCache);
    if (cats.length > categories.length) categories = cats;
    const valCache = firstBlock(firstBlock(ser, "c:val") ?? "", "c:numCache");
    const values = pts(valCache).map((v) => Number(v)).map((n) => (Number.isFinite(n) ? n : 0));
    return { name, values };
  });

  if (series.length === 0) return null;
  if (categories.length === 0) {
    const longest = Math.max(...series.map((s) => s.values.length), 0);
    categories = Array.from({ length: longest }, (_, i) => String(i + 1));
  }
  return { title, type, categories, series };
}

function relTarget(rels: string, relId: string): string | null {
  const esc = relId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`Id="${esc}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? null;
}

function normalizePath(from: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const base = from.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") base.pop();
    else if (part !== ".") base.push(part);
  }
  return base.join("/");
}

/** Sheet name → the charts drawn on it, for every sheet that has any. */
export async function readChartsBySheet(
  buf: Buffer,
): Promise<Map<string, XlsxChartView[]>> {
  const bySheet = new Map<string, XlsxChartView[]>();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    return bySheet;
  }

  const workbook = await zip.file("xl/workbook.xml")?.async("string");
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbook || !wbRels) return bySheet;

  const sheetTags = workbook.match(/<sheet[^>]*\/>/g) ?? [];
  for (const tag of sheetTags) {
    const name = /name="([^"]+)"/.exec(tag)?.[1];
    const rid = /r:id="([^"]+)"/.exec(tag)?.[1];
    if (!name || !rid) continue;
    const target = relTarget(wbRels, rid);
    if (!target) continue;
    const sheetPath = normalizePath("xl/workbook.xml", target);
    const charts = await chartsForSheet(zip, sheetPath);
    if (charts.length > 0) bySheet.set(decode(name), charts);
  }
  return bySheet;
}

async function chartsForSheet(zip: JSZip, sheetPath: string): Promise<XlsxChartView[]> {
  const relsPath = sheetPath.replace(/([^/]+)$/, "_rels/$1.rels");
  const rels = await zip.file(relsPath)?.async("string");
  if (!rels) return [];
  const drawingRel = /Target="([^"]*drawings\/[^"]+)"/.exec(rels)?.[1];
  if (!drawingRel) return [];
  const drawingPath = normalizePath(sheetPath, drawingRel);
  const drawingRelsPath = drawingPath.replace(/([^/]+)$/, "_rels/$1.rels");
  const drawingRels = await zip.file(drawingRelsPath)?.async("string");
  if (!drawingRels) return [];

  const out: XlsxChartView[] = [];
  const chartTargets = drawingRels.match(/Target="([^"]*charts\/[^"]+)"/g) ?? [];
  for (const raw of chartTargets) {
    const target = /Target="([^"]+)"/.exec(raw)?.[1];
    if (!target) continue;
    const chartPath = normalizePath(drawingPath, target);
    const chartXml = await zip.file(chartPath)?.async("string");
    if (!chartXml) continue;
    const chart = parseChart(chartXml);
    if (chart) out.push(chart);
  }
  return out;
}
