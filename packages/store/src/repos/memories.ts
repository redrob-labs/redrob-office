import { randomUUID } from "node:crypto";
import type { Store } from "../db.js";

export type MemorySource = "manual" | "import";

export interface Memory {
  id: string;
  body: string;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
}

export interface AddMemoryInput {
  body: string;
  source?: MemorySource;
}

function toMemory(row: Record<string, unknown>): Memory {
  const source = String(row.source);
  return {
    id: String(row.id),
    body: String(row.body),
    source: source === "import" ? "import" : "manual",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeBody(body: string): string {
  return body.replace(/\r\n/g, "\n").trim();
}

export function listMemories(store: Store, limit = 200): Memory[] {
  const capped = Math.max(1, Math.min(Math.floor(limit), 500));
  return (
    store.db
      .prepare(
        `SELECT id, body, source, created_at, updated_at
         FROM memories
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(capped) as Record<string, unknown>[]
  ).map(toMemory);
}

export function addMemory(store: Store, input: AddMemoryInput): Memory {
  const body = normalizeBody(input.body);
  if (!body) throw new Error("Memory body is empty");
  const now = new Date().toISOString();
  const memory: Memory = {
    id: `mem_${randomUUID()}`,
    body,
    source: input.source ?? "manual",
    createdAt: now,
    updatedAt: now,
  };
  store.db
    .prepare(
      `INSERT INTO memories (id, body, source, created_at, updated_at)
       VALUES (@id, @body, @source, @createdAt, @updatedAt)`,
    )
    .run(memory);
  return memory;
}

export function updateMemory(store: Store, id: string, body: string): Memory | null {
  const next = normalizeBody(body);
  if (!next) throw new Error("Memory body is empty");
  const existing = store.db
    .prepare(`SELECT id, body, source, created_at, updated_at FROM memories WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!existing) return null;
  const updatedAt = new Date().toISOString();
  store.db
    .prepare(`UPDATE memories SET body = @body, updated_at = @updatedAt WHERE id = @id`)
    .run({ id, body: next, updatedAt });
  return {
    ...toMemory(existing),
    body: next,
    updatedAt,
  };
}

export function deleteMemory(store: Store, id: string): boolean {
  const result = store.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function importMemories(
  store: Store,
  bodies: string[],
): { imported: number; skipped: number; memories: Memory[] } {
  const existing = new Set(
    (
      store.db.prepare(`SELECT body FROM memories`).all() as Array<{ body: string }>
    ).map((row) => normalizeBody(row.body).toLowerCase()),
  );
  const memories: Memory[] = [];
  let skipped = 0;
  const insert = store.db.prepare(
    `INSERT INTO memories (id, body, source, created_at, updated_at)
     VALUES (@id, @body, @source, @createdAt, @updatedAt)`,
  );

  store.db.transaction(() => {
    for (const raw of bodies) {
      const body = normalizeBody(raw);
      if (!body) {
        skipped += 1;
        continue;
      }
      const key = body.toLowerCase();
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      existing.add(key);
      const now = new Date().toISOString();
      const memory: Memory = {
        id: `mem_${randomUUID()}`,
        body,
        source: "import",
        createdAt: now,
        updatedAt: now,
      };
      insert.run(memory);
      memories.push(memory);
    }
  })();

  return { imported: memories.length, skipped, memories };
}
