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
  SlideDiff,
  SlideOp,
} from "../types.js";

function isSlideOp(op: DocOp): op is SlideOp {
  return (
    op.op === "add" ||
    op.op === "setText" ||
    op.op === "insertImage" ||
    op.op === "reorder"
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slideTitleFromXml(xml: string): string {
  const texts: string[] = [];
  const re = /<a:t>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) texts.push(m[1] ?? "");
  return texts[0] ?? "(untitled)";
}

function makeSlideXml(title: string, body = ""): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(title)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(body)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

export class PptxAdapter implements DocumentAdapter {
  readonly format = "pptx" as const;
  path = "";
  private zip: JSZip | null = null;
  private slidePaths: string[] = [];

  async open(path: string): Promise<void> {
    const buf = await readFile(path);
    this.zip = await JSZip.loadAsync(buf);
    this.path = path;
    this.slidePaths = await this.listSlidePaths();
  }

  private async listSlidePaths(): Promise<string[]> {
    if (!this.zip) return [];
    const rels = await this.zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
    if (!rels) throw new Error("Invalid pptx: missing presentation rels");
    const paths: Array<{ id: number; path: string; order: number }> = [];
    const re =
      /<Relationship\b([^>]*?)\/>/g;
    let m: RegExpExecArray | null;
    let order = 0;
    while ((m = re.exec(rels)) !== null) {
      const attrs = m[1] ?? "";
      if (!/Type="[^"]*\/relationships\/slide"/.test(attrs)) continue;
      const idAttr = /Id="([^"]+)"/.exec(attrs)?.[1] ?? "";
      const target = /Target="([^"]+)"/.exec(attrs)?.[1];
      if (!target) continue;
      const num = Number(/(\d+)\s*$/.exec(idAttr)?.[1] ?? order);
      const p = target.startsWith("/")
        ? target.slice(1)
        : `ppt/${target.replace(/^\.\.\//, "")}`;
      paths.push({
        id: Number.isFinite(num) ? num : order,
        path: p.startsWith("ppt/") ? p : `ppt/${p}`,
        order,
      });
      order += 1;
    }
    paths.sort((a, b) => a.id - b.id || a.order - b.order);
    return paths.map((p) => p.path);
  }

  async outline(): Promise<DocumentOutline> {
    if (!this.zip) throw new Error("Presentation not open");
    const slides: Array<{ index: number; title: string }> = [];
    for (let i = 0; i < this.slidePaths.length; i += 1) {
      const xml = await this.zip.file(this.slidePaths[i]!)?.async("string");
      slides.push({ index: i, title: xml ? slideTitleFromXml(xml) : "(empty)" });
    }
    return {
      format: "pptx",
      path: this.path,
      title: basename(this.path),
      slides,
    };
  }

  async snapshot(destPath: string): Promise<void> {
    await copyFile(this.path, destPath);
  }

  async readRange(args: Record<string, unknown>): Promise<unknown> {
    if (!this.zip) throw new Error("Presentation not open");
    const index = Number(args.index ?? 0);
    const path = this.slidePaths[index];
    if (!path) throw new Error(`Slide ${index} not found`);
    const xml = await this.zip.file(path)?.async("string");
    const texts: string[] = [];
    const re = /<a:t>([\s\S]*?)<\/a:t>/g;
    let m: RegExpExecArray | null;
    while (xml && (m = re.exec(xml)) !== null) texts.push(m[1] ?? "");
    return { index, texts };
  }

  async search(query: string): Promise<Array<{ loc: string; text: string }>> {
    if (!this.zip) throw new Error("Presentation not open");
    const q = query.toLowerCase();
    const hits: Array<{ loc: string; text: string }> = [];
    for (let i = 0; i < this.slidePaths.length; i += 1) {
      const xml = await this.zip.file(this.slidePaths[i]!)?.async("string");
      if (!xml) continue;
      const text = slideTitleFromXml(xml);
      const all: string[] = [];
      const re = /<a:t>([\s\S]*?)<\/a:t>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) all.push(m[1] ?? "");
      const joined = all.join(" ");
      if (joined.toLowerCase().includes(q)) {
        hits.push({ loc: `slide:${i}`, text: joined.slice(0, 200) });
      } else if (text.toLowerCase().includes(q)) {
        hits.push({ loc: `slide:${i}`, text: text.slice(0, 200) });
      }
    }
    return hits.slice(0, 100);
  }

  private async cloneState(): Promise<{
    zip: JSZip;
    slides: string[];
  }> {
    if (!this.zip) throw new Error("Presentation not open");
    const buf = await this.zip.generateAsync({ type: "nodebuffer" });
    const zip = await JSZip.loadAsync(buf);
    return { zip, slides: [...this.slidePaths] };
  }

  private async mutate(
    zip: JSZip,
    slides: string[],
    ops: SlideOp[],
  ): Promise<{ slides: string[]; diff: SlideDiff }> {
    const changes: SlideDiff["changes"] = [];
    let nextSlides = [...slides];

    for (const op of ops) {
      if (op.op === "add") {
        const n = nextSlides.length + 1;
        const path = `ppt/slides/slide${n}_${randomUUID().slice(0, 8)}.xml`;
        zip.file(path, makeSlideXml(op.title, op.body ?? ""));
        zip.file(
          path.replace("slides/", "slides/_rels/") + ".rels",
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,
        );
        const at = op.atIndex == null ? nextSlides.length : Math.max(0, Math.min(op.atIndex, nextSlides.length));
        nextSlides.splice(at, 0, path);
        changes.push({ index: at, action: "add", summary: `Add "${op.title}"` });
      } else if (op.op === "setText") {
        const path = nextSlides[op.index];
        if (!path) throw new Error(`Slide ${op.index} not found`);
        let xml = await zip.file(path)?.async("string");
        if (!xml) throw new Error(`Slide xml missing: ${path}`);
        const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1] ?? "");
        let i = 0;
        xml = xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, () => {
          const cur = i;
          i += 1;
          if (cur === 0 && op.title != null) return `<a:t>${escapeXml(op.title)}</a:t>`;
          if (cur === 1 && op.body != null) return `<a:t>${escapeXml(op.body)}</a:t>`;
          return `<a:t>${escapeXml(texts[cur] ?? "")}</a:t>`;
        });
        zip.file(path, xml);
        changes.push({
          index: op.index,
          action: "edit",
          summary: `Edit slide ${op.index}`,
        });
      } else if (op.op === "insertImage") {
        const path = nextSlides[op.index];
        if (!path) throw new Error(`Slide ${op.index} not found`);
        const imgBuf = await readFile(op.imagePath);
        const mediaName = `image_doc_${randomUUID().slice(0, 8)}.png`;
        const mediaPath = `ppt/media/${mediaName}`;
        zip.file(mediaPath, imgBuf);
        const relsPath = path.replace("slides/", "slides/_rels/") + ".rels";
        let rels =
          (await zip.file(relsPath)?.async("string")) ||
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
        const rid = `rIdImg${randomUUID().slice(0, 8)}`;
        rels = rels.replace(
          "</Relationships>",
          `  <Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>
</Relationships>`,
        );
        zip.file(relsPath, rels);
        let xml = await zip.file(path)?.async("string");
        if (!xml) throw new Error("slide xml missing");
        const pic = `<p:pic>
  <p:nvPicPr><p:cNvPr id="20" name="${mediaName}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
  <p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
  <p:spPr><a:xfrm><a:off x="500000" y="2000000"/><a:ext cx="4000000" cy="3000000"/></a:xfrm>
  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>`;
        xml = xml.replace("</p:spTree>", `${pic}</p:spTree>`);
        zip.file(path, xml);
        changes.push({
          index: op.index,
          action: "image",
          summary: `Insert image on slide ${op.index}`,
        });
      } else if (op.op === "reorder") {
        if (
          op.from < 0 ||
          op.to < 0 ||
          op.from >= nextSlides.length ||
          op.to >= nextSlides.length
        ) {
          throw new Error("Invalid reorder indices");
        }
        const [item] = nextSlides.splice(op.from, 1);
        nextSlides.splice(op.to, 0, item!);
        changes.push({
          index: op.to,
          action: "reorder",
          summary: `Move slide ${op.from} → ${op.to}`,
        });
      }
    }

    // Rewrite presentation.xml.rels slide relationships in order
    let rels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
    if (!rels) throw new Error("missing presentation rels");
    // Remove existing slide relationships
    rels = rels.replace(
      /<Relationship[^>]*Type="[^"]*\/relationships\/slide"[^>]*\/>/g,
      "",
    );
    const slideRels = nextSlides
      .map((p, i) => {
        const target = p.replace(/^ppt\//, "");
        return `<Relationship Id="rIdSlide${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${target}"/>`;
      })
      .join("\n");
    rels = rels.replace("</Relationships>", `${slideRels}\n</Relationships>`);
    zip.file("ppt/_rels/presentation.xml.rels", rels);

    // Update presentation.xml sldIdLst
    let pres = await zip.file("ppt/presentation.xml")?.async("string");
    if (pres) {
      const ids = nextSlides
        .map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdSlide${i + 1}"/>`)
        .join("");
      if (/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/.test(pres)) {
        pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${ids}</p:sldIdLst>`);
      } else {
        pres = pres.replace("</p:presentation>", `<p:sldIdLst>${ids}</p:sldIdLst></p:presentation>`);
      }
      zip.file("ppt/presentation.xml", pres);
    }

    // Content types overrides for new slides
    let ct = await zip.file("[Content_Types].xml")?.async("string");
    if (ct) {
      for (const p of nextSlides) {
        const part = `/${p}`;
        if (!ct.includes(part)) {
          ct = ct.replace(
            "</Types>",
            `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
          );
        }
      }
      zip.file("[Content_Types].xml", ct);
    }

    return { slides: nextSlides, diff: { kind: "slide", changes } };
  }

  async previewOps(ops: DocOp[]): Promise<ApplyResult> {
    const slideOps = ops.filter(isSlideOp);
    const { zip, slides } = await this.cloneState();
    const { diff } = await this.mutate(zip, slides, slideOps);
    return { diff, opHash: hashDocOps("pptx", slideOps) };
  }

  async applyOps(ops: DocOp[]): Promise<ApplyResult> {
    if (!this.zip) throw new Error("Presentation not open");
    const slideOps = ops.filter(isSlideOp);
    const { slides, diff } = await this.mutate(this.zip, this.slidePaths, slideOps);
    this.slidePaths = slides;
    return { diff, opHash: hashDocOps("pptx", slideOps) };
  }

  async save(): Promise<void> {
    if (!this.zip) throw new Error("Presentation not open");
    const buf = await this.zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const tmp = join(
      dirname(this.path),
      `.${basename(this.path)}.tmp-${randomUUID().slice(0, 8)}.pptx`,
    );
    await writeFile(tmp, buf);
    await rename(tmp, this.path);
  }

  async close(): Promise<void> {
    this.zip = null;
    this.slidePaths = [];
    this.path = "";
  }
}
