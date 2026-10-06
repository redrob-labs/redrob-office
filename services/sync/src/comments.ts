/**
 * Comments through the API, for people who may comment but not edit. A live
 * session below edit is read-only, so a commenter cannot write the shared
 * Y.Doc themselves; the service writes the comment into the document's
 * "comments" map for them, stamped with who the token says they are.
 *
 * A new thread's place in the text travels as Yjs relative positions (the
 * same JSON a live cursor uses). The first view that may edit turns that
 * into a comment mark in the shared text and drops the `anchor` field.
 */
import { randomInt } from 'node:crypto'
import type { Hocuspocus } from '@hocuspocus/server'
import * as Y from 'yjs'
import type { Identity } from './auth.ts'
import type { Repo } from './repo.ts'

/** the shared map's name, as the Docs editor binds it */
export const COMMENTS_MAP = 'comments'

export interface SharedComment {
  id: string
  author: string
  /** the account that wrote it, stamped by the service */
  authorSub?: string
  text: string
  date: string
  parentId?: string
  done?: boolean
  /** where a new thread sits, until a view that may edit marks the text */
  anchor?: { anchor: unknown; head: unknown }
}

/** Reads or changes one file's live document, wherever it is held. */
export interface LiveDocs {
  change<T>(fileId: string, fn: (doc: Y.Doc) => T): Promise<T>
}

/** Through the running live server: an open room sees the change at once; a closed one is loaded and stored. */
export function hocuspocusDocs(h: Hocuspocus): LiveDocs {
  return {
    async change<T>(fileId: string, fn: (doc: Y.Doc) => T): Promise<T> {
      const conn = await h.openDirectConnection(fileId, { service: true })
      try {
        const box: { value?: T } = {}
        await conn.transact((doc) => {
          box.value = fn(doc)
        })
        return box.value as T
      } finally {
        await conn.disconnect()
      }
    },
  }
}

/** Straight against the stored state, for tests and tools that run without the live server. */
export function repoDocs(repo: Repo): LiveDocs {
  return {
    async change(fileId, fn) {
      const doc = new Y.Doc()
      const state = await repo.loadDoc(fileId)
      if (state) Y.applyUpdate(doc, state)
      const before = Y.encodeStateVector(doc)
      const out = fn(doc)
      if (Y.encodeStateAsUpdate(doc, before).byteLength > 2) await repo.storeDoc(fileId, Y.encodeStateAsUpdate(doc))
      doc.destroy()
      return out
    },
  }
}

export class CommentError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const MAX_TEXT = 10_000

const cleanText = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, MAX_TEXT) : ''

/** A relative position as Yjs writes it to JSON; anything else (or anything large) is refused. */
function relPos(v: unknown): boolean {
  if (!v || typeof v !== 'object' || JSON.stringify(v).length > 1024) return false
  try {
    Y.createRelativePositionFromJSON(v)
    return true
  } catch {
    return false
  }
}

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

function mapOf(doc: Y.Doc) {
  return doc.getMap<SharedComment>(COMMENTS_MAP)
}

/** Word ids are decimal; a random nine-digit one does not collide with someone commenting at once. */
function freshId(taken: (id: string) => boolean): string {
  for (;;) {
    const id = String(randomInt(100_000_000, 999_999_999))
    if (!taken(id)) return id
  }
}

export function listComments(doc: Y.Doc): SharedComment[] {
  return [...mapOf(doc).values()].sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0))
}

export interface NewComment {
  text: unknown
  parentId?: unknown
  anchor?: unknown
}

/** Adds a thread (with an anchor) or a reply (to a thread that exists). */
export function addComment(doc: Y.Doc, input: NewComment, who: Identity): SharedComment {
  const text = cleanText(input.text)
  if (!text) throw new CommentError(400, 'A comment needs some text.')
  const map = mapOf(doc)
  const c: SharedComment = { id: freshId((id) => map.has(id)), author: who.name, authorSub: who.sub, text, date: now() }
  if (input.parentId !== undefined && input.parentId !== null) {
    const parent = typeof input.parentId === 'string' ? map.get(input.parentId) : undefined
    if (!parent || parent.parentId) throw new CommentError(404, 'That comment is no longer here.')
    c.parentId = parent.id
  } else {
    const a = input.anchor as { anchor?: unknown; head?: unknown } | undefined
    if (!a || !relPos(a.anchor) || !relPos(a.head)) throw new CommentError(400, 'Select the text the comment is about.')
    c.anchor = { anchor: a.anchor, head: a.head }
  }
  map.set(c.id, c)
  return c
}

/**
 * Resolve or reopen a whole thread (anyone who may comment), or change a
 * comment's words (only the person who wrote it).
 */
export function updateComment(doc: Y.Doc, id: string, patch: { done?: unknown; text?: unknown }, who: Identity): SharedComment {
  const map = mapOf(doc)
  const c = map.get(id)
  if (!c) throw new CommentError(404, 'That comment is no longer here.')
  if (patch.text !== undefined) {
    if (c.authorSub !== who.sub) throw new CommentError(403, 'Only the person who wrote a comment can change its words.')
    const text = cleanText(patch.text)
    if (!text) throw new CommentError(400, 'A comment needs some text.')
    map.set(id, { ...c, text })
  }
  if (patch.done !== undefined) {
    if (typeof patch.done !== 'boolean') throw new CommentError(400, 'Resolved is true or false.')
    const thread = c.parentId ?? c.id
    for (const x of [...map.values()]) {
      if (x.id !== thread && x.parentId !== thread) continue
      const next = { ...map.get(x.id)! }
      if (patch.done) next.done = true
      else delete next.done
      map.set(x.id, next)
    }
  }
  return map.get(id)!
}
