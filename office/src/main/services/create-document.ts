import ExcelJS from "exceljs";
import JSZip from "jszip";
import { saveArtifact, type ArtifactView } from "./artifacts.js";

export type NewDocumentFormat = "md" | "docx" | "xlsx" | "pptx";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function blankDocxBytes(title: string): Promise<Buffer> {
  const body = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>`;
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
  <w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body>
</w:document>`,
  );
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

async function blankXlsxBytes(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell("A1").value = "";
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function blankPptxBytes(title: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
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
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst><p:sldId id="256" r:id="rIdSlide1"/></p:sldIdLst>
</p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdSlide1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(title)}</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
  );
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

/**
 * An empty file of one format, as bytes.
 *
 * Separated from saving it as an artifact because a document does not always
 * begin life in the Library: a task creating one puts it in a workspace folder
 * and edits it there with the same tools it would use on any other file.
 */
export async function blankDocumentBytes(
  format: Exclude<NewDocumentFormat, "md">,
  title: string,
): Promise<Buffer> {
  if (format === "docx") return blankDocxBytes(title);
  if (format === "xlsx") return blankXlsxBytes();
  return blankPptxBytes(title);
}

/** The starting text of a new markdown document. */
export function blankMarkdown(title: string): string {
  return `# ${title}\n\n`;
}

export async function createBlankDocument(input: {
  format: NewDocumentFormat;
  title?: string;
}): Promise<ArtifactView> {
  const title = input.title?.trim() || defaultTitle(input.format);
  if (input.format === "md") {
    return saveArtifact({
      kind: "other",
      title,
      body: `# ${title}\n\n`,
      contentFile: "content.md",
      encoding: "utf8",
      source: "template",
    });
  }
  if (input.format === "docx") {
    const bytes = await blankDocxBytes(title);
    return saveArtifact({
      kind: "other",
      title,
      bytes: new Uint8Array(bytes),
      contentFile: "document.docx",
      encoding: "binary",
      source: "template",
    });
  }
  if (input.format === "xlsx") {
    const bytes = await blankXlsxBytes();
    return saveArtifact({
      kind: "other",
      title,
      bytes: new Uint8Array(bytes),
      contentFile: "workbook.xlsx",
      encoding: "binary",
      source: "template",
    });
  }
  const bytes = await blankPptxBytes(title);
  return saveArtifact({
    kind: "other",
    title,
    bytes: new Uint8Array(bytes),
    contentFile: "presentation.pptx",
    encoding: "binary",
    source: "template",
  });
}

function defaultTitle(format: NewDocumentFormat): string {
  switch (format) {
    case "md":
      return "Untitled note";
    case "docx":
      return "Untitled document";
    case "xlsx":
      return "Untitled spreadsheet";
    case "pptx":
      return "Untitled presentation";
  }
}
