import Database from "better-sqlite3";
import { INITIAL_MIGRATION_VERSION, migrateInitial } from "./migrations/001_initial.js";
import { MEMORIES_MIGRATION_VERSION, migrateMemories } from "./migrations/002_memories.js";
import {
  CHAT_SESSIONS_MIGRATION_VERSION,
  migrateChatSessions,
} from "./migrations/003_chat_sessions.js";
import {
  CHAT_SESSION_META_MIGRATION_VERSION,
  migrateChatSessionMeta,
} from "./migrations/004_chat_session_meta.js";

export interface Store {
  readonly db: Database.Database;
  close(): void;
}

export function openStore(dbPath: string): Store {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  const version = Number(db.pragma("user_version", { simple: true }));
  if (version < INITIAL_MIGRATION_VERSION) {
    db.transaction(() => {
      migrateInitial(db);
      db.pragma(`user_version = ${INITIAL_MIGRATION_VERSION}`);
    })();
  }
  const afterInitial = Number(db.pragma("user_version", { simple: true }));
  if (afterInitial < MEMORIES_MIGRATION_VERSION) {
    db.transaction(() => {
      migrateMemories(db);
      db.pragma(`user_version = ${MEMORIES_MIGRATION_VERSION}`);
    })();
  }
  const afterMemories = Number(db.pragma("user_version", { simple: true }));
  if (afterMemories < CHAT_SESSIONS_MIGRATION_VERSION) {
    db.transaction(() => {
      migrateChatSessions(db);
      db.pragma(`user_version = ${CHAT_SESSIONS_MIGRATION_VERSION}`);
    })();
  }
  const afterSessions = Number(db.pragma("user_version", { simple: true }));
  if (afterSessions < CHAT_SESSION_META_MIGRATION_VERSION) {
    db.transaction(() => {
      migrateChatSessionMeta(db);
      db.pragma(`user_version = ${CHAT_SESSION_META_MIGRATION_VERSION}`);
    })();
  }
  return { db, close: () => db.close() };
}
