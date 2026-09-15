import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { draftRubricFromJd, generate, maskPii, slugifyRubricSuffix } from "./index.js";

describe("generate", () => {
  it("lists missing required slots rather than inventing them", async () => {
    const result = await generate({ templateId: "recruiting/jd", data: { roleTitle: "Engineer" } });
    expect(result.unfilled).toEqual(["responsibilities", "qualifications"]);
  });

  it("masks common publishable PII", () => {
    expect(maskPii("Email me@example.com or call +1 (415) 555-0123."))
      .toBe("Email [email redacted] or call [phone redacted].");
    expect(maskPii("Call 010-1234-5678 · RRN 900101-1234567"))
      .toBe("Call [phone redacted] · RRN [id redacted]");
  });

  it("renders filled pure slots without model inference", async () => {
    const result = await generate({
      templateId: "recruiting/jd",
      data: { roleTitle: "Engineer", responsibilities: "Build", qualifications: "TypeScript" },
    });
    expect(result.unfilled).toEqual([]);
    expect(result.output.kind).toBe("markdown");
  });

  it("renders pptx for marketing/deck-pptx", async () => {
    const result = await generate({
      templateId: "marketing/deck-pptx",
      data: {
        purpose: "Launch",
        audience: "Buyers",
        narrative: "Problem\n\nSolution\n\nAsk",
      },
    });
    expect(result.output.kind).toBe("pptx");
    const bytes = await readFile(result.output.path);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("renders docx and hwpx for legal memo exports", async () => {
    const data = {
      matter: "Acme",
      question: "Can we?",
      facts: "Signed last year.",
    };
    const docx = await generate({ templateId: "legal/memo-docx", data });
    const hwpx = await generate({ templateId: "legal/memo-hwpx", data });
    expect(docx.output.kind).toBe("docx");
    expect(hwpx.output.kind).toBe("hwpx");
    expect((await readFile(docx.output.path)).byteLength).toBeGreaterThan(500);
    expect((await readFile(hwpx.output.path)).byteLength).toBeGreaterThan(500);
  });

  it("renders html diagram and svg asset", async () => {
    const html = await generate({
      templateId: "design/diagram",
      data: { title: "Flow", mermaid: "flowchart LR\n  A-->B" },
    });
    const svg = await generate({
      templateId: "design/svg-asset",
      data: { title: "Mark", description: "Redrob" },
    });
    expect(html.output.kind).toBe("html");
    expect(svg.output.kind).toBe("svg");
    expect(await readFile(html.output.path, "utf8")).toContain("mermaid");
    expect(await readFile(svg.output.path, "utf8")).toContain("<svg");
  });
});

describe("draftRubricFromJd", () => {
  it("builds axes from JD bullets", () => {
    const rubric = draftRubricFromJd(
      ["NestJS 3년", "도메인 경험", "시스템 설계", "커뮤니케이션"].join("\n"),
      "recruiting/backend-nest",
    );
    expect(rubric.id).toBe("recruiting/backend-nest");
    expect(rubric.axes.some((axis) => axis.id === "F")).toBe(true);
    expect(rubric.axes[0]?.label).toContain("NestJS");
  });

  it("slugifies ascii suffixes", () => {
    expect(slugifyRubricSuffix("Backend Nest")).toBe("backend-nest");
  });
});
