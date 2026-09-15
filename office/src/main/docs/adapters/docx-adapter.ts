import { randomUUID } from "node:crypto";
import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import JSZip from "jszip";
import { hashDocOps } from "../util.js";
import type {
  ApplyResult,
  DocumentAdapter,
  DocumentOutline,
  DocOp,
  DocParagraphDiff,
  WordOp,
} from "../types.js";

function isWordOp(op: DocOp): op is WordOp {
  return (
    op.op === "findReplace" ||
    op.op === "insertSection" ||
    op.op === "applyStyle" ||
    op.op === "setParagraphs"
  );
}

function extractParagraphs(documentXml: string): string[] {
  const paras: string[] = [];
  const re = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(documentXml)) !== null) {
    paras.push(m[0]);
  }
  return paras;
}

function paragraphText(pXml: string): string {
  const texts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pXml)) !== null) {
    texts.push(m[1] ?? "");
  }
  return texts.join("");
}

function replaceTextInParagraph(
  pXml: string,
  find: string,
  replace: string,
  all = true,
): string {
  const full = paragraphText(pXml);
  if (!full.includes(find)) return pXml;

  // Prefer in-run replacement so formatting stays on each run.
  let changed = false;
  const perRun = pXml.replace(
    /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g,
    (_all, attrs: string, text: string) => {
      if (!text.includes(find)) return `<w:t${attrs ?? ""}>${text}</w:t>`;
      if (!all && changed) return `<w:t${attrs ?? ""}>${text}</w:t>`;
      const next = all ? text.split(find).join(replace) : text.replace(find, replace);
      if (next !== text) changed = true;
      const needPreserve = /^\s|\s$/.test(next);
      const a = attrs ?? "";
      if (needPreserve && !/\bxml:space=/.test(a)) {
        return `<w:t${a} xml:space="preserve">${next}</w:t>`;
      }
      return `<w:t${a}>${next}</w:t>`;
    },
  );
  if (changed) return perRun;

  // Cross-run match: rewrite joined text into the first w:t, clear the rest.
  const nextFull = all ? full.split(find).join(replace) : full.replace(find, replace);
  if (nextFull === full) return pXml;
  let first = true;
  return pXml.replace(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (_all, attrs: string) => {
    if (!first) return `<w:t${attrs ?? ""}></w:t>`;
    first = false;
    const needPreserve = /^\s|\s$/.test(nextFull);
    const a = attrs ?? "";
    if (needPreserve && !/\bxml:space=/.test(a)) {
      return `<w:t${a} xml:space="preserve">${nextFull}</w:t>`;
    }
    return `<w:t${a}>${nextFull}</w:t>`;
  });
}

function makeParagraph(text: string, style?: string): string {
  const pPr = style
    ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`
    : "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
}

export class DocxAdapter implements DocumentAdapter {
  readonly format = "docx" as const;
  path = "";
  private zip: JSZip | null = null;
  private documentXml = "";

  async open(path: string): Promise<void> {
    const buf = await readFile(path);
    this.zip = await JSZip.loadAsync(buf);
    const xml = await this.zip.file("word/document.xml")?.async("string");
    if (!xml) throw new Error("Invalid docx: missing word/document.xml");
    this.documentXml = xml;
    this.path = path;
  }

  async outline(): Promise<DocumentOutline> {
    const paras = extractParagraphs(this.documentXml);
    return {
      format: "docx",
      path: this.path,
      title: basename(this.path),
      paragraphs: paras.length,
    };
  }

  async snapshot(destPath: string): Promise<void> {
    await copyFile(this.path, destPath);
  }

  async readRange(args: Record<string, unknown>): Promise<unknown> {
    const parasXml = extractParagraphs(this.documentXml);
    const paras = parasXml.map((pXml) => {
      const styleMatch = /<w:pStyle[^>]*w:val="([^"]+)"/.exec(pXml);
      const styleRaw = styleMatch?.[1] ?? "Normal";
      const style =
        styleRaw === "Heading1" || styleRaw === "Heading2" ? styleRaw : ("Normal" as const);
      return { text: paragraphText(pXml), style };
    });
    const start = Math.max(0, Number(args.start ?? 0));
    const end = Math.min(paras.length, Number(args.end ?? paras.length));
    return {
      start,
      end,
      paragraphs: paras.slice(start, end).map((p, i) => ({
        index: start + i,
        text: p.text,
        style: p.style,
      })),
    };
  }

  async search(query: string): Promise<Array<{ loc: string; text: string }>> {
    const q = query.toLowerCase();
    const paras = extractParagraphs(this.documentXml).map(paragraphText);
    const hits: Array<{ loc: string; text: string }> = [];
    paras.forEach((text, i) => {
      if (text.toLowerCase().includes(q)) {
        hits.push({ loc: `p:${i}`, text: text.slice(0, 200) });
      }
    });
    return hits.slice(0, 100);
  }

  private buildDiff(beforeXml: string, afterXml: string): DocParagraphDiff {
    const before = extractParagraphs(beforeXml).map(paragraphText);
    const after = extractParagraphs(afterXml).map(paragraphText);
    const hunks: DocParagraphDiff["hunks"] = [];
    const max = Math.max(before.length, after.length);
    for (let i = 0; i < max; i += 1) {
      const b = before[i] ?? "";
      const a = after[i] ?? "";
      if (b !== a) hunks.push({ index: i, before: b, after: a });
    }
    return { kind: "doc", hunks: hunks.slice(0, 200) };
  }

  private mutate(ops: WordOp[]): string {
    let xml = this.documentXml;
    for (const op of ops) {
      if (op.op === "findReplace") {
        const paras = extractParagraphs(xml);
        const next = paras.map((p) =>
          replaceTextInParagraph(p, op.find, op.replace, op.all !== false),
        );
        // Rebuild body content — replace each paragraph occurrence in order
        let i = 0;
        xml = xml.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, () => next[i++] ?? "");
      } else if (op.op === "insertSection") {
        const block =
          makeParagraph(op.heading, "Heading1") + makeParagraph(op.body, "Normal");
        const paras = extractParagraphs(xml);
        const idx =
          op.afterIndex == null
            ? paras.length
            : Math.min(Math.max(0, op.afterIndex + 1), paras.length);
        paras.splice(idx, 0, ...extractParagraphs(block));
        let i = 0;
        const rebuilt = xml.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, () => {
          const p = paras[i];
          i += 1;
          return p ?? "";
        });
        // If we inserted beyond original count, append before </w:body>
        if (i < paras.length) {
          const extra = paras.slice(i).join("");
          xml = rebuilt.replace(/<\/w:body>/, `${extra}</w:body>`);
        } else {
          xml = rebuilt;
        }
      } else if (op.op === "applyStyle") {
        const paras = extractParagraphs(xml);
        const p = paras[op.paragraphIndex];
        if (!p) throw new Error(`Paragraph ${op.paragraphIndex} not found`);
        let next = p;
        if (/<w:pPr>/.test(next)) {
          if (/<w:pStyle /.test(next)) {
            next = next.replace(
              /<w:pStyle[^/]*\/>/,
              `<w:pStyle w:val="${op.style}"/>`,
            );
          } else {
            next = next.replace("<w:pPr>", `<w:pPr><w:pStyle w:val="${op.style}"/>`);
          }
        } else {
          next = next.replace(
            /<w:p([^>]*)>/,
            `<w:p$1><w:pPr><w:pStyle w:val="${op.style}"/></w:pPr>`,
          );
        }
        paras[op.paragraphIndex] = next;
        let i = 0;
        xml = xml.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, () => paras[i++] ?? "");
      } else if (op.op === "setParagraphs") {
        const nextParas = op.paragraphs.map((p) => makeParagraph(p.text, p.style ?? "Normal"));
        const existing = extractParagraphs(xml);
        let i = 0;
        let rebuilt = xml.replace(/<w:p[\s>][\s\S]*?<\/w:p>/g, () => {
          const p = nextParas[i];
          i += 1;
          return p ?? "";
        });
        if (nextParas.length > existing.length) {
          const extra = nextParas.slice(existing.length).join("");
          rebuilt = rebuilt.replace(/<\/w:body>/, `${extra}</w:body>`);
        } else if (nextParas.length < existing.length) {
          // Extra old paragraphs already replaced with "" above when i exceeds nextParas
        }
        xml = rebuilt;
      }
    }
    return xml;
  }

  async previewOps(ops: DocOp[]): Promise<ApplyResult> {
    const wordOps = ops.filter(isWordOp);
    const after = this.mutate(wordOps);
    const diff = this.buildDiff(this.documentXml, after);
    return { diff, opHash: hashDocOps("docx", wordOps) };
  }

  async applyOps(ops: DocOp[]): Promise<ApplyResult> {
    const wordOps = ops.filter(isWordOp);
    const preview = await this.previewOps(wordOps);
    this.documentXml = this.mutate(wordOps);
    return preview;
  }

  async save(): Promise<void> {
    if (!this.zip) throw new Error("Document not open");
    this.zip.file("word/document.xml", this.documentXml);
    const buf = await this.zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const tmp = join(
      dirname(this.path),
      `.${basename(this.path)}.tmp-${randomUUID().slice(0, 8)}.docx`,
    );
    await writeFile(tmp, buf);
    await rename(tmp, this.path);
  }

  async close(): Promise<void> {
    this.zip = null;
    this.documentXml = "";
    this.path = "";
  }
}
