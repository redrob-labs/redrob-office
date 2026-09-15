import { createRequire } from "node:module";

/**
 * Minimal synchronous SQLite surface shared by `node:sqlite` (plain Node and
 * Electron 35 both ship it) and `better-sqlite3` (already a workspace
 * dependency via @redrob/store). No external broker: the queue is a local file.
 */
export interface FloorStatement {
  run(...params: unknown[]): { changes: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface FloorDb {
  exec(sql: string): void;
  prepare(sql: string): FloorStatement;
  close(): void;
  readonly driver: "node:sqlite" | "better-sqlite3";
}

type NodeSqliteModule = {
  DatabaseSync: new (
    path: string,
    options?: { open?: boolean },
  ) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number | bigint };
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
    close(): void;
  };
};

function tryNodeSqlite(path: string): FloorDb | null {
  try {
    const require_ = createRequire(import.meta.url);
    const mod = require_("node:sqlite") as NodeSqliteModule;
    const db = new mod.DatabaseSync(path);
    return {
      driver: "node:sqlite",
      exec: (sql) => db.exec(sql),
      prepare: (sql) => db.prepare(sql) as FloorStatement,
      close: () => db.close(),
    };
  } catch {
    return null;
  }
}

function tryBetterSqlite(path: string): FloorDb | null {
  try {
    const require_ = createRequire(import.meta.url);
    const Database = require_("better-sqlite3") as new (p: string) => {
      exec(sql: string): void;
      prepare(sql: string): FloorStatement;
      close(): void;
    };
    const db = new Database(path);
    return {
      driver: "better-sqlite3",
      exec: (sql) => db.exec(sql),
      prepare: (sql) => db.prepare(sql),
      close: () => db.close(),
    };
  } catch {
    return null;
  }
}

export function openFloorDb(path: string): FloorDb {
  const db = tryNodeSqlite(path) ?? tryBetterSqlite(path);
  if (!db) {
    throw new Error(
      "No SQLite driver available. Expected node:sqlite (Node >= 22.13) or better-sqlite3.",
    );
  }
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
