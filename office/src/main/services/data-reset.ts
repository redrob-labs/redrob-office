import type { Store } from "@redrob/store";

export interface WipeLocalDataCounts {
  documents: number;
  fields: number;
  corrections: number;
  findings: number;
  runs: number;
  chats: number;
}

function countRows(store: Store, table: string): number {
  const row = store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as
    | { n?: number }
    | undefined;
  return Number(row?.n ?? 0);
}

/**
 * Removes extracted documents, derived rows, and chat sessions.
 * Artifacts / models are cleared separately by the wipe IPC handler.
 * Floor / office chat lives in its own SQLite and is cleared there too.
 */
export function wipeLocalData(store: Store): WipeLocalDataCounts {
  const counts: WipeLocalDataCounts = {
    documents: countRows(store, "documents"),
    fields: countRows(store, "fields"),
    corrections: countRows(store, "corrections"),
    findings: countRows(store, "findings"),
    runs: countRows(store, "runs"),
    chats: countRows(store, "chat_sessions"),
  };

  store.db.transaction(() => {
    store.db.prepare("DELETE FROM corrections").run();
    store.db.prepare("DELETE FROM entity_links").run();
    store.db.prepare("DELETE FROM entities").run();
    store.db.prepare("DELETE FROM fields").run();
    store.db.prepare("DELETE FROM documents").run();
    store.db.prepare("DELETE FROM findings").run();
    store.db.prepare("DELETE FROM runs").run();
    store.db.prepare("DELETE FROM chat_sessions").run();
  })();

  return counts;
}
