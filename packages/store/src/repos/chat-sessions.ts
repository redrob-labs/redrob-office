import type { Store } from "../db.js";

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  pinned: boolean;
  titleLocked: boolean;
}

export interface ChatSessionRecord extends ChatSessionSummary {
  /** Opaque JSON array of UI chat messages (desk renderer shape). */
  messagesJson: string;
}

export interface SaveChatSessionInput {
  id: string;
  title?: string;
  messagesJson: string;
}

function toSummary(row: Record<string, unknown>): ChatSessionSummary {
  let messageCount = 0;
  try {
    const parsed = JSON.parse(String(row.messages_json ?? "[]")) as unknown;
    if (Array.isArray(parsed)) messageCount = parsed.length;
  } catch {
    messageCount = 0;
  }
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    messageCount,
    pinned: Number(row.pinned ?? 0) === 1,
    titleLocked: Number(row.title_locked ?? 0) === 1,
  };
}

function toRecord(row: Record<string, unknown>): ChatSessionRecord {
  return {
    ...toSummary(row),
    messagesJson: String(row.messages_json ?? "[]"),
  };
}

export function listChatSessions(store: Store, limit = 50): ChatSessionSummary[] {
  const capped = Math.max(1, Math.min(Math.floor(limit), 200));
  return (
    store.db
      .prepare(
        `SELECT id, title, messages_json, created_at, updated_at, pinned, title_locked
         FROM chat_sessions
         ORDER BY pinned DESC, updated_at DESC
         LIMIT ?`,
      )
      .all(capped) as Record<string, unknown>[]
  ).map(toSummary);
}

export function getChatSession(store: Store, id: string): ChatSessionRecord | null {
  const row = store.db
    .prepare(
      `SELECT id, title, messages_json, created_at, updated_at, pinned, title_locked
       FROM chat_sessions WHERE id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? toRecord(row) : null;
}

export function saveChatSession(store: Store, input: SaveChatSessionInput): ChatSessionRecord {
  const id = input.id.trim();
  if (!id) throw new Error("Chat session id is empty");
  let messagesJson = input.messagesJson?.trim() || "[]";
  try {
    const parsed = JSON.parse(messagesJson) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not array");
    messagesJson = JSON.stringify(parsed);
  } catch {
    throw new Error("Chat session messages must be a JSON array");
  }
  const title = (input.title ?? "").trim().slice(0, 120);
  const now = new Date().toISOString();
  const existing = store.db
    .prepare(
      `SELECT created_at, title, pinned, title_locked, messages_json, updated_at
       FROM chat_sessions WHERE id = ?`,
    )
    .get(id) as
    | {
        created_at?: string;
        title?: string;
        pinned?: number;
        title_locked?: number;
        messages_json?: string;
        updated_at?: string;
      }
    | undefined;
  const createdAt = existing?.created_at ?? now;
  const titleLocked = Number(existing?.title_locked ?? 0) === 1;
  const pinned = Number(existing?.pinned ?? 0) === 1;
  // The title is only ever set on create here, and only changed afterwards by an
  // explicit rename (locks) or the soft autotitle (does not lock). A plain save
  // no longer rewrites it: otherwise every autosave clobbered a good title with
  // the raw first-message derivation, which is why autotitle had to lock — and
  // that lock then froze titles that were never a deliberate user choice.
  const nextTitle = existing ? String(existing.title ?? "") : title;

  // Opening a chat used to rewrite updated_at with an identical transcript and
  // bounce that room to the top of the sidebar. Keep recency for real edits only.
  if (existing && String(existing.messages_json ?? "") === messagesJson) {
    const updatedAt = String(existing.updated_at ?? createdAt);
    return {
      id,
      title: nextTitle,
      messagesJson,
      createdAt,
      updatedAt,
      messageCount: (JSON.parse(messagesJson) as unknown[]).length,
      pinned,
      titleLocked,
    };
  }

  store.db
    .prepare(
      `INSERT INTO chat_sessions (id, title, messages_json, created_at, updated_at, pinned, title_locked)
       VALUES (@id, @title, @messagesJson, @createdAt, @updatedAt, @pinned, @titleLocked)
       ON CONFLICT(id) DO UPDATE SET
         messages_json = excluded.messages_json,
         updated_at = excluded.updated_at`,
    )
    .run({
      id,
      title: nextTitle,
      messagesJson,
      createdAt,
      updatedAt: now,
      pinned: pinned ? 1 : 0,
      titleLocked: titleLocked ? 1 : 0,
    });

  return {
    id,
    title: nextTitle,
    messagesJson,
    createdAt,
    updatedAt: now,
    messageCount: (JSON.parse(messagesJson) as unknown[]).length,
    pinned,
    titleLocked,
  };
}

/**
 * Set a generated title without locking it.
 *
 * This is what the auto-titler uses: unlike a user rename it must not mark the
 * title as a deliberate choice, so the system stays free to refine it later and
 * it never masquerades as a lock. A title the person actually renamed wins.
 */
export function autotitleChatSession(
  store: Store,
  id: string,
  title: string,
): ChatSessionSummary | null {
  const existing = getChatSession(store, id);
  if (!existing) return null;
  if (existing.titleLocked) return existing;
  const next = title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!next) return existing;
  const updatedAt = new Date().toISOString();
  store.db
    .prepare(
      `UPDATE chat_sessions
       SET title = @title, updated_at = @updatedAt
       WHERE id = @id AND title_locked = 0`,
    )
    .run({ id, title: next, updatedAt });
  return { ...existing, title: next, updatedAt, titleLocked: false };
}

export function renameChatSession(
  store: Store,
  id: string,
  title: string,
): ChatSessionSummary | null {
  const existing = getChatSession(store, id);
  if (!existing) return null;
  const next = title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!next) throw new Error("Chat title is empty");
  const updatedAt = new Date().toISOString();
  store.db
    .prepare(
      `UPDATE chat_sessions
       SET title = @title, title_locked = 1, updated_at = @updatedAt
       WHERE id = @id`,
    )
    .run({ id, title: next, updatedAt });
  return {
    id: existing.id,
    title: next,
    createdAt: existing.createdAt,
    updatedAt,
    messageCount: existing.messageCount,
    pinned: existing.pinned,
    titleLocked: true,
  };
}

export function setChatSessionPinned(
  store: Store,
  id: string,
  pinned: boolean,
): ChatSessionSummary | null {
  const existing = getChatSession(store, id);
  if (!existing) return null;
  store.db
    .prepare(`UPDATE chat_sessions SET pinned = @pinned WHERE id = @id`)
    .run({ id, pinned: pinned ? 1 : 0 });
  return {
    ...existing,
    pinned,
  };
}

export function deleteChatSession(store: Store, id: string): boolean {
  const result = store.db.prepare(`DELETE FROM chat_sessions WHERE id = ?`).run(id);
  return result.changes > 0;
}
