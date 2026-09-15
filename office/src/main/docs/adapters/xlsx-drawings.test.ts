import { describe, expect, it } from "vitest";
import {
  isDrawingPart,
  refreshChartCaches,
  splitChartRef,
} from "./xlsx-drawings.js";

describe("isDrawingPart", () => {
  it("claims charts and drawings and nothing else", () => {
    expect(isDrawingPart("xl/charts/chart1.xml")).toBe(true);
    expect(isDrawingPart("xl/drawings/_rels/drawing1.xml.rels")).toBe(true);
    expect(isDrawingPart("xl/worksheets/sheet1.xml")).toBe(false);
    expect(isDrawingPart("[Content_Types].xml")).toBe(false);
  });
});

describe("splitChartRef", () => {
  it("separates the sheet from the range", () => {
    expect(splitChartRef("Sheet1!$B$2:$B$5")).toEqual({
      sheet: "Sheet1",
      range: "$B$2:$B$5",
    });
  });

  it("unquotes a sheet whose name has a space", () => {
    expect(splitChartRef("'Q3 Data'!$A$1")).toEqual({
      sheet: "Q3 Data",
      range: "$A$1",
    });
  });

  it("refuses a formula that names no sheet", () => {
    expect(splitChartRef("$B$2:$B$5")).toBeNull();
  });
});

describe("refreshChartCaches", () => {
  const chart = `<c:ser><c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt></c:numCache></c:numRef></c:val><c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>old</c:v></c:pt></c:strCache></c:strRef></c:cat></c:ser>`;

  it("replaces the cached numbers with what the cells say now", () => {
    const out = refreshChartCaches(chart, (sheet, range) => {
      expect(sheet).toBe("Sheet1");
      return range.startsWith("$B") ? [120, 95] : ["North", "South"];
    });
    expect(out).toContain("<c:v>120</c:v>");
    expect(out).toContain("<c:v>95</c:v>");
    expect(out).not.toContain("<c:v>1</c:v>");
    expect(out).toContain("<c:v>North</c:v>");
    expect(out).not.toContain("<c:v>old</c:v>");
  });

  it("keeps one cache per reference", () => {
    const out = refreshChartCaches(chart, () => [1, 2]);
    expect(out.match(/<c:numCache>/g)).toHaveLength(1);
    expect(out.match(/<c:strCache>/g)).toHaveLength(1);
  });

  it("leaves a reference alone when the cells cannot be read", () => {
    expect(refreshChartCaches(chart, () => [])).toBe(chart);
    expect(
      refreshChartCaches(chart, () => {
        throw new Error("no such sheet");
      }),
    ).toBe(chart);
  });

  it("escapes a label that would otherwise break the xml", () => {
    const out = refreshChartCaches(chart, (_s, range) =>
      range.startsWith("$B") ? [1, 2] : ["R&D", "<ops>"],
    );
    expect(out).toContain("R&amp;D");
    expect(out).toContain("&lt;ops&gt;");
  });
});
