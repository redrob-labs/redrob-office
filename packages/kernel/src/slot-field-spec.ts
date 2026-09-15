/**
 * Domain-agnostic slot/field spec shared by extract, assess, draftJd, draftFromTemplate.
 * Domain differences live in schema/rubric/template data — not in parallel TypeScript shapes.
 *
 * String budget is never authored: always `maxTokens = maxChars * 3 + 2`
 * (`minBudgetForCharBound`). Length is controlled by maxChars + newline stop, not by raising budget.
 */

import {
  minBudgetForCharBound,
  minBudgetForDigitBound,
  schemaFieldsToFillable,
  type FillableField,
  type FillableFieldType,
} from "./field-fill-grammar.js";

export type SlotFieldValueType = FillableFieldType;

/**
 * Common authoring/runtime slot shape.
 * `streamTarget` is the UI/IPC key for incremental updates (defaults to `id`).
 */
export interface SlotFieldSpec {
  id: string;
  label: string;
  type: SlotFieldValueType;
  maxChars?: number;
  required: boolean;
  streamTarget?: string;
}

/**
 * Extra compile hints from schema/rubric *data* (range, choices, digit bounds).
 * Do not put string decode budgets here — those are derived from maxChars.
 */
export interface SlotFieldCompileHints {
  description?: string;
  enumValues?: readonly number[];
  stringChoices?: readonly string[];
  maxDigits?: number;
}

function leafFromId(id: string): string {
  if (id.startsWith("/")) {
    const segments = id.split("/").filter(Boolean);
    return (segments[segments.length - 1] ?? id).replaceAll("~1", "/").replaceAll("~0", "~");
  }
  return id;
}

export function slotFieldPath(spec: SlotFieldSpec): string {
  return spec.id.startsWith("/") ? spec.id : `/${spec.id}`;
}

export function slotStreamKey(spec: SlotFieldSpec): string {
  return spec.streamTarget ?? spec.id;
}

/**
 * Compile one SlotFieldSpec (+ optional data-driven hints) into FillableField.
 */
export function slotFieldToFillable(
  spec: SlotFieldSpec,
  hints: SlotFieldCompileHints = {},
): FillableField {
  const path = slotFieldPath(spec);
  const label = spec.label || leafFromId(spec.id);
  const field: FillableField = {
    path,
    type: spec.type,
    required: spec.required,
    label,
    ...(hints.description ? { description: hints.description } : { description: label }),
  };

  if (hints.enumValues && hints.enumValues.length > 0) {
    field.enumValues = hints.enumValues;
  }
  if (hints.stringChoices && hints.stringChoices.length > 0) {
    field.stringChoices = hints.stringChoices;
  }

  if (spec.type === "string" || spec.type === "date") {
    const maxChars = spec.maxChars ?? 48;
    field.maxChars = maxChars;
    // Always derive — never accept an independent string budget.
    field.maxTokens = minBudgetForCharBound(maxChars);
  } else if (spec.type === "integer" && !(hints.enumValues && hints.enumValues.length > 0)) {
    const maxDigits = hints.maxDigits ?? 8;
    field.maxDigits = maxDigits;
    field.maxTokens = minBudgetForDigitBound(maxDigits);
  } else if (spec.type === "integer" && hints.enumValues) {
    field.maxTokens = Math.max(4, hints.enumValues.length + 2);
  }

  return field;
}

export function slotFieldsToFillable(
  specs: readonly SlotFieldSpec[],
  hintsById: ReadonlyMap<string, SlotFieldCompileHints> | Record<string, SlotFieldCompileHints> = {},
): FillableField[] {
  const map =
    hintsById instanceof Map
      ? hintsById
      : new Map(Object.entries(hintsById));
  return specs.map((spec) => slotFieldToFillable(spec, map.get(spec.id) ?? {}));
}

/** Registry schema fields → SlotFieldSpec (path is the id). */
export function schemaFieldsToSlotSpecs(
  fields: ReadonlyArray<{
    path: string;
    type: string;
    required: boolean;
    description?: string;
    semanticType?: string;
  }>,
): SlotFieldSpec[] {
  return schemaFieldsToFillable(fields).map((field) => {
    const leaf = leafFromId(field.path);
    return {
      id: field.path,
      label: field.description?.trim() || field.label || leaf,
      type: field.type,
      ...(field.maxChars !== undefined ? { maxChars: field.maxChars } : {}),
      required: field.required,
      streamTarget: field.path,
    };
  });
}

/** Rubric axis → three slot specs (lines / quote / score). Range → hints at compile. */
export function axisToSlotSpecs(axis: {
  id: string;
  label: string;
  range: readonly [number, number];
  guidance: string;
}): { specs: SlotFieldSpec[]; hints: Record<string, SlotFieldCompileHints> } {
  const linesId = `/${axis.id}/lines`;
  const quoteId = `/${axis.id}/quote`;
  const scoreId = `/${axis.id}/score`;
  const values = Array.from(
    { length: axis.range[1] - axis.range[0] + 1 },
    (_, i) => axis.range[0] + i,
  );
  return {
    specs: [
      {
        id: linesId,
        label: `${axis.id}.lines`,
        type: "lineRefs",
        required: false,
        streamTarget: linesId,
      },
      {
        id: quoteId,
        label: `${axis.id}.quote`,
        type: "string",
        maxChars: 48,
        required: false,
        streamTarget: quoteId,
      },
      {
        id: scoreId,
        label: `${axis.id}.score`,
        type: "integer",
        required: false,
        streamTarget: scoreId,
      },
    ],
    hints: {
      [linesId]: {
        description: `1–3 evidence line numbers for axis ${axis.id} (${axis.label}), comma-separated`,
      },
      [quoteId]: {
        description: `Short verbatim substring from one cited line for axis ${axis.id}`,
      },
      [scoreId]: {
        description: `Integer score for ${axis.id} in [${axis.range[0]}, ${axis.range[1]}]: ${axis.guidance}`,
        enumValues: values,
        maxDigits: Math.max(1, String(axis.range[1]).length),
      },
    },
  };
}

/** Draft / template slot authoring → SlotFieldSpec. */
export function draftSlotToSpec(slot: {
  id: string;
  description?: string;
  label?: string;
  maxChars?: number;
  required: boolean;
  streamTarget?: string;
  /** Forbidden — budget is always maxChars*3+2. */
  maxTokens?: number;
}): SlotFieldSpec {
  if (slot.maxTokens !== undefined) {
    throw new Error(
      `draft slot "${slot.id}": maxTokens is forbidden; set maxChars (budget = maxChars*3+2)`,
    );
  }
  const maxChars = slot.maxChars ?? 48;
  return {
    id: slot.id,
    label: slot.label?.trim() || slot.description?.trim() || slot.id,
    type: "string",
    maxChars,
    required: slot.required,
    ...(slot.streamTarget ? { streamTarget: slot.streamTarget } : { streamTarget: slot.id }),
  };
}

/** Description-only hints for draft slots (no independent budget). */
export function draftSlotCompileHints(slot: {
  id: string;
  description?: string;
  maxChars?: number;
  maxTokens?: number;
}): SlotFieldCompileHints {
  if (slot.maxTokens !== undefined) {
    throw new Error(
      `draft slot "${slot.id}": maxTokens is forbidden; set maxChars (budget = maxChars*3+2)`,
    );
  }
  return {
    ...(slot.description ? { description: slot.description } : {}),
  };
}
