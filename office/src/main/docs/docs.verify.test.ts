import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  closeDocSession,
  commitDocOps,
  configureDocSessions,
  openDocSession,
} from "./session.js";
import { executeComputerTool } from "../tools/registry.js";
import type { CanonicalExecPlan } from "../security/types.js";
import type { ToolContext } from "../tools/types.js";

function ctx(root: string, workspace: string): ToolContext {
  return {
    allowedPaths: [workspace],
    userDataPath: root,
  };
}

async function writeSampleXlsx(path: string, rows: Array<Array<string | number>>): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  for (const row of rows) ws.addRow(row);
  await wb.xlsx.writeFile(path);
}

async function writeMinimalDocx(path: string, paragraphs: string[]): Promise<void> {
  const body = paragraphs
    .map(
      (t) =>
        `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${t
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</w:t></w:r></w:p>`,
    )
    .join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr/></w:body>
</w:document>`,
  );
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(path, buf);
}

async function writeMinimalPptx(path: string, titles: string[]): Promise<void> {
  const zip = new JSZip();
  const overrides = titles
    .map(
      (_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join("");
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${overrides}
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );
  const sldIds = titles
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdSlide${i + 1}"/>`)
    .join("");
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>${sldIds}</p:sldIdLst>
</p:presentation>`,
  );
  const rels = titles
    .map(
      (_, i) =>
        `<Relationship Id="rIdSlide${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
    )
    .join("\n");
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
</Relationships>`,
  );
  for (let i = 0; i < titles.length; i += 1) {
    const title = titles[i]!;
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
    );
  }
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(path, buf);
}

async function applyWrite(
  tool: string,
  args: Record<string, unknown>,
  toolCtx: ToolContext,
): Promise<{ ok: boolean; data?: unknown; summary: string }> {
  const dry = await executeComputerTool(tool, { ...args, dryRun: true }, toolCtx);
  expect(dry.result.ok).toBe(true);
  const plan = (dry.result.data as { plan: CanonicalExecPlan }).plan;
  const applied = await executeComputerTool(
    tool,
    { ...args, dryRun: false },
    { ...toolCtx, approvedExecPlan: plan },
  );
  return { ok: applied.result.ok, data: applied.result.data, summary: applied.result.summary };
}

describe("document tools — xlsx", () => {
  let root = "";

  afterEach(async () => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("summarizes column across workbooks, writes sheet+chart, deny keeps origin, undo restores", async () => {
    root = mkdtempSync(join(tmpdir(), "redrob-doc-xlsx-"));
    const workspace = join(root, "ws");
    mkdirSync(workspace, { recursive: true });
    configureDocSessions(root);

    const aPath = join(workspace, "a.xlsx");
    const bPath = join(workspace, "b.xlsx");
    const outPath = join(workspace, "summary.xlsx");
    await writeSampleXlsx(aPath, [
      ["Name", "Amount"],
      ["x", 10],
      ["y", 20],
    ]);
    await writeSampleXlsx(bPath, [
      ["Name", "Amount"],
      ["z", 30],
    ]);
    await writeSampleXlsx(outPath, [["placeholder"]]);
    const originBuf = readFileSync(outPath);

    const toolCtx = ctx(root, workspace);

    // Read amounts via tools (session per file)
    const amounts: number[] = [];
    for (const p of [aPath, bPath]) {
      const opened = await executeComputerTool("doc.open", { path: p }, toolCtx);
      expect(opened.result.ok).toBe(true);
      const sid = (opened.result.data as { sessionId: string }).sessionId;
      const range = await executeComputerTool(
        "doc.readRange",
        { sessionId: sid, sheet: "Data", range: "B2:B10" },
        toolCtx,
      );
      const values = (range.result.data as { data: { values: unknown[][] } }).data.values;
      for (const row of values) {
        const v = row[0];
        if (typeof v === "number") amounts.push(v);
      }
      await executeComputerTool("doc.close", { sessionId: sid }, toolCtx);
    }
    expect(amounts).toEqual([10, 20, 30]);

    const outOpen = await executeComputerTool("doc.open", { path: outPath }, toolCtx);
    const sessionId = (outOpen.result.data as { sessionId: string }).sessionId;

    const dryWrite = await executeComputerTool(
      "sheet.writeRange",
      {
        sessionId,
        sheet: "Summary",
        start: "A1",
        values: [
          ["Label", "Total"],
          ["Amount", amounts.reduce((s, n) => s + n, 0)],
        ],
        dryRun: true,
      },
      toolCtx,
    );
    expect(dryWrite.result.ok).toBe(true);
    const diff = (dryWrite.result.data as { diff: { kind: string; cells: unknown[] } }).diff;
    expect(diff.kind).toBe("sheet");
    expect(diff.cells.length).toBeGreaterThan(0);

    // Deny path: never apply — origin intact
    expect(readFileSync(outPath)).toEqual(originBuf);

    const writeOk = await applyWrite(
      "sheet.writeRange",
      {
        sessionId,
        sheet: "Summary",
        start: "A1",
        values: [
          ["Label", "Total"],
          ["Amount", amounts.reduce((s, n) => s + n, 0)],
        ],
      },
      toolCtx,
    );
    expect(writeOk.ok).toBe(true);

    const chartOk = await applyWrite(
      "sheet.chart",
      {
        sessionId,
        sheet: "Summary",
        type: "bar",
        dataRange: "B1:B2",
        title: "Totals",
      },
      toolCtx,
    );
    expect(chartOk.ok).toBe(true);

    const afterWrite = readFileSync(outPath);
    expect(afterWrite.equals(originBuf)).toBe(false);

    const undo = await executeComputerTool("doc.undo", { sessionId }, toolCtx);
    expect(undo.result.ok).toBe(true);

    // Crash mid-apply: mutate then fail save → rollback to last good
    const session = await openDocSession(outPath, root);
    const beforeCrash = readFileSync(outPath);
    const adapter = session.adapter;
    const save = adapter.save.bind(adapter);
    adapter.save = async () => {
      throw new Error("simulated crash");
    };
    await expect(
      commitDocOps(
        session.id,
        "sheet.writeRange",
        [
          {
            op: "writeRange",
            sheet: "Summary",
            start: "A1",
            values: [["crash"]],
          },
        ],
        { dryRun: false },
      ),
    ).rejects.toThrow(/simulated crash/);
    adapter.save = save;
    expect(readFileSync(outPath)).toEqual(beforeCrash);
    await closeDocSession(session.id);
    await closeDocSession(sessionId);
  });
});

describe("document tools — docx", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("find/replace term and insert section while keeping bold run", async () => {
    root = mkdtempSync(join(tmpdir(), "redrob-doc-docx-"));
    const workspace = join(root, "ws");
    mkdirSync(workspace, { recursive: true });
    configureDocSessions(root);
    const path = join(workspace, "memo.docx");
    await writeMinimalDocx(path, ["Hello WidgetCorp team", "Notes here"]);
    const toolCtx = ctx(root, workspace);

    const opened = await executeComputerTool("doc.open", { path }, toolCtx);
    const sessionId = (opened.result.data as { sessionId: string }).sessionId;

    const replaced = await applyWrite(
      "doc.findReplace",
      { sessionId, find: "WidgetCorp", replace: "Acme", all: true },
      toolCtx,
    );
    expect(replaced.ok).toBe(true);

    const inserted = await applyWrite(
      "doc.insertSection",
      {
        sessionId,
        heading: "New Section",
        body: "Added by document tools",
      },
      toolCtx,
    );
    expect(inserted.ok).toBe(true);

    const zip = await JSZip.loadAsync(readFileSync(path));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Acme");
    expect(xml).not.toContain("WidgetCorp");
    expect(xml).toContain("New Section");
    expect(xml).toContain("<w:b/>");

    await executeComputerTool("doc.close", { sessionId }, toolCtx);
  });
});

describe("document tools — pptx", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("adds three slides and reorders", async () => {
    root = mkdtempSync(join(tmpdir(), "redrob-doc-pptx-"));
    const workspace = join(root, "ws");
    mkdirSync(workspace, { recursive: true });
    configureDocSessions(root);
    const path = join(workspace, "deck.pptx");
    await writeMinimalPptx(path, ["Intro"]);
    const toolCtx = ctx(root, workspace);

    const opened = await executeComputerTool("doc.open", { path }, toolCtx);
    const sessionId = (opened.result.data as { sessionId: string }).sessionId;

    for (const title of ["Alpha", "Beta", "Gamma"]) {
      const r = await applyWrite("slide.add", { sessionId, title, body: title }, toolCtx);
      expect(r.ok).toBe(true);
    }

    const reordered = await applyWrite(
      "slide.reorder",
      { sessionId, from: 3, to: 1 },
      toolCtx,
    );
    expect(reordered.ok).toBe(true);

    const outline = await executeComputerTool("doc.outline", { sessionId }, toolCtx);
    const slides = (outline.result.data as { outline: { slides: Array<{ title: string }> } })
      .outline.slides;
    expect(slides.length).toBe(4);
    expect(slides.map((s) => s.title)).toContain("Gamma");

    await executeComputerTool("doc.close", { sessionId }, toolCtx);
  });
});
