import { join } from "node:path";
import { openStore, type Store } from "@redrob/store";

/**
 * One SQLite handle per data dir, reused across tool calls.
 *
 * The main process already holds the authoritative connection; this is a second
 * reader/writer on the same WAL file. better-sqlite3 calls are synchronous, so
 * within this single process the two connections never run a statement at the
 * same instant, and a write here is visible to the main connection's next read.
 * Caching avoids re-running the migration probe on every call.
 */
let cached: { path: string; store: Store } | null = null;

export function toolStore(userDataPath: string): Store {
  const path = join(userDataPath, "redrob.sqlite");
  if (cached?.path === path) return cached.store;
  cached?.store.close();
  cached = { path, store: openStore(path) };
  return cached.store;
}

/** Test-only: drop the cached handle so a temp dir is not held open. */
export function closeToolStore(): void {
  cached?.store.close();
  cached = null;
}
