import { describe, expect, it, vi } from "vitest";
import { isBlankToken, generateFieldFillCloud } from "./field-fill-cloud.js";
import type { FillableField } from "../field-fill-grammar.js";

vi.mock("./chat.js", () => ({
  generateCloudChatWithFallback: vi.fn(async () => ({
    text: JSON.stringify({
      name: "Kim Minjun",
      skills: "TypeScript, Node.js",
      niceToHave: "없음",
    }),
  })),
}));

const field = (path: string): FillableField => ({
  path,
  type: "string",
  required: false,
  label: path.replace(/^\//, ""),
});

describe("isBlankToken", () => {
  it("treats model 'nothing here' words as absent so they never leak into copy", () => {
    for (const blank of ["없음", "없음.", "해당 없음", "none", "N/A", "n/a", "-", "TBD", "null", ""]) {
      expect(isBlankToken(blank)).toBe(true);
    }
  });

  it("keeps real values", () => {
    for (const real of ["Senior Backend Engineer", "5+ years", "Seoul", "TypeScript"]) {
      expect(isBlankToken(real)).toBe(false);
    }
  });
});

describe("generateFieldFillCloud value shape", () => {
  it("returns plain field values, not {value,absent} wrappers, and drops blank tokens", async () => {
    const result = await generateFieldFillCloud({
      provider: "openrouter",
      model: "test",
      providers: { openrouter: { apiKey: "x".repeat(12) } },
      document: "resume text",
      fields: [field("/name"), field("/skills"), field("/niceToHave")],
    });
    const byPath = Object.fromEntries(result.fields.map((f) => [f.path, f]));
    // Plain strings — this is what caught "/name" being stored as an object.
    expect(byPath["/name"]?.value).toBe("Kim Minjun");
    expect(typeof byPath["/name"]?.value).toBe("string");
    expect(byPath["/skills"]?.value).toBe("TypeScript, Node.js");
    // "없음" is treated as no value.
    expect(byPath["/niceToHave"]?.absent).toBe(true);
    expect(byPath["/niceToHave"]?.value).toBeNull();
  });
});
