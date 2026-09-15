import type { FloorDb } from "./sqlite.js";

export const FLOOR_SCHEMA_VERSION = 7;

/**
 * One SQLite file holds the whole Floor: the channel list, the paced message
 * queue, task checkpoints, trace ledgers, meetings, the approval tray and
 * runtime state. Remote hosts run headless against this identical schema.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS floor_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  system INTEGER NOT NULL DEFAULT 0,
  member_ids TEXT NOT NULL DEFAULT '["assistant"]',
  default_member_id TEXT NOT NULL DEFAULT 'assistant'
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT '',
  tone_hints TEXT NOT NULL DEFAULT '',
  permission TEXT NOT NULL DEFAULT 'write',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS channel_events (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_channel_events_channel
  ON channel_events (channel_id, ts);

CREATE TABLE IF NOT EXISTS memories_channel (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'channel',
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_channel
  ON memories_channel (channel_id, member_id, created_at);

CREATE TABLE IF NOT EXISTS queue_messages (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  depth INTEGER NOT NULL,
  type TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  channel_id TEXT NOT NULL DEFAULT 'general',
  created_at INTEGER NOT NULL,
  not_before INTEGER NOT NULL,
  meeting_id TEXT,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  claimed_at INTEGER,
  completed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_queue_ready
  ON queue_messages (state, not_before);
CREATE INDEX IF NOT EXISTS idx_queue_trace
  ON queue_messages (trace_id);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  root_task_id TEXT,
  created_at INTEGER NOT NULL,
  token_budget INTEGER NOT NULL,
  tokens_spent INTEGER NOT NULL DEFAULT 0,
  max_depth INTEGER NOT NULL,
  deepest INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'open',
  steer TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  not_before INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER,
  finished_at INTEGER,
  checkpoint TEXT,
  result TEXT,
  payload TEXT,
  tokens INTEGER NOT NULL DEFAULT 0,
  seat INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks (state);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  participants TEXT NOT NULL,
  round INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'open',
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  outcome TEXT
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  task_id TEXT,
  staff_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  headline TEXT NOT NULL,
  detail TEXT NOT NULL,
  evidence TEXT NOT NULL,
  dissent TEXT,
  options TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  resolved_at INTEGER,
  decision TEXT
);
CREATE INDEX IF NOT EXISTS idx_approvals_state ON approvals (state);

CREATE TABLE IF NOT EXISTS directives (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  trace_id TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  applies_from INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS budget_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_index INTEGER NOT NULL,
  staff_id TEXT NOT NULL,
  trace_id TEXT,
  tokens INTEGER NOT NULL,
  cost_micros INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_budget_day ON budget_ledger (day_index);

CREATE TABLE IF NOT EXISTS gate_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  gate TEXT NOT NULL,
  passed INTEGER NOT NULL,
  rework INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  layer TEXT NOT NULL,
  personality TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS floor_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  paused INTEGER NOT NULL DEFAULT 0,
  production_halted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  interruptions TEXT NOT NULL DEFAULT '[]'
);
`;

/** Columns added after v1. `ALTER TABLE ADD COLUMN` is a no-op error if present. */
const ADDED_COLUMNS: ReadonlyArray<{ table: string; column: string; ddl: string }> = [
  { table: "tasks", column: "not_before", ddl: "INTEGER NOT NULL DEFAULT 0" },
  { table: "tasks", column: "payload", ddl: "TEXT" },
  { table: "queue_messages", column: "channel_id", ddl: "TEXT NOT NULL DEFAULT 'general'" },
  {
    table: "channels",
    column: "member_ids",
    ddl: "TEXT NOT NULL DEFAULT '[\"assistant\"]'",
  },
  {
    table: "channels",
    column: "default_member_id",
    ddl: "TEXT NOT NULL DEFAULT 'assistant'",
  },
  {
    table: "team_members",
    column: "permission",
    ddl: "TEXT NOT NULL DEFAULT 'write'",
  },
  // A removed teammate is deactivated, not deleted, so their past messages keep
  // a name and a face. This flag is what tells the two apart.
  {
    table: "team_members",
    column: "active",
    ddl: "INTEGER NOT NULL DEFAULT 1",
  },
];

/** Indexes that reference ADDED_COLUMNS — create only after those columns exist. */
const POST_COLUMN_INDEXES: ReadonlyArray<string> = [
  "CREATE INDEX IF NOT EXISTS idx_queue_channel ON queue_messages (channel_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_ready ON tasks (state, not_before)",
];

function hasColumn(db: FloorDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  return rows.some((row) => row.name === column);
}

function hasTable(db: FloorDb, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { name?: unknown } | undefined;
  return Boolean(row?.name);
}

/**
 * The night shift is gone, and with it the `shift` axis every row used to
 * carry. Dropping the columns is what makes that true on disk as well as in
 * the types: a nullable leftover column is an invitation to start writing to
 * it again.
 */
function dropShiftColumns(db: FloorDb): void {
  // The composite index names the column, and SQLite refuses to drop a column
  // an index still mentions.
  db.exec("DROP INDEX IF EXISTS idx_budget_day");
  for (const table of ["queue_messages", "tasks", "approvals", "budget_ledger"]) {
    if (!hasTable(db, table) || !hasColumn(db, table, "shift")) continue;
    db.exec(`ALTER TABLE ${table} DROP COLUMN shift`);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_budget_day ON budget_ledger (day_index)");
}

/** `shift_state` carried the night toggle; `floor_state` is what is left of it. */
function migrateShiftState(db: FloorDb): void {
  if (!hasTable(db, "shift_state")) return;
  db.exec(
    `INSERT OR IGNORE INTO floor_state (id, paused, production_halted, updated_at, interruptions)
     SELECT 1, paused, production_halted, updated_at, interruptions FROM shift_state WHERE id = 1`,
  );
  db.exec("DROP TABLE shift_state");
}

/** The schema version already written to this file, or 0 for a fresh disk. */
function storedSchemaVersion(db: FloorDb): number {
  if (!hasTable(db, "floor_meta")) return 0;
  const row = db
    .prepare("SELECT value FROM floor_meta WHERE key = 'schema_version'")
    .get() as { value?: unknown } | undefined;
  const parsed = Number(row?.value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Drop every application table so the DDL below rebuilds the file from zero. */
function dropAllTables(db: FloorDb): void {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as Array<{ name?: unknown }>;
  db.exec("PRAGMA foreign_keys = OFF");
  for (const row of rows) {
    if (typeof row.name === "string") db.exec(`DROP TABLE IF EXISTS "${row.name}"`);
  }
}

export function migrateFloorDb(db: FloorDb): void {
  // A file left on an older schema is cleared and rebuilt rather than nudged
  // column by column: the data model has moved enough that a fresh migration is
  // the honest way to land on the current shape.
  const prior = storedSchemaVersion(db);
  if (prior > 0 && prior < FLOOR_SCHEMA_VERSION) dropAllTables(db);
  db.exec(DDL);
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    if (hasColumn(db, table, column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
  for (const ddl of POST_COLUMN_INDEXES) {
    db.exec(ddl);
  }
  dropShiftColumns(db);
  migrateShiftState(db);
  // Existing channels become 1:1 with the assistant. Multi-member rooms are
  // created explicitly after this, never by inheriting the old full roster.
  if (hasColumn(db, "channels", "member_ids")) {
    db.exec(
      `UPDATE channels
       SET member_ids = '["assistant"]', default_member_id = 'assistant'
       WHERE member_ids IS NULL OR member_ids = '' OR member_ids = '[]'`,
    );
  }
  // Job bundles became a reach: a teammate that could only gather reads, and
  // anyone who could produce a file writes. The old column stays until the
  // rewrite is read, then goes, because a teammate has one answer here.
  if (hasColumn(db, "team_members", "presets_json")) {
    db.exec(
      `UPDATE team_members
       SET permission = CASE
         WHEN presets_json LIKE '%research%' THEN 'read'
         WHEN builtin = 1 THEN 'full'
         ELSE 'write'
       END`,
    );
    db.exec("ALTER TABLE team_members DROP COLUMN presets_json");
  }
  db.prepare(
    "INSERT OR REPLACE INTO floor_meta (key, value) VALUES ('schema_version', ?)",
  ).run(String(FLOOR_SCHEMA_VERSION));
}
