import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  DOMAINS,
  OUTPUTS,
  WORKSPACES,
  findTemplateForAction,
  listCatalogItems,
  templateDomain,
} from "./index.js";

describe("CATEGORIES", () => {
  it("browses by work axis rather than by department", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      "create",
      "research",
      "extract",
      "analyze",
      "edit",
      "automate",
    ]);
  });

  it("keeps the catalog small enough to scan", () => {
    const items = listCatalogItems();
    expect(items.length).toBeLessThanOrEqual(16);
    const ids = items.map((item) => item.template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("surfaces general-purpose create outputs including slides and graphics", () => {
    const ids = listCatalogItems().map((item) => item.template.id);
    expect(ids).toEqual(
      expect.arrayContaining(["draft", "deck", "graphic", "research", "daylog"]),
    );
    expect(
      listCatalogItems().find((item) => item.template.id === "deck")?.template
        .output,
    ).toBe("slides");
    expect(
      listCatalogItems().find((item) => item.template.id === "graphic")
        ?.template.output,
    ).toBe("graphic");
  });

  it("folds the repeated slot-fill and rubric tasks into variants", () => {
    const draft = listCatalogItems().find((item) => item.template.id === "draft");
    expect(draft?.template.variants?.map((v) => v.id)).toEqual([
      "memo",
      "clause",
      "spec",
      "handoff",
      "triage",
      "access",
      "model",
      "outreach",
      "discovery",
      "brief",
      "copy",
    ]);
    const checklist = listCatalogItems().find(
      (item) => item.template.id === "checklist",
    );
    expect(checklist?.categoryId).toBe("analyze");
    expect(checklist?.template.variants?.map((v) => v.id)).toEqual([
      "conform",
      "classify",
      "review",
      "overflow",
      "tokens",
      "contract",
      "qualify",
    ]);
  });

  it("merges resume and receipt intake into one folder task", () => {
    const intake = listCatalogItems().find((item) => item.template.id === "intake");
    expect(intake?.template.variants?.map((v) => v.registryId)).toEqual([
      "recruiting/resume",
      "recruiting/degree-certificate.in",
      "finance/receipt",
      "finance/tax-invoice.kr",
    ]);
    // Intake writes into the domain of the schema, not of the catalog section.
    expect(templateDomain(intake!.template, "receipt")).toBe("finance");
    expect(templateDomain(intake!.template, "resume")).toBe("recruiting");
  });

  it("keeps file-format variants inside one template", () => {
    const draft = listCatalogItems().find((item) => item.template.id === "draft");
    const memo = draft?.template.variants?.find((v) => v.id === "memo");
    expect(memo?.formats?.map((f) => f.registryId)).toEqual([
      "legal/memo",
      "legal/memo-docx",
      "legal/memo-hwpx",
    ]);
    const deck = listCatalogItems().find((item) => item.template.id === "deck");
    expect(deck?.template.variants?.[0]?.formats?.map((f) => f.registryId)).toEqual([
      "marketing/deck-outline",
      "marketing/deck-pptx",
    ]);
  });

  it("declares an output every template can actually produce", () => {
    for (const item of listCatalogItems()) {
      expect(OUTPUTS).toContain(item.template.output);
      expect(item.template.action).toBe(item.categoryId);
      expect(item.template.domains.length).toBeGreaterThan(0);
      for (const domain of item.template.domains) {
        expect(DOMAINS).toContain(domain);
      }
    }
  });

  it("still resolves saved workflow steps that use pre-collapse task names", () => {
    expect(findTemplateForAction("jd")?.template.id).toBe("jd");
    const memo = findTemplateForAction("memo");
    expect(memo?.template.id).toBe("draft");
    expect(memo?.variantId).toBe("memo");
    const capture = findTemplateForAction("receipt");
    expect(capture?.template.id).toBe("intake");
    expect(findTemplateForAction("nope")).toBeUndefined();
  });

  it("keeps chat and workflow out of the catalog", () => {
    const ids = listCatalogItems().map((item) => item.template.id);
    for (const removed of ["ask", "workflow", "memoDocx", "memoHwpx", "deckPptx"]) {
      expect(ids).not.toContain(removed);
    }
  });

  it("keeps WORKSPACES as modules alias of templates", () => {
    expect(WORKSPACES).toHaveLength(CATEGORIES.length);
    for (const ws of WORKSPACES) {
      expect(ws.modules.length).toBeGreaterThan(0);
      expect(ws.modules).toEqual(
        CATEGORIES.find((c) => c.id === ws.id)?.templates,
      );
      for (const mod of ws.modules) {
        expect(["lookup", "process", "review"]).toContain(mod.engine);
        expect(["bulk", "triage", "deep"]).toContain(mod.scale);
      }
    }
  });
});
