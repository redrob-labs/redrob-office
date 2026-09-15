import { describe, expect, it } from "vitest";
import { parseMemoryImportText } from "./memories.js";

describe("parseMemoryImportText", () => {
  it("extracts markdown list items", () => {
    const bodies = parseMemoryImportText(
      `# Notes\n\n- Prefer Korean\n- Company is Acme\n\n## More\n1. Keep answers short\n`,
      "notes.md",
    );
    expect(bodies).toEqual(["Prefer Korean", "Company is Acme", "Keep answers short"]);
  });

  it("parses json arrays", () => {
    expect(parseMemoryImportText(`["A","B"]`, "mem.json")).toEqual(["A", "B"]);
  });

  it("parses csv body column", () => {
    const bodies = parseMemoryImportText(`body,tag\nHello,x\nWorld,y\n`, "facts.csv");
    expect(bodies).toEqual(["Hello", "World"]);
  });
});
