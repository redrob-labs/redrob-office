import { describe, expect, it } from "vitest";
import { looksLikeALink } from "./auto-link.js";

describe("looksLikeALink", () => {
  it("leaves a file name alone, whatever country shares its ending", () => {
    for (const name of [
      "http://launch-notes.md",
      "http://report.xlsx",
      "http://main.rs",
      "http://install.sh",
      "http://deck.pptx",
      "http://notes.txt",
    ]) {
      expect(looksLikeALink(name), name).toBe(false);
    }
  });

  it("still links an address", () => {
    for (const url of [
      "https://redrob.ai",
      "http://example.com",
      "https://www.google.com",
      "mailto:someone@example.com",
    ]) {
      expect(looksLikeALink(url), url).toBe(true);
    }
  });

  it("links a name with a path after it, which no file name has", () => {
    expect(looksLikeALink("https://example.md/notes")).toBe(true);
    expect(looksLikeALink("https://docs.rs/serde")).toBe(true);
  });

  it("does not care about case", () => {
    expect(looksLikeALink("http://PLAN.DOCX")).toBe(false);
  });
});
