import { randomUUID } from "node:crypto";
import {
  getField,
  logCorrection,
  markReviewed,
  upsertField,
  type Correction,
  type Field,
  type Store,
} from "@redrob/store";
import { nowIso } from "../app-time.js";

export interface CorrectFieldInput {
  fieldId: string;
  value: string;
  schemaId: string;
  modelId: string;
  tier: string;
}

export interface CorrectFieldResult {
  field: Field;
  correction: Correction;
}

/**
 * Applies a human edit while preserving the original confidence snapshot in
 * the correction record. The field itself is then marked reviewed.
 */
export function correctField(store: Store, input: CorrectFieldInput): CorrectFieldResult {
  const field = getField(store, input.fieldId);
  if (!field) {
    throw new Error(`field not found (${input.fieldId})`);
  }

  const correction = logCorrection(store, {
    id: randomUUID(),
    fieldId: field.id,
    modelValue: field.value,
    humanValue: input.value,
    correctedAt: nowIso(),
    schemaId: input.schemaId,
    modelId: input.modelId,
    tier: input.tier,
  });

  const updatedField = upsertField(store, {
    id: field.id,
    documentId: field.documentId,
    pointer: field.pointer,
    value: input.value,
    confidenceScore: field.confidenceScore,
    confidenceJson: field.confidenceJson,
    reviewed: true,
  });

  return { field: updatedField, correction };
}

/** Accept current value without logging a correction (no learning-signal pollution). */
export function acceptField(store: Store, fieldId: string): Field {
  const field = getField(store, fieldId);
  if (!field) {
    throw new Error(`field not found (${fieldId})`);
  }
  const updated = markReviewed(store, fieldId, true);
  if (!updated) throw new Error(`failed to mark reviewed (${fieldId})`);
  return updated;
}
