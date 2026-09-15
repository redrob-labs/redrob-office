/**
 * Boot-time grammar compile for all four product field-fill paths.
 * Schemas alone left draftJd / template slots outside assert — that missed the
 * maxTokens/maxChars invariant failure until runtime.
 */
import {
  assertFieldGrammarsCompile,
  assertGbnfCompiles,
  axisToSlotSpecs,
  draftSlotCompileHints,
  draftSlotToSpec,
  schemaFieldsToFillable,
  slotFieldToFillable,
  slotFieldsToFillable,
  type FillableField,
} from "@redrob/kernel";
import {
  listRubricIds,
  listSchemaIds,
  listTemplateIds,
  listUserRubricIds,
  loadRubric,
  loadSchema,
  loadTemplate,
} from "@redrob/registry";
import { JD_MODEL_SLOTS, jdSlotsAsSpecs } from "./jd-slots.js";
import { STAFF_OUTPUT_GBNF } from "../office/staff/output-grammar.js";

function defaultTemplateMaxChars(slotId: string): number {
  switch (slotId) {
    case "body":
    case "narrative":
    case "memo":
    case "analysis":
    case "conclusion":
      return 800;
    case "responsibilities":
    case "qualifications":
      return 300;
    case "subject":
    case "roleTitle":
    case "title":
      return 120;
    case "location":
      return 80;
    case "candidateName":
    case "decision":
      return 60;
    default:
      return 200;
  }
}

function collectProductFillableFields(): FillableField[] {
  const fields: FillableField[] = [];

  for (const id of listSchemaIds()) {
    fields.push(...schemaFieldsToFillable(loadSchema(id).fields));
  }

  const rubricIds = Array.from(new Set([...listRubricIds(), ...listUserRubricIds()]));
  for (const id of rubricIds) {
    const rubric = loadRubric(id);
    for (const axis of rubric.axes) {
      const { specs, hints } = axisToSlotSpecs(axis);
      for (const spec of specs) {
        fields.push(slotFieldToFillable(spec, hints[spec.id] ?? {}));
      }
    }
  }

  const jd = jdSlotsAsSpecs(JD_MODEL_SLOTS);
  fields.push(...slotFieldsToFillable(jd.specs, jd.hints));

  for (const id of listTemplateIds()) {
    const template = loadTemplate(id);
    const slots = template.slots.map((slot) => ({
      id: slot.id,
      description: slot.description || slot.id,
      maxChars: slot.maxChars ?? defaultTemplateMaxChars(slot.id),
      required: slot.required,
    }));
    const specs = slots.map((s) => draftSlotToSpec(s));
    const hints = Object.fromEntries(slots.map((s) => [s.id, draftSlotCompileHints(s)]));
    fields.push(...slotFieldsToFillable(specs, hints));
  }

  return fields;
}

export async function assertProductSlotGrammarsCompile(): Promise<{
  fieldCount: number;
  schemaCount: number;
  rubricCount: number;
  templateCount: number;
  jdSlotCount: number;
}> {
  const fields = collectProductFillableFields();
  await assertFieldGrammarsCompile(fields);
  // Hand-written, so there is no generator standing behind it. Left unchecked, a
  // typo surfaces as a staff turn failing halfway through somebody's work.
  await assertGbnfCompiles(STAFF_OUTPUT_GBNF, "office/staff-output");
  return {
    fieldCount: fields.length,
    schemaCount: listSchemaIds().length,
    rubricCount: Array.from(new Set([...listRubricIds(), ...listUserRubricIds()])).length,
    templateCount: listTemplateIds().length,
    jdSlotCount: JD_MODEL_SLOTS.length,
  };
}
