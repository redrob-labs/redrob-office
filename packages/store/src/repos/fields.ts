import type { Store } from "../db.js";

export interface Field {
  id: string;
  documentId: string;
  pointer: string;
  value: string;
  confidenceScore: number;
  confidenceJson: string | null;
  reviewed: boolean;
}

export interface UpsertFieldInput extends Omit<Field, "reviewed" | "confidenceJson"> {
  confidenceJson?: string | null;
  reviewed?: boolean;
}

function toField(row: Record<string, unknown> | undefined): Field | undefined {
  if (!row) return undefined;
  return {
    id: String(row.id), documentId: String(row.document_id), pointer: String(row.pointer),
    value: String(row.value), confidenceScore: Number(row.confidence_score),
    confidenceJson: row.confidence_json === null ? null : String(row.confidence_json),
    reviewed: Number(row.reviewed) === 1,
  };
}

export function upsertField(store: Store, input: UpsertFieldInput): Field {
  store.db.prepare(`
    INSERT INTO fields (id, document_id, pointer, value, confidence_score, confidence_json, reviewed)
    VALUES (@id, @documentId, @pointer, @value, @confidenceScore, @confidenceJson, @reviewed)
    ON CONFLICT(id) DO UPDATE SET document_id=excluded.document_id, pointer=excluded.pointer,
      value=excluded.value, confidence_score=excluded.confidence_score,
      confidence_json=excluded.confidence_json, reviewed=excluded.reviewed
  `).run({ ...input, confidenceJson: input.confidenceJson ?? null, reviewed: Number(input.reviewed ?? false) });
  return getField(store, input.id)!;
}

export function markReviewed(store: Store, id: string, reviewed = true): Field | undefined {
  store.db.prepare("UPDATE fields SET reviewed = ? WHERE id = ?").run(Number(reviewed), id);
  return getField(store, id);
}

export function getField(store: Store, id: string): Field | undefined {
  return toField(store.db.prepare("SELECT * FROM fields WHERE id = ?").get(id) as Record<string, unknown> | undefined);
}

/** Fields needing human review, ordered from least to most confident. */
export function listUnreviewedFieldsBelowThreshold(store: Store, threshold: number): Field[] {
  return store.db
    .prepare(
      `SELECT * FROM fields
       WHERE reviewed = 0 AND confidence_score < ?
       ORDER BY confidence_score ASC, id ASC`,
    )
    .all(threshold)
    .map((row) => toField(row as Record<string, unknown>)!)
    .filter((field): field is Field => field !== undefined);
}

export function listFieldsByDocument(store: Store, documentId: string): Field[] {
  return store.db
    .prepare("SELECT * FROM fields WHERE document_id = ? ORDER BY pointer ASC")
    .all(documentId)
    .map((row) => toField(row as Record<string, unknown>)!)
    .filter((field): field is Field => field !== undefined);
}
