/**
 * Inject a minimal bar/column chart into an xlsx (OOXML) without AGPL deps.
 * Operates on the saved file via JSZip.
 */
import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function injectBarChart(input: {
  xlsxPath: string;
  sheetName: string;
  dataRange: string;
  title?: string;
  chartType: "bar" | "column";
  /** The numbers themselves, cached so the chart draws without recalculation. */
  values?: number[];
  /** What each bar is called. */
  categories?: string[];
  /** The name of the series, usually the column header. */
  seriesName?: string;
  /** The numbers alone, as an absolute reference. */
  valueRef?: string;
  /** Their labels, as an absolute reference. */
  categoryRef?: string;
}): Promise<void> {
  const buf = await readFile(input.xlsxPath);
  const zip = await JSZip.loadAsync(buf);

  // Find sheet path
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!wbXml) throw new Error("Invalid xlsx: missing workbook.xml");
  const sheetMatch =
    new RegExp(
      `<sheet[^>]*name="${escapeXml(input.sheetName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*r:id="(rId\\d+)"`,
    ).exec(wbXml) ??
    new RegExp(
      `<sheet[^>]*name="${input.sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*r:id="(rId\\d+)"`,
    ).exec(wbXml);
  if (!sheetMatch) {
    // Fallback: first sheet
  }
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!rels) throw new Error("Invalid xlsx: missing workbook rels");

  let sheetPath = "xl/worksheets/sheet1.xml";
  const rid = sheetMatch?.[1];
  if (rid) {
    const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(
      rels,
    )?.[1];
    if (target)
      sheetPath = target.startsWith("/")
        ? target.slice(1)
        : `xl/${target.replace(/^\.\.\//, "")}`;
    if (!sheetPath.startsWith("xl/")) sheetPath = `xl/${sheetPath}`;
  }

  const sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) throw new Error(`Sheet xml missing: ${sheetPath}`);

  const chartId = 1;
  const drawingId = 1;
  const chartPath = `xl/charts/chart${chartId}.xml`;
  const drawingPath = `xl/drawings/drawing${drawingId}.xml`;
  const sheetRelsPath =
    sheetPath.replace("worksheets/", "worksheets/_rels/") + ".rels";

  const grouping = input.chartType === "bar" ? "bar" : "col";

  // Excel writes the values into the chart as well as referencing them, and
  // everything that renders a chart without opening the workbook relies on it.
  const values = input.values ?? [];
  const categories = input.categories ?? [];
  const valueCache =
    values.length > 0
      ? `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
          .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
          .join("")}</c:numCache>`
      : "";
  const categoryXml =
    categories.length > 0
      ? `<c:cat><c:strRef><c:f>${escapeXml(input.sheetName)}!${escapeXml(input.categoryRef || "A1")}</c:f><c:strCache><c:ptCount val="${categories.length}"/>${categories
          .map((c, i) => `<c:pt idx="${i}"><c:v>${escapeXml(c)}</c:v></c:pt>`)
          .join("")}</c:strCache></c:strRef></c:cat>`
      : "";
  const seriesNameCache = input.seriesName
    ? `<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${escapeXml(input.seriesName)}</c:v></c:pt></c:strCache>`
    : "";
  const chartXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:r><a:t>${escapeXml(input.title ?? "Chart")}</a:t></a:r></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title>
    <c:plotArea>
      <c:layout/>
      <c:${grouping}Chart>
        <c:grouping val="clustered"/>
        <c:ser>
          <c:idx val="0"/><c:order val="0"/>
          <c:tx><c:strRef><c:f>${escapeXml(input.sheetName)}!${escapeXml(input.dataRange.split(":")[0] ?? "A1")}</c:f>${seriesNameCache}</c:strRef></c:tx>
          ${categoryXml}
          <c:val><c:numRef><c:f>${escapeXml(input.sheetName)}!${escapeXml(input.valueRef || input.dataRange)}</c:f>${valueCache}</c:numRef></c:val>
        </c:ser>
        <c:axId val="1"/><c:axId val="2"/>
      </c:${grouping}Chart>
      <c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx>
      <c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>
    </c:plotArea>
  </c:chart>
</c:chartSpace>`;

  const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>16</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame>
      <xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart r:id="rId1"/>
      </a:graphicData></a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

  zip.file(chartPath, chartXml);
  zip.file(drawingPath, drawingXml);
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
</Relationships>`,
  );

  let sheetRels = await zip.file(sheetRelsPath)?.async("string");
  if (!sheetRels) {
    sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
  }
  if (!sheetRels.includes("drawing1.xml")) {
    sheetRels = sheetRels.replace(
      "</Relationships>",
      `  <Relationship Id="rIdDraw1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
    );
  }
  zip.file(sheetRelsPath, sheetRels);

  let nextSheet = sheetXml;
  if (!nextSheet.includes("drawing")) {
    nextSheet = nextSheet.replace(
      "</worksheet>",
      `<drawing r:id="rIdDraw1"/></worksheet>`,
    );
    if (!nextSheet.includes("xmlns:r=")) {
      nextSheet = nextSheet.replace(
        "<worksheet",
        '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
      );
    }
  }
  zip.file(sheetPath, nextSheet);

  // Ensure [Content_Types] has chart Override
  let ct = await zip.file("[Content_Types].xml")?.async("string");
  if (ct && !ct.includes("/charts/chart")) {
    ct = ct.replace(
      "</Types>",
      `<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`,
    );
    zip.file("[Content_Types].xml", ct);
  }

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  await writeFile(input.xlsxPath, out);
}
