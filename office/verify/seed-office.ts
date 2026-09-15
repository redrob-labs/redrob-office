/**
 * Seeds rich Word/Excel/PowerPoint/Markdown documents as loose files in the
 * artifact folder so the Documents tab has something real to show in the demo.
 * Run through scripts/run-electron-ts.mjs. Hangul is seeded separately.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { blankDocumentBytes } from "../src/main/services/create-document.js";
import { injectBarChart } from "../src/main/docs/adapters/xlsx-chart.js";
import { PptxAdapter } from "../src/main/docs/adapters/pptx-adapter.js";
import { DocxAdapter } from "../src/main/docs/adapters/docx-adapter.js";

async function main(): Promise<void> {
  const dir = process.env.REDROB_ARTIFACTS_DIR;
  if (!dir) throw new Error("REDROB_ARTIFACTS_DIR is required");
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    join(dir, "Launch notes.md"),
    [
      "# Launch notes",
      "",
      "A quick brief the team can read at a glance.",
      "",
      "## Highlights",
      "",
      "- **Revenue** is up across every region",
      "- The new onboarding cut setup time in half",
      "- Two enterprise pilots start next week",
      "",
      "## Next steps",
      "",
      "1. Freeze scope on Friday",
      "2. Draft the announcement",
      "3. Line up the demo",
      "",
      "> Everything the office makes lands right here.",
      "",
    ].join("\n"),
    "utf8",
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Revenue");
  ws.getCell("A1").value = "Quarter";
  ws.getCell("A1").font = { bold: true };
  ws.getCell("B1").value = "Revenue";
  ws.getCell("B1").font = { bold: true };
  const rows: [string, number][] = [
    ["Q1", 1200],
    ["Q2", 1650],
    ["Q3", 1980],
    ["Q4", 2400],
  ];
  rows.forEach(([q, v], i) => {
    ws.getCell(`A${i + 2}`).value = q;
    ws.getCell(`B${i + 2}`).value = v;
  });
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 14;
  const xlsxPath = join(dir, "Revenue.xlsx");
  await wb.xlsx.writeFile(xlsxPath);
  await injectBarChart({
    xlsxPath,
    sheetName: "Revenue",
    dataRange: "B2:B5",
    chartType: "column",
    categoryRef: "A2:A5",
    valueRef: "B2:B5",
    seriesName: "Revenue",
    values: rows.map(([, v]) => v),
    categories: rows.map(([q]) => q),
  });

  const pptxPath = join(dir, "Kickoff.pptx");
  writeFileSync(pptxPath, Buffer.from(await blankDocumentBytes("pptx", "Kickoff")));
  const pptx = new PptxAdapter();
  await pptx.open(pptxPath);
  await pptx.applyOps([
    { op: "setText", index: 0, title: "Kickoff", body: "Q3 product launch" },
    { op: "add", title: "Goals", body: "Ship v2\nGrow adoption\nDelight users" },
    { op: "add", title: "Timeline", body: "Jul — design\nAug — build\nSep — launch" },
  ]);
  await pptx.save();

  const docxPath = join(dir, "Project brief.docx");
  writeFileSync(docxPath, Buffer.from(await blankDocumentBytes("docx", "Project brief")));
  const docx = new DocxAdapter();
  await docx.open(docxPath);
  await docx.applyOps([
    {
      op: "insertSection",
      heading: "Overview",
      body: "This brief captures the launch plan for the third-quarter release.",
    },
    {
      op: "insertSection",
      heading: "Scope",
      body: "Ship the redesigned onboarding, the revenue dashboard, and the new export flow.",
    },
    {
      op: "insertSection",
      heading: "Risks",
      body: "Timeline is tight; the export work depends on the dashboard landing first.",
    },
  ]);
  await docx.save();

  // eslint-disable-next-line no-console
  console.log("seeded office documents in", dir);
  process.exit(0);
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("seed-office failed:", err);
  process.exit(1);
});
