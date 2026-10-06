/**
 * Comments in a live file: the thread list lives in the shared Y.Doc's
 * "comments" map, keyed by comment id. Anchors are comment marks in the
 * shared text, so they travel with live typing; this map carries the words,
 * authors, dates, replies and resolved state.
 *
 * Someone who may comment but not edit cannot write the shared document, so
 * their comments go through the sync service, which writes them here with
 * the author it verified (`authorSub`) and, for a new thread, an `anchor`:
 * the commented range as relative positions. The first view that may edit
 * turns that anchor into a comment mark and drops it (see `materialise`).
 */
import * as Y from 'yjs'
import type { CommentInfo } from '@genoffice/docx-engine'
import type { LiveCursor } from '@genoffice/sync-client'

export const COMMENTS_MAP = 'comments'
const LOCAL = Symbol('local-comments')

/** what the service adds to an entry, kept alongside the comment */
export interface SharedExtras {
  authorSub?: string
  anchor?: LiveCursor
}
type Entry = CommentInfo & SharedExtras

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Only the fields a comment carries, so nothing else rides along into the shared map. */
function clean(c: CommentInfo): CommentInfo {
  const out: CommentInfo = { id: String(c.id), author: String(c.author ?? ''), text: String(c.text ?? '') }
  if (c.initials) out.initials = String(c.initials)
  if (c.date) out.date = String(c.date)
  if (c.parentId) out.parentId = String(c.parentId)
  if (c.done) out.done = true
  if (c.paraId) out.paraId = String(c.paraId)
  return out
}

/** the service's fields of an entry, so a view's own list never drops them */
function extras(e: Entry | undefined): SharedExtras {
  const out: SharedExtras = {}
  if (typeof e?.authorSub === 'string') out.authorSub = e.authorSub
  if (e?.anchor && typeof e.anchor === 'object') out.anchor = e.anchor
  return out
}

/** Comments in Word's order: by numeric id. */
export function commentsFromMap(map: Y.Map<CommentInfo>): CommentInfo[] {
  return [...map.values()].map(clean).sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0))
}

/**
 * A comment id no one else is likely to pick at the same moment. Word ids
 * are decimal numbers; a random nine-digit one keeps two people who comment
 * at once from colliding, where "largest plus one" would not.
 */
export function liveCommentId(existing: readonly CommentInfo[], random: () => number = Math.random): string {
  const taken = new Set(existing.map((c) => c.id))
  for (;;) {
    const id = String(100_000_000 + Math.floor(random() * 899_999_999))
    if (!taken.has(id)) return id
  }
}

export interface CommentsBinding {
  /** write this view's list into the shared map (only what changed) */
  push(list: readonly CommentInfo[]): void
  destroy(): void
}

/**
 * Binds the comment list to the shared map. On start, an empty map takes
 * this view's comments when `seed`; otherwise the map wins. Remote changes
 * call `onRemote` with the whole list.
 *
 * `materialise`, in a view that may edit, is offered every entry that still
 * carries an anchor; when it marks the text, the anchor is dropped.
 */
export function bindComments(
  doc: Y.Doc,
  opts: {
    initial: readonly CommentInfo[]
    seed: boolean
    onRemote: (list: CommentInfo[]) => void
    materialise?: (id: string, anchor: LiveCursor) => boolean
  },
): CommentsBinding {
  const map = doc.getMap<Entry>(COMMENTS_MAP)
  const push = (list: readonly CommentInfo[]) => {
    const next = new Map(list.map((c) => [String(c.id), clean(c)]))
    const changes: Array<() => void> = []
    for (const [id, c] of next) {
      const had = map.get(id)
      const entry: Entry = { ...c, ...extras(had) }
      if (!same(had, entry)) changes.push(() => map.set(id, entry))
    }
    for (const id of [...map.keys()]) if (!next.has(id)) changes.push(() => map.delete(id))
    if (changes.length) doc.transact(() => changes.forEach((f) => f()), LOCAL)
  }
  const anchorPending = () => {
    if (!opts.materialise) return
    for (const [id, e] of [...map.entries()]) {
      if (!e.anchor || !opts.materialise(id, e.anchor)) continue
      const { anchor: _done, ...rest } = map.get(id) ?? e
      doc.transact(() => map.set(id, rest), LOCAL)
    }
  }
  // marking the text dispatches an editor change, which the live binding
  // writes back to the document: never from inside a Yjs observer
  let destroyed = false
  let queued: ReturnType<typeof setTimeout> | null = null
  const later = () => {
    if (!opts.materialise || queued) return
    queued = setTimeout(() => {
      queued = null
      if (!destroyed) anchorPending()
    }, 0)
  }
  if (map.size === 0) {
    if (opts.seed && opts.initial.length) push(opts.initial)
  } else {
    opts.onRemote(commentsFromMap(map))
    later()
  }
  const observer = (_e: Y.YMapEvent<Entry>, tr: Y.Transaction) => {
    if (tr.origin === LOCAL) return
    opts.onRemote(commentsFromMap(map))
    later()
  }
  map.observe(observer)
  return {
    push,
    destroy: () => {
      destroyed = true
      if (queued) clearTimeout(queued)
      map.unobserve(observer)
    },
  }
}
