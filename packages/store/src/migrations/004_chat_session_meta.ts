import type Database from "better-sqlite3";

export const CHAT_SESSION_META_MIGRATION_VERSION = 4;

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return rows.some((row) => row.name === column);
}

export function migrateChatSessionMeta(db: Database.Database): void {
  if (!hasColumn(db, "chat_sessions", "pinned")) {
    db.exec(`ALTER TABLE chat_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
  }
  if (!hasColumn(db, "chat_sessions", "title_locked")) {
    db.exec(`ALTER TABLE chat_sessions ADD COLUMN title_locked INTEGER NOT NULL DEFAULT 0`);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS chat_sessions_pinned_updated_idx
      ON chat_sessions(pinned DESC, updated_at DESC);
  `);
}
