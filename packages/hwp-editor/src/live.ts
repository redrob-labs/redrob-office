// Live typing for Hangul (spec tasks 5.3 and 5.4, R9.3, R9.4): an editor
// session bound to a shared Y.Doc, design A2 from the collaboration spike
// (docs/decisions/2026-10-hangul-collaboration.md).
//
// Each section's body is one Y.Text, paragraphs joined by "\n", so a split
// is a break character and text typed into a moving tail moves with it.
//
// Both directions reconcile by text:
//   - a local change: the section's engine text is compared with the shared
//     text and the difference is written to the Y.Text;
//   - a remote change: the shared text is compared with the engine text and
//     the difference is applied through `Session.edit` with origin "remote",
//     as deletes, inserts and paragraph splits (E6, deterministic: every
//     client applies the same primitive edits to the same text, so the
//     engines converge). Someone else's typing never marks the view unsaved.
//
// Undo is Yjs's, scoped to this person's own changes (`Y.UndoManager` over
// the local origin), and the session's own history is off while bound.
//
// What travels live is body text and paragraph structure. Formatting, tables,
// objects, headers and memos made by others arrive with their save (the base
// version moves on and a clean view reloads it; see `onBaseChanged`).
//
// Engine offsets are code points; Y.Text indexes UTF-16. Every index is
// converted at the boundary.
import * as Y from 'yjs'
import type { CommandBus } from './commands'
import type { Pos } from './position'
import type { Change, Selection, Session } from './session'

export const LIVE_LOCAL = Symbol('hwp-live-local')
const BREAK = '\n'

export const sectionKey = (i: number) => `hwp:section${i}`

/** Body text of a section as one flow, paragraphs joined by "\n". */
export function sectionFlow(s: Session, section: number): string {
  const out: string[] = []
  for (let p = 0; p < s.doc.paragraphCount(section); p++) out.push(s.doc.text(section, p).replace(/\n/g, ' '))
  return out.join(BREAK)
}

/** UTF-16 index of code point `cp` in `str`. */
function u16(cps: string[], cp: number): number {
  let n = 0
  for (let i = 0; i < cp && i < cps.length; i++) n += cps[i]!.length
  return n
}

/** Code point index of UTF-16 index `i` in `str`. */
function cpOf(str: string, i: number): number {
  return [...str.slice(0, i)].length
}

interface Diff {
  /** code point index of the first difference */
  start: number
  /** code points removed from `from` */
  removed: number
  /** code points inserted from `to` */
  inserted: string[]
}

/** The single changed span between two strings, on code points. */
export function diffFlows(from: string, to: string): Diff | null {
  const a = [...from]
  const b = [...to]
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  if (pre === a.length && pre === b.length) return null
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  return { start: pre, removed: a.length - pre - suf, inserted: b.slice(pre, b.length - suf) }
}

/** Paragraph and offset of a code point index in a section flow. */
function flowPos(cps: string[], section: number, i: number): Pos {
  let para = 0
  let offset = 0
  for (let k = 0; k < i; k++) {
    if (cps[k] === BREAK) {
      para++
      offset = 0
    } else offset++
  }
  return { section, para, offset }
}

/** Code point index in a section flow of a body position. */
function flowIndex(s: Session, p: Pos): number {
  let n = 0
  for (let k = 0; k < p.para; k++) n += s.doc.paragraphLength(p.section, k) + 1
  return n + p.offset
}

/** A selection in the shape the live room relays (`LiveCursor`): each end is a section and a Yjs relative position. */
export interface LiveCursorJson {
  anchor: unknown
  head: unknown
}

interface CursorEnd {
  section: number
  rel: unknown
}

export interface LiveBindingOptions {
  readOnly?: boolean
  /** seed the shared text from this session (first writer into an empty room) */
  seed?: boolean
}

export class LiveBinding {
  readonly undo: Y.UndoManager
  private readonly texts: Y.Text[] = []
  private applying = false
  private readonly offs: Array<() => void> = []

  constructor(
    readonly session: Session,
    readonly ydoc: Y.Doc,
    bus: CommandBus | null,
    private readonly opts: LiveBindingOptions = {},
  ) {
    const s = session
    const sections = s.doc.sectionCount()
    for (let i = 0; i < sections; i++) this.texts.push(ydoc.getText(sectionKey(i)))
    if (opts.seed) {
      ydoc.transact(() => {
        this.texts.forEach((t, i) => {
          if (t.length === 0) t.insert(0, sectionFlow(s, i))
        })
      }, 'seed')
    }
    // Bring this view to the shared text (it may be ahead of the bytes we opened).
    this.pullAll()
    s.settle()
    s.historyEnabled = false
    s.clearHistory()
    this.undo = new Y.UndoManager(this.texts, { trackedOrigins: new Set([LIVE_LOCAL]), captureTimeout: 600 })

    const onY = (_e: Y.YEvent<Y.Text>[], tr: Y.Transaction) => {
      if (tr.origin === LIVE_LOCAL) return
      this.pullAll(tr.origin === this.undo ? 'history' : 'remote')
    }
    for (const t of this.texts) {
      t.observeDeep(onY)
      this.offs.push(() => t.unobserveDeep(onY))
    }
    this.offs.push(
      s.onChange((c) => {
        if (this.applying || c.origin === 'remote') return
        this.pushAll()
      }),
    )
    if (bus) {
      this.offs.push(
        bus.addIntercept((id) => {
          if (id === 'edit:undo') return this.runUndo(true)
          if (id === 'edit:redo') return this.runUndo(false)
          return undefined
        }),
      )
    }
  }

  get readOnly(): boolean {
    return !!this.opts.readOnly
  }

  private runUndo(undo: boolean): Change | null {
    if (undo) this.undo.undo()
    else this.undo.redo()
    return null
  }

  /** Write this view's text into the shared text (local edits). */
  pushAll(): void {
    if (this.opts.readOnly) return
    this.ydoc.transact(() => {
      this.texts.forEach((t, i) => {
        if (i >= this.session.doc.sectionCount()) return
        const shared = t.toString()
        const d = diffFlows(shared, sectionFlow(this.session, i))
        if (!d) return
        const cps = [...shared]
        const at = u16(cps, d.start)
        const len = u16(cps, d.start + d.removed) - at
        if (len) t.delete(at, len)
        if (d.inserted.length) t.insert(at, d.inserted.join(''))
      })
    }, LIVE_LOCAL)
  }

  /** Bring the engine to the shared text (remote edits, Yjs undo). */
  pullAll(origin: 'remote' | 'history' = 'remote'): void {
    const s = this.session
    const changes: Array<{ section: number; d: Diff; have: string[] }> = []
    this.texts.forEach((t, i) => {
      if (i >= s.doc.sectionCount()) return
      const have = sectionFlow(s, i)
      const d = diffFlows(have, t.toString())
      if (d) changes.push({ section: i, d, have: [...have] })
    })
    if (!changes.length) return
    const wasDirty = s.dirty
    const sel = s.selection
    // Keep the caret on its text through the change: map its flow index through each diff.
    const mapPos = (p: Pos): Pos => {
      if (p.cell || p.story) return p
      const c = changes.find((x) => x.section === p.section)
      if (!c) return p
      let i = flowIndex(s, p)
      const end = c.d.start + c.d.removed
      if (i >= end) i += c.d.inserted.length - c.d.removed
      else if (i > c.d.start) i = c.d.start + c.d.inserted.length
      const after = [...c.have.slice(0, c.d.start), ...c.d.inserted, ...c.have.slice(end)]
      return flowPos(after, p.section, i)
    }
    const anchor = mapPos(sel.anchor)
    const head = mapPos(sel.head)
    this.applying = true
    try {
      s.edit('live:apply', () => {
        for (const { section, d, have } of changes) {
          const from = flowPos(have, section, d.start)
          const to = flowPos(have, section, d.start + d.removed)
          let p = d.removed ? s.text.delete(from, to) : from
          let run = ''
          for (const ch of d.inserted) {
            if (ch === BREAK) {
              p = s.text.insert(p, run)
              run = ''
              p = s.text.split(p)
            } else run += ch
          }
          if (run) p = s.text.insert(p, run)
        }
        return sel
      }, origin === 'history' ? 'history' : 'remote')
    } finally {
      this.applying = false
    }
    s.select({ anchor, head })
    // Someone else's typing never marks this view unsaved; this person's own undo does.
    if (origin === 'remote' && !wasDirty) s.markSaved()
  }

  /** A body position as a Yjs relative position, which survives others' edits. */
  relative(p: Pos): { section: number; rel: Y.RelativePosition } | null {
    if (p.cell || p.story) return null
    const t = this.texts[p.section]
    if (!t) return null
    const flow = t.toString()
    const cps = [...flow]
    return { section: p.section, rel: Y.createRelativePositionFromTypeIndex(t, u16(cps, Math.min(flowIndex(this.session, p), cps.length))) }
  }

  /** Where a relative position is now in this view's engine. */
  absolute(r: { section: number; rel: Y.RelativePosition } | null): Pos | null {
    if (!r) return null
    const abs = Y.createAbsolutePositionFromRelativePosition(r.rel, this.ydoc)
    if (!abs) return null
    const flow = this.texts[r.section]!.toString()
    return flowPos([...flow], r.section, cpOf(flow, abs.index))
  }

  /** This person's selection for presence, as JSON others can resolve. */
  cursor(sel: Selection = this.session.selection): LiveCursorJson | null {
    const a = this.relative(sel.anchor)
    const h = this.relative(sel.head)
    if (!a || !h) return null
    return { anchor: { section: a.section, rel: Y.relativePositionToJSON(a.rel) }, head: { section: h.section, rel: Y.relativePositionToJSON(h.rel) } }
  }

  /** Another person's cursor in this view, or null when it no longer resolves. */
  resolveCursor(c: LiveCursorJson | null | undefined): Selection | null {
    const end = (e: unknown): Pos | null => {
      const x = e as CursorEnd | null
      if (!x || !Number.isInteger(x.section) || !this.texts[x.section]) return null
      return this.absolute({ section: x.section, rel: Y.createRelativePositionFromJSON(x.rel) })
    }
    try {
      const a = end(c?.anchor)
      const h = end(c?.head)
      return a && h ? { anchor: a, head: h } : null
    } catch {
      return null
    }
  }

  destroy(): void {
    for (const off of this.offs.splice(0)) off()
    this.undo.destroy()
    this.session.historyEnabled = true
  }
}
