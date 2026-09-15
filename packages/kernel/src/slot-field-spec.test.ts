import { describe, expect, it } from "vitest";

import {
  draftSlotCompileHints,
  draftSlotToSpec,
  axisToSlotSpecs,
  schemaFieldsToSlotSpecs,
  slotFieldToFillable,
  slotFieldsToFillable,
} from "./slot-field-spec.js";
import { fieldValueToGbnf, minBudgetForCharBound } from "./field-fill-grammar.js";

describe("SlotFieldSpec", () => {
  it("compiles schema fields to fillable via shared spec", () => {
    const specs = schemaFieldsToSlotSpecs([
      { path: "/name", type: "string", required: true, description: "Name" },
      { path: "/totalExperienceMonths", type: "integer", required: false },
    ]);
    expect(specs.map((s) => s.id)).toEqual(["/name", "/totalExperienceMonths"]);
    expect(specs[0]).toMatchObject({
      label: "Name",
      type: "string",
      required: true,
      streamTarget: "/name",
    });
    const fillable = slotFieldsToFillable(specs);
    expect(fillable[0]?.path).toBe("/name");
    expect(fieldValueToGbnf(fillable[0]!)).toContain("text ::= char{");
  });

  it("compiles rubric axis to three specs with score enum from range data", () => {
    const { specs, hints } = axisToSlotSpecs({
      id: "A",
      label: "Skills",
      range: [1, 5],
      guidance: "match skills",
    });
    expect(specs).toHaveLength(3);
    const score = slotFieldToFillable(specs[2]!, hints[specs[2]!.id]);
    expect(score.enumValues).toEqual([1, 2, 3, 4, 5]);
    expect(fieldValueToGbnf(score)).toContain('"1" | "2" | "3" | "4" | "5"');
  });

  it("derives string budget from maxChars only", () => {
    const spec = draftSlotToSpec({
      id: "roleTitle",
      description: "Job title",
      maxChars: 60,
      required: true,
    });
    expect(spec.maxChars).toBe(60);
    const fillable = slotFieldToFillable(spec, draftSlotCompileHints(spec));
    expect(fillable.maxTokens).toBe(minBudgetForCharBound(60));
  });

  it("throws when draft authoring sets maxTokens", () => {
    expect(() =>
      draftSlotToSpec({
        id: "roleTitle",
        description: "Job title",
        maxTokens: 30,
        required: true,
      }),
    ).toThrow(/maxTokens is forbidden/);
  });
});
