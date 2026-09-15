import { describe, expect, it } from "vitest";

import {
  ABSENT_TOKEN,
  assertFieldBudgetInvariant,
  fieldFillStopTriggers,
  fieldValueToGbnf,
  isMaxCharsSaturated,
  parseFieldValue,
  schemaFieldsToFillable,
  type FillableField,
} from "./field-fill-grammar.js";

describe("fieldValueToGbnf", () => {
  it("allows absent token for every type", () => {
    for (const type of ["string", "integer", "number", "boolean", "date", "lineRefs"] as const) {
      const field: FillableField = { path: `/${type}`, type, required: false };
      expect(fieldValueToGbnf(field)).toContain(JSON.stringify(ABSENT_TOKEN));
      expect(fieldValueToGbnf(field)).toContain("absent nl |");
    }
  });

  it("requires terminating newline on each alternative and no open-ended ws", () => {
    const gbnf = fieldValueToGbnf({
      path: "/name",
      type: "string",
      required: true,
      maxChars: 48,
    });
    expect(gbnf).toContain("root ::= absent nl | text nl");
    expect(gbnf).not.toMatch(/\bws\b/);
    expect(gbnf).toContain("text ::= char{1,48}");
  });

  it("uses free char grammar for former email/phone/list (JS stops handle bleed)", () => {
    for (const [path, maxChars, semanticType] of [
      ["/email", 64, "email"],
      ["/phone", 32, "phone"],
      ["/skills", 64, "list"],
    ] as const) {
      const gbnf = fieldValueToGbnf({
        path,
        type: "string",
        required: false,
        semanticType,
        maxChars,
      });
      expect(gbnf).toContain(`text ::= char{1,${maxChars}}`);
      expect(gbnf).toContain("char ::= [^\\n\\r]");
      expect(gbnf).not.toContain("email ::=");
      expect(gbnf).not.toContain("phonechar");
      expect(gbnf).not.toContain("itemchar");
    }
  });

  it("bounds integer digits", () => {
    const gbnf = fieldValueToGbnf({
      path: "/totalExperienceMonths",
      type: "integer",
      required: false,
      maxDigits: 4,
    });
    expect(gbnf).toContain("[0-9]{1,4}");
    expect(gbnf).not.toContain("[0-9]+");
  });

  it("builds enum score grammars", () => {
    const gbnf = fieldValueToGbnf({
      path: "/score",
      type: "integer",
      required: true,
      enumValues: [1, 2, 3, 4, 5],
    });
    expect(gbnf).toContain('"1" | "2" | "3" | "4" | "5"');
  });
});

describe("quoteSubstringChoices", () => {
  it("includes contiguous substrings of cited lines", async () => {
    const { quoteSubstringChoices } = await import("./field-fill-grammar.js");
    const choices = quoteSubstringChoices(["TypeScript, NestJS"]);
    expect(choices).toContain("TypeScript, NestJS");
    expect(choices).toContain("TypeScript");
    expect(choices.every((c) => "TypeScript, NestJS".includes(c))).toBe(true);
  });
});

describe("parseFieldValue", () => {
  it("parses absent", () => {
    expect(parseFieldValue({ path: "/x", type: "string", required: false }, ABSENT_TOKEN)).toEqual({
      value: null,
      absent: true,
    });
  });

  it("parses typed values", () => {
    expect(parseFieldValue({ path: "/n", type: "integer", required: false }, "48")).toEqual({
      value: 48,
      absent: false,
    });
    expect(
      parseFieldValue({ path: "/r", type: "lineRefs", required: false }, "2,5,9"),
    ).toEqual({ value: [2, 5, 9], absent: false });
  });

  it("accepts email/phone-like strings as free text (bleed trimmed in decode loop)", () => {
    expect(
      parseFieldValue(
        { path: "/email", type: "string", required: false, semanticType: "email" },
        "a@b.com",
      ),
    ).toEqual({ value: "a@b.com", absent: false });
    expect(
      parseFieldValue(
        { path: "/phone", type: "string", required: false, semanticType: "phone" },
        "010-5555-1212",
      ),
    ).toEqual({ value: "010-5555-1212", absent: false });
  });
});

describe("isMaxCharsSaturated", () => {
  it("flags exact bound length as saturated", () => {
    const field: FillableField = {
      path: "/email",
      type: "string",
      required: false,
      maxChars: 24,
    };
    expect(isMaxCharsSaturated(field, "seoyeon.park@example.com")).toBe(true);
    expect(isMaxCharsSaturated(field, "a@b.co")).toBe(false);
  });
});

describe("fieldFillStopTriggers", () => {
  it("includes newline, tab, label, and label: / label:  forms", () => {
    const triggers = fieldFillStopTriggers("email", ["email", "phone", "totalExperienceMonths"]);
    expect(triggers).toContain("\n");
    expect(triggers).toContain("\t");
    expect(triggers).toContain("phone");
    expect(triggers).toContain("phone:");
    expect(triggers).toContain("phone: ");
    expect(triggers).toContain("totalExper");
    expect(triggers).not.toContain("email:");
  });
});

describe("IncrementalLabelStopScanner", () => {
  it("detects label suffix incrementally without rescanning from 0 for each trigger list walk", async () => {
    const { IncrementalLabelStopScanner } = await import("./field-fill-grammar.js");
    const scanner = new IncrementalLabelStopScanner("email", ["email", "phone"]);
    expect(scanner.push("seoyeon.park@example.com")).toBeNull();
    const hit = scanner.push("phone");
    expect(hit).toEqual({ index: "seoyeon.park@example.com".length, trigger: "phone", isTab: false });
  });
});

describe("schemaFieldsToFillable", () => {
  it("maps Date-suffixed strings to date grammar", () => {
    const fields = schemaFieldsToFillable([
      { path: "/issueDate", type: "string", required: true },
      { path: "/amount", type: "number", required: true },
    ]);
    expect(fields.find((f) => f.path === "/issueDate")?.type).toBe("date");
    expect(fields.find((f) => f.path === "/amount")?.type).toBe("number");
  });

  it("sets char bounds from path without semantic GBNF types", () => {
    const fields = schemaFieldsToFillable([
      { path: "/email", type: "string", required: false, semanticType: "email" },
      { path: "/phone", type: "string", required: false, semanticType: "phone" },
      { path: "/skills", type: "string", required: false, semanticType: "list" },
      { path: "/name", type: "string", required: true },
      { path: "/totalExperienceMonths", type: "integer", required: false },
    ]);
    expect(fields.find((f) => f.path === "/email")).toMatchObject({
      maxChars: 64,
      maxTokens: 64 * 3 + 2,
    });
    expect(fields.find((f) => f.path === "/email")?.semanticType).toBeUndefined();
    expect(fields.find((f) => f.path === "/phone")).toMatchObject({
      maxChars: 32,
      maxTokens: 32 * 3 + 2,
    });
    expect(fields.find((f) => f.path === "/skills")).toMatchObject({
      maxChars: 64,
      maxTokens: 64 * 3 + 2,
    });
    expect(fields.find((f) => f.path === "/name")).toMatchObject({
      maxChars: 48,
      maxTokens: 48 * 3 + 2,
    });
    expect(fields.find((f) => f.path === "/totalExperienceMonths")).toMatchObject({
      maxDigits: 4,
      maxTokens: 4 + 2,
    });
  });

  it("rejects string fields that violate token budget invariant", () => {
    expect(() =>
      assertFieldBudgetInvariant({
        path: "/x",
        type: "string",
        required: false,
        maxChars: 64,
        maxTokens: 66,
      }),
    ).toThrow(/budget invariant/);
  });

  it("rejects integer fields that violate digit budget invariant", () => {
    expect(() =>
      assertFieldBudgetInvariant({
        path: "/n",
        type: "integer",
        required: false,
        maxDigits: 4,
        maxTokens: 3,
      }),
    ).toThrow(/budget invariant/);
  });
});
