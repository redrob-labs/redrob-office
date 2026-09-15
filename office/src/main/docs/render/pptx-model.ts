/**
 * A deck read into slides in the order they are shown: each a title and the
 * lines beneath it, with the bold and italics the file asked for.
 *
 * Enough of a slide to read it back. The shapes a slide is made of are walked
 * in order; the one marked the title becomes the heading and the rest become
 * the body.
 */
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import type {
  PptxParagraphView,
  PptxSlideView,
  PptxTextRun,
} from "../../../shared/doc-render.js";

const DEFAULT_W = 12192000;
const DEFAULT_H = 6858000;

function decode(s: string): string {
  return s
    .replace(/<a:br\s*\/>/g, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
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

function runsFrom(paraXml: string): PptxTextRun[] {
  const runs: PptxTextRun[] = [];
  const re = /<a:r>([\s\S]*?)<\/a:r>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paraXml)) !== null) {
    const runXml = m[1] ?? "";
    const text = decode(/<a:t>([\s\S]*?)<\/a:t>/.exec(runXml)?.[1] ?? "");
    if (!text) continue;
    const rPr = /<a:rPr[^>]*>/.exec(runXml)?.[0] ?? "";
    const run: PptxTextRun = { text };
    if (/\bb="1"/.test(rPr)) run.bold = true;
    if (/\bi="1"/.test(rPr)) run.italic = true;
    runs.push(run);
  }
  // A shape can hold text in a:fld (slide numbers) or bare a:t too; fall back.
  if (runs.length === 0) {
    const text = decode(
      (paraXml.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [])
        .map((t) => /<a:t>([\s\S]*?)<\/a:t>/.exec(t)?.[1] ?? "")
        .join(""),
    );
    if (text.trim()) runs.push({ text });
  }
  return runs;
}

function paragraphs(txBody: string): PptxParagraphView[] {
  const out: PptxParagraphView[] = [];
  const re = /<a:p>([\s\S]*?)<\/a:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txBody)) !== null) {
    const paraXml = m[1] ?? "";
    const runs = runsFrom(paraXml);
    if (runs.length === 0) continue;
    const pPr = /<a:pPr[^>]*>/.exec(paraXml)?.[0] ?? "";
    const level = Number(/\blvl="(\d+)"/.exec(pPr)?.[1] ?? "0");
    const bullet =
      (/<a:buChar/.test(paraXml) || /<a:buAutoNum/.test(paraXml)) &&
      !/<a:buNone/.test(paraXml);
    out.push({ runs, level, bullet });
  }
  return out;
}

function shapeText(shapeXml: string): PptxParagraphView[] {
  const txBody = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(shapeXml)?.[1];
  return txBody ? paragraphs(txBody) : [];
}

function isTitle(shapeXml: string): boolean {
  const ph = /<p:ph[^>]*type="([^"]+)"/.exec(shapeXml)?.[1];
  return ph === "title" || ph === "ctrTitle";
}

function paraText(para: PptxParagraphView): string {
  return para.runs.map((r) => r.text).join("");
}

function slideFromXml(xml: string): PptxSlideView {
  const shapes = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
  let title = "";
  const body: PptxParagraphView[] = [];
  for (const shape of shapes) {
    const paras = shapeText(shape);
    if (paras.length === 0) continue;
    if (!title && isTitle(shape)) {
      title = paras.map(paraText).join(" ").trim();
      continue;
    }
    body.push(...paras);
  }
  // A slide with no marked title: let the first line stand in as one.
  if (!title && body.length > 0) {
    title = paraText(body[0]!).trim();
    body.shift();
  }
  return { title, body };
}

async function slideOrder(zip: JSZip): Promise<string[]> {
  const pres = await zip.file("ppt/presentation.xml")?.async("string");
  const rels = await zip
    .file("ppt/_rels/presentation.xml.rels")
    ?.async("string");
  if (!pres || !rels) return [];
  const ids = (pres.match(/<p:sldId[^>]*r:id="([^"]+)"/g) ?? [])
    .map((tag) => /r:id="([^"]+)"/.exec(tag)?.[1])
    .filter((v): v is string => Boolean(v));
  const paths: string[] = [];
  for (const id of ids) {
    const target = relTarget(rels, id);
    if (target) paths.push(normalizePath("ppt/presentation.xml", target));
  }
  return paths;
}

function slideSize(pres: string | undefined): { widthEmu: number; heightEmu: number } {
  const m = /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres ?? "");
  return {
    widthEmu: m ? Number(m[1]) : DEFAULT_W,
    heightEmu: m ? Number(m[2]) : DEFAULT_H,
  };
}

export async function readPptxSlides(
  path: string,
): Promise<{ slides: PptxSlideView[]; widthEmu: number; heightEmu: number }> {
  const buf = await readFile(path);
  const zip = await JSZip.loadAsync(buf);
  const pres = await zip.file("ppt/presentation.xml")?.async("string");
  const order = await slideOrder(zip);
  const slides: PptxSlideView[] = [];
  for (const slidePath of order) {
    const xml = await zip.file(slidePath)?.async("string");
    if (xml) slides.push(slideFromXml(xml));
  }
  return { slides, ...slideSize(pres) };
}
