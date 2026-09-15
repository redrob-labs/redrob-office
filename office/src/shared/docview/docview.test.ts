import { describe, expect, it } from "vitest";
import { chartSvg } from "./chart-svg.js";
import { escapeHtml } from "./escape.js";
import { HWP_STYLE, hwpHtmlBody } from "./hwp-html.js";
import { pptxHtmlBody } from "./pptx-html.js";
import { xlsxHtmlBody } from "./xlsx-html.js";
import type {
  PptxSlideView,
  XlsxChartView,
  XlsxSheetView,
} from "../doc-render.js";

describe("escapeHtml", () => {
  it("neutralises the characters that break markup", () => {
    expect(escapeHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });
});

describe("xlsxHtmlBody", () => {
  const sheet: XlsxSheetView = {
    name: "Sales",
    columnWidths: [12, 10],
    rows: [
      { cells: [{ text: "Region", bold: true }, { text: "Total", bold: true }] },
      { cells: [{ text: "North" }, { text: "1200", numeric: true }] },
    ],
    charts: [],
  };

  it("draws a table with the sheet name and the cells", () => {
    const html = xlsxHtmlBody([sheet]);
    expect(html).toContain("Sales");
    expect(html).toContain("<table>");
    expect(html).toContain("Region");
    expect(html).toContain("1200");
    // Numbers line up on the right.
    expect(html).toContain("text-align:right");
  });

  it("skips cells a merge covers and spans the anchor", () => {
    const merged: XlsxSheetView = {
      name: "",
      columnWidths: [10, 10],
      rows: [
        {
          cells: [
            { text: "Wide", colSpan: 2 },
            { text: "", covered: true },
          ],
        },
      ],
      charts: [],
    };
    const html = xlsxHtmlBody([merged]);
    expect(html).toContain('colspan="2"');
    // The covered cell contributes no <td>.
    expect(html.match(/<td/g)?.length).toBe(1);
  });

  it("renders each chart on the sheet as an SVG", () => {
    const withChart: XlsxSheetView = {
      ...sheet,
      charts: [
        {
          title: "Totals",
          type: "column",
          categories: ["North", "South"],
          series: [{ name: "Total", values: [1200, 900] }],
        },
      ],
    };
    const html = xlsxHtmlBody([withChart]);
    expect(html).toContain("<svg");
    expect(html).toContain("Totals");
  });
});

describe("chartSvg", () => {
  const base: XlsxChartView = {
    title: "Q",
    type: "column",
    categories: ["A", "B", "C"],
    series: [{ name: "S", values: [3, 6, 9] }],
  };

  it("draws a bar per data point for a column chart", () => {
    const svg = chartSvg(base);
    expect(svg.startsWith("<svg")).toBe(true);
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("draws slices for a pie chart", () => {
    const svg = chartSvg({ ...base, type: "pie" });
    expect((svg.match(/<path/g) ?? []).length).toBe(3);
  });

  it("draws a polyline for a line chart", () => {
    const svg = chartSvg({ ...base, type: "line" });
    expect(svg).toContain("<polyline");
  });
});

describe("pptxHtmlBody", () => {
  const slides: PptxSlideView[] = [
    {
      title: "Kickoff",
      body: [
        { runs: [{ text: "Goals", bold: true }], level: 0, bullet: true },
        { runs: [{ text: "Owners" }], level: 1, bullet: true },
        { runs: [{ text: "A closing note" }], level: 0, bullet: false },
      ],
    },
  ];

  it("draws a slide with its title and grouped bullets", () => {
    const html = pptxHtmlBody(slides);
    expect(html).toContain("Kickoff");
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>Goals</strong>");
    // The plain line closes the list and stands on its own.
    expect(html).toContain("</ul><p>A closing note</p>");
    // Indented bullet carries a margin.
    expect(html).toContain("margin-left:24px");
  });

  it("says so when the deck is empty", () => {
    expect(pptxHtmlBody([])).toContain("no slides");
  });
});

describe("hwpHtmlBody", () => {
  it("wraps each parser SVG page in its own sheet", () => {
    const html = hwpHtmlBody([
      "<svg width='100' height='100'></svg>",
      "<svg width='100' height='100'></svg>",
    ]);
    expect((html.match(/class="page"/g) ?? []).length).toBe(2);
    expect(html).toContain("<svg");
  });

  it("says so when the document has no pages", () => {
    expect(hwpHtmlBody([])).toContain("no pages");
  });

  it("points the parser's SVG text at the bundled Korean face", () => {
    expect(HWP_STYLE).toContain(".doc-hwp svg text");
    expect(HWP_STYLE).toContain("Nanum Gothic");
  });
});
