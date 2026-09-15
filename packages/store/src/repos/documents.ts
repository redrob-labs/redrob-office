import type { Store } from "../db.js";

export interface Document {
  id: string; path: string; contentHash: string; schemaId: string; extractedAt: string; tierUsed: string;
}

function toDocument(row: Record<string, unknown> | undefined): Document | undefined {
  return row ? {
    id: String(row.id), path: String(row.path), contentHash: String(row.content_hash),
    schemaId: String(row.schema_id), extractedAt: String(row.extracted_at), tierUsed: String(row.tier_used),
  } : undefined;
}

export function upsertDocument(store: Store, document: Document): Document {
  store.db.prepare(`
    INSERT INTO documents (id, path, content_hash, schema_id, extracted_at, tier_used)
    VALUES (@id, @path, @contentHash, @schemaId, @extractedAt, @tierUsed)
    ON CONFLICT(id) DO UPDATE SET path=excluded.path, content_hash=excluded.content_hash,
      schema_id=excluded.schema_id, extracted_at=excluded.extracted_at, tier_used=excluded.tier_used
  `).run(document);
  return getDocument(store, document.id)!;
}

export function getDocument(store: Store, id: string): Document | undefined {
  return toDocument(store.db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as Record<string, unknown> | undefined);
}

export function listDocuments(store: Store, schemaId?: string): Document[] {
  const rows = schemaId
    ? store.db
        .prepare("SELECT * FROM documents WHERE schema_id = ? ORDER BY extracted_at DESC")
        .all(schemaId)
    : store.db.prepare("SELECT * FROM documents ORDER BY extracted_at DESC").all();
  return rows
    .map((row) => toDocument(row as Record<string, unknown>))
    .filter((doc): doc is Document => doc !== undefined);
}
