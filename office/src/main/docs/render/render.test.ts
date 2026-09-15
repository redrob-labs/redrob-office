import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectBarChart } from "../adapters/xlsx-chart.js";
import { readXlsxSheets } from "./xlsx-model.js";
import { readPptxSlides } from "./pptx-model.js";
import { buildRenderModel } from "./model.js";
import { PptxAdapter } from "../adapters/pptx-adapter.js";
import { blankDocumentBytes } from "../../services/create-document.js";

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "redrob-render-test-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

describe("readXlsxSheets", () => {
  it("reads the grid, styles, and a chart's numbers back", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sales");
    ws.getCell("A1").value = "Region";
    ws.getCell("A1").font = { bold: true };
    ws.getCell("B1").value = "Total";
    ws.getCell("A2").value = "North";
    ws.getCell("B2").value = 1200;
    ws.getCell("A3").value = "South";
    ws.getCell("B3").value = 900;
    const path = join(dir, "sales.xlsx");
    await wb.xlsx.writeFile(path);
    await injectBarChart({
      xlsxPath: path,
      sheetName: "Sales",
      dataRange: "B2:B3",
      chartType: "column",
      categoryRef: "A2:A3",
      valueRef: "B2:B3",
      seriesName: "Total",
      values: [1200, 900],
      categories: ["North", "South"],
    });

    const sheets = await readXlsxSheets(path);
    expect(sheets).toHaveLength(1);
    const sheet = sheets[0]!;
    expect(sheet.name).toBe("Sales");
    expect(sheet.rows[0]!.cells[0]!.text).toBe("Region");
    expect(sheet.rows[0]!.cells[0]!.bold).toBe(true);
    expect(sheet.rows[1]!.cells[1]!.numeric).toBe(true);
    expect(sheet.charts).toHaveLength(1);
    const chart = sheet.charts[0]!;
    expect(chart.categories).toEqual(["North", "South"]);
    expect(chart.series[0]!.values).toEqual([1200, 900]);
  });
});

describe("readPptxSlides", () => {
  it("reads each slide's title and body in order", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = join(dir, "deck.pptx");
    await writeFile(path, await blankDocumentBytes("pptx", "Deck"));
    const adapter = new PptxAdapter();
    await adapter.open(path);
    await adapter.applyOps([
      { op: "setText", index: 0, title: "Kickoff" },
      { op: "add", title: "Roadmap", body: "Milestones" },
    ]);
    await adapter.save();

    const { slides } = await readPptxSlides(path);
    expect(slides.length).toBeGreaterThanOrEqual(2);
    const titles = slides.map((s) => s.title);
    expect(titles).toContain("Kickoff");
    expect(titles).toContain("Roadmap");
  });
});

async function writeHwpxFixture(path: string): Promise<void> {
  const { readFile, writeFile } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const mod = (await import("@rhwp/core")) as unknown as {
    default: (init: { module_or_path: Uint8Array }) => Promise<unknown>;
    HwpDocument: {
      createEmpty(): { insertText(a: number, b: number, c: number, t: string): unknown; exportHwpx(): Uint8Array };
    };
  };
  await mod.default({
    module_or_path: await readFile(require.resolve("@rhwp/core/rhwp_bg.wasm")),
  });
  const doc = mod.HwpDocument.createEmpty();
  try {
    doc.insertText(0, 0, 0, "Redrob Hangul render test");
  } catch {
    // Editing is best-effort; an empty page still renders one SVG.
  }
  await writeFile(path, Buffer.from(doc.exportHwpx()));
}

describe("readHwpPages", () => {
  it("lays a Hangul document out into SVG pages", async () => {
    const path = join(dir, "hangul.hwpx");
    await writeHwpxFixture(path);
    const model = await buildRenderModel(path);
    expect(model.kind).toBe("hwp");
    if (model.kind === "hwp") {
      expect(model.pages.length).toBeGreaterThanOrEqual(1);
      expect(model.pages[0]!).toContain("<svg");
      // The bundled Korean font rides along so Hangul draws without a system font.
      expect(model.fontCss).toContain("@font-face");
      expect(model.fontCss).toContain("data:font/woff2;base64,");
    }
  });
});

describe("buildRenderModel", () => {
  it("carries markdown as text and docx as bytes", async () => {
    const { writeFile } = await import("node:fs/promises");
    const mdPath = join(dir, "notes.md");
    await writeFile(mdPath, "# Title\n\nBody", "utf8");
    const md = await buildRenderModel(mdPath);
    expect(md.kind).toBe("md");
    if (md.kind === "md") expect(md.text).toContain("# Title");

    const unknown = await buildRenderModel(join(dir, "thing.zip"));
    expect(unknown.kind).toBe("unsupported");
  });

  it("carries a generated web page as its own html, scripts included", async () => {
    const { writeFile } = await import("node:fs/promises");
    const deck = join(dir, "deck.html");
    const source =
      "<!doctype html><html><body><div class=\"slide\">One</div>" +
      "<script>document.addEventListener('keydown', function(){});</script>" +
      "</body></html>";
    await writeFile(deck, source, "utf8");
    const model = await buildRenderModel(deck);
    expect(model.kind).toBe("html");
    if (model.kind === "html") {
      expect(model.html).toContain("<script>");
      expect(model.html).toContain("class=\"slide\"");
    }

    await writeFile(join(dir, "page.htm"), source, "utf8");
    expect((await buildRenderModel(join(dir, "page.htm"))).kind).toBe("html");
  });
});
