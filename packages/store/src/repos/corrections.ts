import type { Store } from "../db.js";
import { getField } from "./fields.js";

export interface Correction {
  id: string; fieldId: string; modelValue: string; humanValue: string; correctedAt: string;
  schemaId: string; modelId: string; tier: string; confidenceAtCorrection: number;
  confidenceJson: string | null;
}

export interface LogCorrectionInput extends Omit<Correction, "confidenceAtCorrection" | "confidenceJson"> {
  confidenceAtCorrection?: number;
  confidenceJson?: string | null;
}

function toCorrection(row: Record<string, unknown>): Correction {
  return {
    id: String(row.id), fieldId: String(row.field_id), modelValue: String(row.model_value),
    humanValue: String(row.human_value), correctedAt: String(row.corrected_at),
    schemaId: String(row.schema_id), modelId: String(row.model_id), tier: String(row.tier),
    confidenceAtCorrection: Number(row.confidence_at_correction),
    confidenceJson: row.confidence_json === null ? null : String(row.confidence_json),
  };
}

export function logCorrection(store: Store, input: LogCorrectionInput): Correction {
  const field = getField(store, input.fieldId);
  if (!field && input.confidenceAtCorrection === undefined) {
    throw new Error(`cannot snapshot confidence: field not found (${input.fieldId})`);
  }
  const confidenceAtCorrection = input.confidenceAtCorrection ?? field!.confidenceScore;
  const confidenceJson = input.confidenceJson ?? field?.confidenceJson ?? null;
  store.db.prepare(`
    INSERT INTO corrections (id, field_id, model_value, human_value, corrected_at, schema_id, model_id, tier, confidence_at_correction, confidence_json)
    VALUES (@id, @fieldId, @modelValue, @humanValue, @correctedAt, @schemaId, @modelId, @tier, @confidenceAtCorrection, @confidenceJson)
  `).run({ ...input, confidenceAtCorrection, confidenceJson });
  return toCorrection(store.db.prepare("SELECT * FROM corrections WHERE id = ?").get(input.id) as Record<string, unknown>);
}

export function listCorrections(store: Store, fieldId?: string): Correction[] {
  const statement = fieldId
    ? store.db.prepare("SELECT * FROM corrections WHERE field_id = ? ORDER BY corrected_at")
    : store.db.prepare("SELECT * FROM corrections ORDER BY corrected_at");
  return (fieldId === undefined ? statement.all() : statement.all(fieldId))
    .map((row) => toCorrection(row as Record<string, unknown>));
}
