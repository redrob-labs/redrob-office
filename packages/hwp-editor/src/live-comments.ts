// Live comment sync (spec task 5.5, R7.3): comments reach the others in the
// room as they are written, not only with the next save.
//
// The shared map `hwp:comments` holds one record per comment, keyed by its
// live id (`CommentMeta.live`, or `n<memo number>` for a comment in the file
// everyone opened). A record carries what a memo and its metadata hold, and a
// root comment's anchor as Yjs relative positions in the section text, so it
// stays on its words while people type. Each view reconciles both ways:
//   - after a comment command here, it writes its comments into the map;
//   - when the map changes, it adds, edits, resolves or deletes memos to match,
//     with origin 'remote', so someone else's comment never marks it unsaved.
// A deleted comment keeps a tombstone record, so a late view does not bring it back.
import * as Y from 'yjs'
import type { ParagraphTarget } from '@genoffice/hwp-core'
import type { Session } from './session'
import { Comments, posOfTarget, targetOf } from './comments'
import type { LiveBinding } from './live'

export const LIVE_COMMENTS_KEY = 'hwp:comments'
const LIVE_COMMENTS_ORIGIN = Symbol('hwp-live-comments')

export interface CommentRecord {
  author: string
  body: string
  at?: string
  mentions?: string[]
  /** live id of the thread's root, for a reply */
  parent?: string
  resolved?: boolean
  /** a root's anchor: relative positions in the section text, or the plain address (in a table) */
  anchor?: { section: number; start: unknown; end: unknown } | { target: ParagraphTarget; start: number; end: number }
  deleted?: true
}

export class LiveComments {
  readonly map: Y.Map<CommentRecord>
  /** live ids this view has seen as its own comment, so a missing one means deleted here */
  private readonly known = new Set<string>()
  private applying = false
  private readonly offs: Array<() => void> = []

  constructor(
    readonly comments: Comments,
    readonly ydoc: Y.Doc,
    private readonly binding: LiveBinding,
    private readonly opts: { readOnly?: boolean } = {},
  ) {
    this.map = ydoc.getMap<CommentRecord>(LIVE_COMMENTS_KEY)
    this.pull()
    this.push()
    const onMap = (_e: Y.YMapEvent<CommentRecord>, tr: Y.Transaction) => {
      if (tr.origin !== LIVE_COMMENTS_ORIGIN) this.pull()
    }
    this.map.observe(onMap)
    this.offs.push(() => this.map.unobserve(onMap))
    this.offs.push(
      comments.session.onChange((c) => {
        if (this.applying || c.origin === 'remote') return
        if (c.command.startsWith('review:memo-') || c.command === 'edit:undo' || c.command === 'edit:redo') this.push()
      }),
    )
  }

  private get session(): Session {
    return this.comments.session
  }

  /** This view's comments as records. */
  private local(): Map<string, CommentRecord> {
    const out = new Map<string, CommentRecord>()
    for (const t of this.comments.threads()) {
      const rootId = this.comments.liveIdOf(t.id)
      const range = this.comments.range(t)
      const a = this.binding.relative(range.anchor)
      const b = this.binding.relative(range.head)
      const anchor: CommentRecord['anchor'] =
        a && b ? { section: a.section, start: Y.relativePositionToJSON(a.rel), end: Y.relativePositionToJSON(b.rel) } : { target: t.anchor.target, start: t.anchor.start, end: t.anchor.end }
      out.set(rootId, { author: t.root.author, body: t.root.text, ...(t.root.at ? { at: t.root.at } : {}), ...(t.root.mentions.length ? { mentions: t.root.mentions } : {}), ...(t.resolved ? { resolved: true } : {}), anchor })
      for (const r of t.replies) {
        out.set(this.comments.liveIdOf(r.number), { author: r.author, body: r.text, ...(r.at ? { at: r.at } : {}), ...(r.mentions.length ? { mentions: r.mentions } : {}), parent: rootId })
      }
    }
    return out
  }

  /** Write this view's comments into the shared map. */
  push(): void {
    if (this.opts.readOnly) return
    const local = this.local()
    this.ydoc.transact(() => {
      for (const [id, rec] of local) {
        this.known.add(id)
        const cur = this.map.get(id)
        if (cur?.deleted) continue
        if (!cur || cur.body !== rec.body || !!cur.resolved !== !!rec.resolved || cur.author !== rec.author) {
          // Keep the anchor someone else wrote first: relative positions are the shared truth.
          this.map.set(id, cur?.anchor && rec.anchor ? { ...rec, anchor: cur.anchor } : rec)
        }
      }
      for (const id of this.known) {
        if (local.has(id)) continue
        const cur = this.map.get(id)
        if (cur && !cur.deleted) this.map.set(id, { ...cur, deleted: true })
      }
    }, LIVE_COMMENTS_ORIGIN)
  }

  /** Bring this view's memos to the shared map. */
  pull(): void {
    const s = this.session
    const wasDirty = s.dirty
    let changed = false
    this.applying = true
    try {
      const entries = [...this.map.entries()]
      // Deletions first, then roots, then replies (a reply needs its root).
      for (const [id, rec] of entries) {
        if (!rec.deleted) continue
        const n = this.comments.numberOfLive(id)
        if (n !== null) {
          this.comments.remove(n, 'remote')
          changed = true
        }
        this.known.delete(id)
      }
      const ordered = entries.filter(([, r]) => !r.deleted).sort(([, a], [, b]) => Number(!!a.parent) - Number(!!b.parent))
      for (const [id, rec] of ordered) {
        const n = this.comments.numberOfLive(id)
        if (n === null) {
          if (this.add(id, rec)) changed = true
          continue
        }
        this.known.add(id)
        const t = this.comments.threads().find((x) => x.id === n || x.replies.some((r) => r.number === n))
        const item = t ? (t.id === n ? t.root : t.replies.find((r) => r.number === n)) : undefined
        if (item && item.text !== rec.body) {
          this.comments.edit(n, rec.body, 'remote')
          changed = true
        }
        if (t && t.id === n && !!t.resolved !== !!rec.resolved) {
          this.comments.resolve(n, !!rec.resolved, 'remote')
          changed = true
        }
      }
    } finally {
      this.applying = false
    }
    if (changed && !wasDirty) s.markSaved()
  }

  /** Add someone else's comment here; false when its anchor or root is not here (yet). */
  private add(id: string, rec: CommentRecord): boolean {
    let target: ParagraphTarget
    let start: number
    let end: number
    let parent: number | undefined
    if (rec.parent) {
      const p = this.comments.numberOfLive(rec.parent)
      const t = p === null ? undefined : this.comments.thread(p)
      if (!t) return false
      parent = t.id
      ;({ target, start, end } = t.anchor)
    } else {
      const a = rec.anchor
      if (!a) return false
      if ('target' in a) {
        ;({ target, start, end } = a)
      } else {
        const from = this.binding.absolute({ section: a.section, rel: Y.createRelativePositionFromJSON(a.start) })
        const to = this.binding.absolute({ section: a.section, rel: Y.createRelativePositionFromJSON(a.end) })
        // The words it was on are gone, or are no longer in one paragraph.
        if (!from || !to || from.para !== to.para || to.offset <= from.offset) return false
        target = targetOf(from)
        start = from.offset
        end = to.offset
      }
    }
    this.comments.addAt({ target, start, end, author: rec.author, text: rec.body, ...(rec.at ? { at: rec.at } : {}), ...(rec.mentions ? { mentions: rec.mentions } : {}), ...(parent !== undefined ? { parent } : {}), ...(rec.resolved ? { resolved: true } : {}), live: id }, 'remote')
    this.known.add(id)
    return true
  }

  destroy(): void {
    for (const off of this.offs.splice(0)) off()
  }
}

/** Where a record's root anchor sits in this view (tests and the rail). */
export function recordAnchor(binding: LiveBinding, rec: CommentRecord) {
  const a = rec.anchor
  if (!a) return null
  if ('target' in a) return { from: posOfTarget(a.target, a.start), to: posOfTarget(a.target, a.end) }
  const from = binding.absolute({ section: a.section, rel: Y.createRelativePositionFromJSON(a.start) })
  const to = binding.absolute({ section: a.section, rel: Y.createRelativePositionFromJSON(a.end) })
  return from && to ? { from, to } : null
}
