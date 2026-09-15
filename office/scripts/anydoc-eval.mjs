/**
 * Measures @firecrawl/anydoc against the document decoders Office ships today.
 *
 * Reproduces the numbers in docs/decisions/2026-08-anydoc-document-markdown.md.
 * anydoc is not a dependency of this repo: install it into a scratch directory
 * and point this at it, so evaluating a candidate never changes the lockfile.
 *
 *   mkdir /tmp/anydoc && cd /tmp/anydoc && npm init -y && npm i @firecrawl/anydoc
 *   node office/scripts/anydoc-eval.mjs --anydoc /tmp/anydoc/node_modules/@firecrawl/anydoc
 *
 * Fixtures are built here rather than committed: they have to be documents this
 * app actually produces and reads, and a checked-in binary nobody can diff is
 * worse than sixty lines that regenerate it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require_ = createRequire(import.meta.url);
/** mammoth and pdf-parse belong to @redrob/extract, which is where they run today. */
const requireExtract = createRequire(
  new URL("../../packages/extract/src/", import.meta.url),
);

function parseArgs(argv) {
  let anydocPath = "@firecrawl/anydoc";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--anydoc") anydocPath = argv[++i] ?? anydocPath;
  }
  return { anydocPath };
}

const { anydocPath } = parseArgs(process.argv.slice(2));

let anydoc;
try {
  anydoc = require_(anydocPath);
} catch (error) {
  console.error(
    `Could not load anydoc from "${anydocPath}". Install it in a scratch directory and pass --anydoc <path>.`,
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const JSZip = require_("jszip");
const ExcelJS = require_("exceljs");

const root = mkdtempSync(join(tmpdir(), "anydoc-eval-"));
mkdirSync(root, { recursive: true });

// ---------------------------------------------------------------- fixtures

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function paragraph(text, style) {
  const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function tableCell(text) {
  return `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${paragraph(text)}</w:tc>`;
}

async function buildDocx(path) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", DOCX_CONTENT_TYPES);
  zip.file("_rels/.rels", DOCX_RELS);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${paragraph("Backend Engineer", "Heading1")}
${paragraph("Seoul, hybrid. Reports to the Platform lead.")}
${paragraph("Compensation", "Heading2")}
<w:tbl>
<w:tr>${tableCell("Band")}${tableCell("Base")}${tableCell("Equity")}</w:tr>
<w:tr>${tableCell("L4")}${tableCell("KRW 78,000,000")}${tableCell("0.05%")}</w:tr>
<w:tr>${tableCell("L5")}${tableCell("KRW 96,000,000")}${tableCell("0.09%")}</w:tr>
</w:tbl>
${paragraph("Contact hr@example.com before 2026-09-01.")}
</w:body></w:document>`,
  );
  writeFileSync(path, await zip.generateAsync({ type: "nodebuffer" }));
}

async function buildXlsx(path, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Candidates");
  sheet.addRow(["Name", "Years", "Stack", "Score"]);
  for (let i = 0; i < rows; i += 1) {
    sheet.addRow([`Person ${i}`, i % 20, "Go, Postgres, Kafka", i % 100]);
  }
  await workbook.xlsx.writeFile(path);
}

function pptxSlide(title, bullets) {
  const body = bullets
    .map((line) => `<a:p><a:r><a:rPr lang="en-US"/><a:t>${line}</a:t></a:r></a:p>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>
<p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;
}

async function buildPptx(path) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`,
  );
  zip.file("ppt/slides/slide1.xml", pptxSlide("Q3 hiring plan", ["Two backend seats", "One designer"]));
  zip.file("ppt/slides/slide2.xml", pptxSlide("Budget", ["KRW 340M total", "Signed off 2026-07-14"]));
  writeFileSync(path, await zip.generateAsync({ type: "nodebuffer" }));
}

function buildPdf(path) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream =
    "BT /F1 14 Tf 72 700 Td (Offer letter) Tj 0 -28 Td /F1 11 Tf (Role: Backend Engineer, L4) Tj 0 -18 Td (Base: KRW 78,000,000) Tj 0 -18 Td (Start: 2026-09-01) Tj ET";
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(path, Buffer.from(out, "latin1"));
}

// ---------------------------------------------------------------- measuring

/** Median of nine, after one warm run. */
async function median(fn) {
  await fn().catch(() => undefined);
  const samples = [];
  let output = null;
  for (let i = 0; i < 9; i += 1) {
    const started = performance.now();
    output = await fn();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return { ms: samples[4], output };
}

async function report(label, fn) {
  try {
    const { ms, output } = await median(fn);
    console.log(`  ${label.padEnd(18)} ${ms.toFixed(2).padStart(8)} ms  ${String(output.length).padStart(8)} chars`);
    return output;
  } catch (error) {
    console.log(`  ${label.padEnd(18)}   refused: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function main() {
  const docx = join(root, "jd.docx");
  const xlsx = join(root, "candidates.xlsx");
  const bigXlsx = join(root, "big.xlsx");
  const pptx = join(root, "plan.pptx");
  const csv = join(root, "rows.csv");
  const pdf = join(root, "offer.pdf");

  await buildDocx(docx);
  await buildXlsx(xlsx, 3);
  await buildXlsx(bigXlsx, 20_000);
  await buildPptx(pptx);
  writeFileSync(csv, "name,years,stack,score\nAsha Patel,6,\"Go, Postgres\",82\n");
  buildPdf(pdf);

  const mammoth = requireExtract("mammoth");
  const { PDFParse } = requireExtract("pdf-parse");

  console.log("\ndocx");
  const anyDocx = await report("anydoc", () => anydoc.toMarkdown(docx));
  await report("mammoth (today)", async () => {
    const result = await mammoth.extractRawText({ buffer: await readFile(docx) });
    return result.value;
  });
  if (anyDocx) console.log(`  anydoc keeps the table: ${anyDocx.includes("| --- |") ? "yes" : "no"}`);

  console.log("\nxlsx");
  await report("anydoc", () => anydoc.toMarkdown(xlsx));
  console.log("  today             refused: no decoder for .xlsx");

  console.log("\npptx");
  await report("anydoc", () => anydoc.toMarkdown(pptx));
  console.log("  today             refused: no decoder for .pptx");

  console.log("\ncsv");
  await report("anydoc", () => anydoc.toMarkdown(csv));
  console.log("  today             refused: no decoder for .csv");

  console.log("\npdf");
  const anyPdf = await report("anydoc", () => anydoc.toMarkdown(pdf));
  const parsedPdf = await report("pdf-parse (today)", async () => {
    const parser = new PDFParse({ data: await readFile(pdf) });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  });
  if (anyPdf && parsedPdf) {
    const lines = (text) => text.trim().split("\n").filter(Boolean).length;
    console.log(`  body lines kept: anydoc ${lines(anyPdf)}, pdf-parse ${lines(parsedPdf)}`);
  }

  console.log("\nlarge xlsx (20k rows), and whether it blocks the event loop");
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
  }, 5);
  const started = performance.now();
  const big = await anydoc.toMarkdown(bigXlsx);
  const elapsed = performance.now() - started;
  clearInterval(timer);
  console.log(
    `  anydoc ${elapsed.toFixed(1)} ms, ${big.length} chars, event loop ticked ${ticks} times during the call`,
  );
  console.log(`  rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);

  console.log("\nformats it recognises by extension");
  const extensions = [
    "docx", "doc", "xlsx", "xls", "pptx", "ppt", "odt", "ods", "odp",
    "rtf", "epub", "csv", "pdf", "hwp", "hwpx",
  ];
  for (const extension of extensions) {
    console.log(`  ${extension.padEnd(6)} ${anydoc.formatFromExtension(extension) ?? "unsupported"}`);
  }

  console.log("\nhow it refuses");
  const broken = join(root, "broken.docx");
  writeFileSync(broken, Buffer.from("not a zip at all"));
  for (const [label, path] of [
    ["corrupt", broken],
    ["missing", join(root, "nope.docx")],
  ]) {
    try {
      await anydoc.toMarkdown(path);
      console.log(`  ${label.padEnd(10)} converted (unexpected)`);
    } catch (error) {
      console.log(`  ${label.padEnd(10)} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

try {
  await main();
} finally {
  rmSync(root, { recursive: true, force: true });
}
