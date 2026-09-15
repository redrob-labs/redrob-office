import type Database from "better-sqlite3";

export const MEMORIES_MIGRATION_VERSION = 2;

export function migrateMemories(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('manual', 'import')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS memories_updated_at_idx ON memories(updated_at DESC);
  `);
}
