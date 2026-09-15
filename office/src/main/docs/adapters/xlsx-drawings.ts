/**
 * Keep what is drawn on a sheet across an edit.
 *
 * The spreadsheet writer models cells, not pictures: it reads the parts it
 * understands and writes a fresh package, so a chart drawn on a sheet is gone
 * the next time anything else on that sheet is written. Lifting those parts
 * out of the old package and putting them back into the new one keeps the
 * chart attached to the sheet it was drawn on, and refreshing the numbers it
 * carries keeps it telling the truth about the cells it came from.
 */
import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";

const DRAWING_PREFIXES = ["xl/charts/", "xl/drawings/"];

/** A sheet and the drawing hung off it. */
export interface SheetDrawingLink {
  sheetPath: string;
  target: string;
}

export interface PreservedDrawings {
  parts: Record<string, Buffer>;
  overrides: string[];
  links: SheetDrawingLink[];
}

export function isDrawingPart(path: string): boolean {
  return DRAWING_PREFIXES.some((p) => path.startsWith(p));
}

function relTarget(rels: string, relId: string): string | null {
  const escaped = relId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`Id="${escaped}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? null
  );
}

/** Everything drawn on the sheets of a workbook, or null when there is none. */
export async function collectDrawings(
  xlsxPath: string,
): Promise<PreservedDrawings | null> {
  let buf: Buffer;
  try {
    buf = await readFile(xlsxPath);
  } catch {
    return null;
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    return null;
  }

  const parts: Record<string, Buffer> = {};
  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (!entry || entry.dir || !isDrawingPart(path)) continue;
    parts[path] = await entry.async("nodebuffer");
  }
  if (Object.keys(parts).length === 0) return null;

  const contentTypes =
    (await zip.file("[Content_Types].xml")?.async("string")) ?? "";
  const overrides = (contentTypes.match(/<Override[^>]*\/>/g) ?? []).filter(
    (o) => /PartName="\/xl\/(charts|drawings)\//.test(o),
  );

  const links: SheetDrawingLink[] = [];
  for (const path of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path)) continue;
    const sheetXml = (await zip.file(path)?.async("string")) ?? "";
    const relId = /<drawing[^>]*r:id="([^"]+)"/.exec(sheetXml)?.[1];
    if (!relId) continue;
    const relsPath = path.replace("worksheets/", "worksheets/_rels/") + ".rels";
    const rels = (await zip.file(relsPath)?.async("string")) ?? "";
    const target = relTarget(rels, relId);
    if (target) links.push({ sheetPath: path, target });
  }

  return { parts, overrides, links };
}

/**
 * Put the drawings back into a freshly written package.
 *
 * Parts named in `skip` are left alone: a chart injected during this save is
 * the current one, and the copy carried over from before it is stale.
 */
export async function restoreDrawings(
  xlsxPath: string,
  saved: PreservedDrawings,
  opts: {
    skip?: string[];
    refreshChart?: (chartXml: string) => string;
  } = {},
): Promise<void> {
  const skip = new Set(opts.skip ?? []);
  const buf = await readFile(xlsxPath);
  const zip = await JSZip.loadAsync(buf);

  let wrote = false;
  for (const [path, content] of Object.entries(saved.parts)) {
    if (skip.has(path) || zip.file(path)) continue;
    const isChart = path.startsWith("xl/charts/chart") && path.endsWith(".xml");
    if (isChart && opts.refreshChart) {
      zip.file(path, opts.refreshChart(content.toString("utf8")));
    } else {
      zip.file(path, content);
    }
    wrote = true;
  }
  if (!wrote) return;

  for (const link of saved.links) {
    const sheetXml = await zip.file(link.sheetPath)?.async("string");
    if (!sheetXml || sheetXml.includes("<drawing ")) continue;
    const relsPath =
      link.sheetPath.replace("worksheets/", "worksheets/_rels/") + ".rels";
    let rels =
      (await zip.file(relsPath)?.async("string")) ??
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const relId = "rIdKeptDraw1";
    if (!rels.includes(link.target)) {
      rels = rels.replace(
        "</Relationships>",
        `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${link.target}"/></Relationships>`,
      );
    }
    zip.file(relsPath, rels);

    let next = sheetXml.replace(
      "</worksheet>",
      `<drawing r:id="${relId}"/></worksheet>`,
    );
    if (!next.includes("xmlns:r=")) {
      next = next.replace(
        "<worksheet",
        '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
      );
    }
    zip.file(link.sheetPath, next);
  }

  const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
  if (contentTypes) {
    const missing = saved.overrides.filter((o) => {
      const partName = /PartName="([^"]+)"/.exec(o)?.[1];
      return partName
        ? !contentTypes.includes(`PartName="${partName}"`)
        : false;
    });
    if (missing.length > 0) {
      zip.file(
        "[Content_Types].xml",
        contentTypes.replace("</Types>", `${missing.join("")}</Types>`),
      );
    }
  }

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  await writeFile(xlsxPath, out);
}

function cacheFor(
  values: (string | number | null)[],
  numeric: boolean,
): string {
  const pts = values
    .map((v, i) =>
      v == null || v === ""
        ? ""
        : `<c:pt idx="${i}"><c:v>${String(v)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</c:v></c:pt>`,
    )
    .join("");
  return numeric
    ? `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache>`
    : `<c:strCache><c:ptCount val="${values.length}"/>${pts}</c:strCache>`;
}

/** Split `Sheet1!$B$2:$B$5` into the sheet it names and the range on it. */
export function splitChartRef(
  formula: string,
): { sheet: string; range: string } | null {
  const at = formula.lastIndexOf("!");
  if (at < 0) return null;
  const sheet = formula.slice(0, at).replace(/^'|'$/g, "").replace(/''/g, "'");
  const range = formula.slice(at + 1);
  if (!sheet || !range) return null;
  return { sheet, range };
}

/**
 * Re-read the cells a chart points at so the numbers it carries match them.
 *
 * A chart states its values twice: once as a reference and once as a cached
 * copy, and every reader that draws the chart without recalculating the
 * workbook believes the copy. After an edit the copy is what the previous
 * numbers were.
 */
export function refreshChartCaches(
  chartXml: string,
  lookup: (sheet: string, range: string) => (string | number | null)[],
): string {
  return chartXml.replace(
    /<c:(numRef|strRef)>([\s\S]*?)<\/c:\1>/g,
    (whole, kind: string, body: string) => {
      const formula = /<c:f>([\s\S]*?)<\/c:f>/.exec(body)?.[1];
      if (!formula) return whole;
      const ref = splitChartRef(formula);
      if (!ref) return whole;
      let cells: (string | number | null)[];
      try {
        cells = lookup(ref.sheet, ref.range);
      } catch {
        return whole;
      }
      if (cells.length === 0) return whole;
      const numeric = kind === "numRef";
      const cache = cacheFor(cells, numeric);
      const tag = numeric ? "numCache" : "strCache";
      const next = new RegExp(`<c:${tag}>[\\s\\S]*?</c:${tag}>`).test(body)
        ? body.replace(new RegExp(`<c:${tag}>[\\s\\S]*?</c:${tag}>`), cache)
        : `${body}${cache}`;
      return `<c:${kind}>${next}</c:${kind}>`;
    },
  );
}
