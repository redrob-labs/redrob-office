import type Database from "better-sqlite3";

export const INITIAL_MIGRATION_VERSION = 1;

export function migrateInitial(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, path TEXT NOT NULL, content_hash TEXT NOT NULL,
      schema_id TEXT NOT NULL, extracted_at TEXT NOT NULL, tier_used TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fields (
      id TEXT PRIMARY KEY, document_id TEXT NOT NULL, pointer TEXT NOT NULL,
      value TEXT NOT NULL, confidence_score REAL NOT NULL, confidence_json TEXT,
      reviewed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    );
    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY, field_id TEXT NOT NULL, model_value TEXT NOT NULL,
      human_value TEXT NOT NULL, corrected_at TEXT NOT NULL, schema_id TEXT NOT NULL,
      model_id TEXT NOT NULL, tier TEXT NOT NULL, confidence_at_correction REAL NOT NULL,
      confidence_json TEXT,
      FOREIGN KEY (field_id) REFERENCES fields(id)
    );
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL, phonetic_key TEXT NOT NULL,
      dob TEXT, phone_suffix TEXT, embedding BLOB, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entity_links (
      id TEXT PRIMARY KEY, document_id TEXT NOT NULL, entity_id TEXT NOT NULL,
      method TEXT NOT NULL, score REAL NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (entity_id) REFERENCES entities(id)
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, engine TEXT NOT NULL,
      started_at TEXT NOT NULL, finished_at TEXT, item_count INTEGER NOT NULL,
      timing_json TEXT, tier_start TEXT NOT NULL, tier_end TEXT, tier_changed INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, rubric_id TEXT NOT NULL, rule_id TEXT NOT NULL,
      severity TEXT NOT NULL, message TEXT NOT NULL, evidence_json TEXT, confidence_json TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS fields_document_id_idx ON fields(document_id);
    CREATE INDEX IF NOT EXISTS corrections_field_id_idx ON corrections(field_id);
    CREATE INDEX IF NOT EXISTS audit_at_idx ON audit(at);
  `);
}
