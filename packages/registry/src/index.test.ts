import { describe, expect, it } from "vitest";
import { listRegistryKinds, loadRubric, loadSchema, loadTemplate } from "./index.js";

describe("listRegistryKinds", () => {
  it("exposes schema, rubric, and template kinds", () => {
    expect(listRegistryKinds()).toEqual(["schema", "rubric", "template"]);
  });
});

describe("registry loaders", () => {
  it("loads and validates data-only registry definitions", () => {
    expect(loadSchema("recruiting/resume").fields).toContainEqual(
      expect.objectContaining({ path: "/name", required: true }),
    );
    expect(loadRubric("recruiting/candidate-6axis").rules).toContainEqual(
      expect.objectContaining({ kind: "deterministic" }),
    );
    expect(loadTemplate("product/screen-spec").outputKind).toBe("markdown");
    expect(loadTemplate("marketing/deck-pptx").outputKind).toBe("pptx");
    expect(loadTemplate("design/diagram").outputKind).toBe("html");
    expect(loadTemplate("legal/memo-hwpx").outputKind).toBe("hwpx");
    expect(loadTemplate("legal/memo").slots).toContainEqual(
      expect.objectContaining({ id: "question", required: true }),
    );
    expect(loadRubric("sales/lead-qualify").axes.length).toBeGreaterThan(0);
    expect(loadTemplate("recruiting/decision-email").slots).toContainEqual(
      expect.objectContaining({ id: "body", required: true }),
    );
  });
});
