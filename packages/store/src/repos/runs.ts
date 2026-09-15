import type { Store } from "../db.js";

export interface Run {
  id: string; workspaceId: string; engine: string; startedAt: string; finishedAt: string | null;
  itemCount: number; timingJson: string | null; tierStart: string; tierEnd: string | null; tierChanged: boolean;
}

function toRun(row: Record<string, unknown> | undefined): Run | undefined {
  return row ? {
    id: String(row.id), workspaceId: String(row.workspace_id), engine: String(row.engine),
    startedAt: String(row.started_at), finishedAt: row.finished_at === null ? null : String(row.finished_at),
    itemCount: Number(row.item_count), timingJson: row.timing_json === null ? null : String(row.timing_json),
    tierStart: String(row.tier_start), tierEnd: row.tier_end === null ? null : String(row.tier_end),
    tierChanged: Number(row.tier_changed) === 1,
  } : undefined;
}

export function createRun(store: Store, run: Run): Run {
  store.db.prepare(`
    INSERT INTO runs (id, workspace_id, engine, started_at, finished_at, item_count, timing_json, tier_start, tier_end, tier_changed)
    VALUES (@id, @workspaceId, @engine, @startedAt, @finishedAt, @itemCount, @timingJson, @tierStart, @tierEnd, @tierChanged)
  `).run({ ...run, tierChanged: Number(run.tierChanged) });
  return getRun(store, run.id)!;
}

export function updateRun(store: Store, run: Run): Run | undefined {
  store.db.prepare(`
    UPDATE runs SET finished_at=@finishedAt, item_count=@itemCount, timing_json=@timingJson,
      tier_end=@tierEnd, tier_changed=@tierChanged WHERE id=@id
  `).run({ ...run, tierChanged: Number(run.tierChanged) });
  return getRun(store, run.id);
}

export function getRun(store: Store, id: string): Run | undefined {
  return toRun(store.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as Record<string, unknown> | undefined);
}
