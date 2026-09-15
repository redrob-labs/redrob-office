import type { Store } from "../db.js";

export interface AuditEntry {
  id: string; at: string; action: string; payloadJson: string;
}

export function appendAudit(store: Store, entry: AuditEntry): void {
  store.db.prepare("INSERT INTO audit (id, at, action, payload_json) VALUES (@id, @at, @action, @payloadJson)").run(entry);
}

export function listAudit(store: Store): AuditEntry[] {
  return (store.db.prepare("SELECT * FROM audit ORDER BY at").all() as Record<string, unknown>[]).map((row) => ({
    id: String(row.id), at: String(row.at), action: String(row.action), payloadJson: String(row.payload_json),
  }));
}
