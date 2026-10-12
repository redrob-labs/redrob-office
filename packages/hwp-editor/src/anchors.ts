// Anchors: text ranges that follow the document through edits (spec R6.7;
// reused for comments, R7). An anchor is a range in one container, held as
// Node ids plus offsets plus the text it covered.
//
// Node ids (E1) never move, so an edit elsewhere can't shift an anchor. When
// an edit touches the anchor's own paragraphs, the anchor finds its text
// again in those paragraphs, nearest to where it was: typing before it in the
// same paragraph shifts it, and an edit inside it keeps it while its first
// and last few characters survive. When the text is gone, the anchor is
// orphaned and says so, rather than landing on whatever text is there now.
import type { NodeId } from '@genoffice/hwp-core'
import { at, containerOf, paraIndex, sameContainer, type Pos } from './position'
import { ordered, type Change, type Selection, type Session } from './session'

export interface AnchorState {
  /** First and last paragraph of the range (equal for a range in one paragraph). */
  startNode: NodeId
  endNode: NodeId
  /** Code-point offsets in those paragraphs. */
  start: number
  end: number
  /** The text the range covers, paragraphs joined with "\n". */
  text: string
  orphaned: boolean
}

const EDGE = 6
const WINDOW_BEFORE = 1
const WINDOW_AFTER = 3

/** Text of paragraphs first..last of a container, joined with "\n", and each paragraph's start in it. */
function span(s: Session, c: ReturnType<typeof containerOf>, first: number, last: number): { text: string; starts: number[] } {
  const parts: string[] = []
  const starts: number[] = []
  let n = 0
  for (let i = first; i <= last; i++) {
    starts.push(n)
    const t = s.text.text(at(c, i, 0))
    parts.push(t)
    n += [...t].length + 1
  }
  return { text: parts.join('\n'), starts }
}

/** Code-point indexes of every occurrence of `needle` in `hay`. */
function findAll(hay: string, needle: string): number[] {
  const out: number[] = []
  if (!needle) return out
  let i = hay.indexOf(needle)
  while (i >= 0) {
    out.push([...hay.slice(0, i)].length)
    i = hay.indexOf(needle, i + 1)
  }
  return out
}

function nearest(list: number[], to: number): number | undefined {
  let best: number | undefined
  for (const x of list) if (best === undefined || Math.abs(x - to) < Math.abs(best - to)) best = x
  return best
}

export class Anchors {
  private items = new Map<string, AnchorState>()
  private listeners = new Set<() => void>()
  private off: () => void
  private seq = 0

  constructor(private readonly session: Session) {
    this.off = session.onChange((c) => this.onChange(c))
  }

  /** Anchor the selection; null for a collapsed selection or one that spans containers. */
  add(sel: Selection = this.session.selection, id = `a${++this.seq}`): string | null {
    const [a, b] = ordered(sel)
    if (!sameContainer(a, b) || (paraIndex(a) === paraIndex(b) && a.offset === b.offset)) return null
    const s = this.session
    const startNode = s.nodeAt(a)
    const endNode = s.nodeAt(b)
    if (startNode === null || endNode === null) return null
    this.items.set(id, { startNode, endNode, start: a.offset, end: b.offset, text: s.text.textBetween(a, b), orphaned: false })
    this.emit()
    return id
  }

  remove(id: string): void {
    if (this.items.delete(id)) this.emit()
  }

  clear(): void {
    this.items.clear()
    this.emit()
  }

  get(id: string): AnchorState | undefined {
    return this.items.get(id)
  }

  ids(): string[] {
    return [...this.items.keys()]
  }

  /** The anchor's current range, or null when it is orphaned. */
  range(id: string): Selection | null {
    const a = this.items.get(id)
    if (!a || a.orphaned) return null
    const p = this.posOf(a.startNode)
    const q = this.posOf(a.endNode)
    if (!p || !q) return null
    return { anchor: { ...p, offset: a.start }, head: { ...q, offset: a.end } }
  }

  /** Called after anchors move or orphan. */
  onUpdate(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  dispose(): void {
    this.off()
    this.listeners.clear()
    this.items.clear()
  }

  private posOf(id: NodeId): Pos | null {
    const loc = this.session.doc.locate(id)
    if (!loc) return null
    if (loc.path.length === 0) return { section: loc.section, para: loc.para, offset: 0 }
    const step = loc.path[0]!
    if (loc.path.length === 1 && step.kind === 'cell') return { section: loc.section, para: loc.para, offset: 0, cell: { control: step.controlIndex, cell: step.cellIndex ?? 0, para: step.para } }
    return null
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }

  private onChange(c: Change): void {
    // Undo, redo and rollback restore a snapshot, which may change any paragraph; every anchor re-checks.
    const all = c.origin === 'history' || c.command === 'ai:rollback'
    const touched = new Set(c.nodes)
    let moved = false
    for (const a of this.items.values()) {
      if (a.orphaned && !all) continue
      if (!all && !touched.has(a.startNode) && !touched.has(a.endNode) && this.posOf(a.startNode) && this.posOf(a.endNode)) {
        // Paragraphs between the ends may have changed too: check the text still matches.
        if (this.matches(a)) continue
      }
      if (this.relocate(a)) moved = true
    }
    if (moved) this.emit()
  }

  private matches(a: AnchorState): boolean {
    const r = this.rangeOf(a)
    return r !== null && this.session.text.textBetween(r.anchor, r.head) === a.text
  }

  private rangeOf(a: AnchorState): Selection | null {
    const p = this.posOf(a.startNode)
    const q = this.posOf(a.endNode)
    if (!p || !q || !sameContainer(p, q) || paraIndex(p) > paraIndex(q)) return null
    const s = this.session
    if (a.start > s.text.length(p) || a.end > s.text.length(q)) return null
    return { anchor: { ...p, offset: a.start }, head: { ...q, offset: a.end } }
  }

  /** Find the anchor's text again near where it was. Returns whether anything changed. */
  private relocate(a: AnchorState): boolean {
    const before = JSON.stringify(a)
    const p = this.posOf(a.startNode)
    const q = this.posOf(a.endNode)
    if (!p || !q || !sameContainer(p, q) || paraIndex(p) > paraIndex(q)) {
      a.orphaned = true
      return JSON.stringify(a) !== before
    }
    const c = containerOf(p)
    // Search the anchor's paragraphs and a few around them: a split inside the
    // range moves its tail into a new paragraph after it.
    const count = this.session.text.paragraphCount(c)
    const first = Math.max(0, paraIndex(p) - WINDOW_BEFORE)
    const last = Math.min(count - 1, paraIndex(q) + WINDOW_AFTER)
    const { text, starts } = span(this.session, c, first, last)
    const cps = [...text]
    const toPos = (k: number): Pos => {
      let i = starts.length - 1
      while (i > 0 && starts[i]! > k) i--
      return at(c, first + i, k - starts[i]!)
    }
    const wasAt = starts[paraIndex(p) - first]! + a.start
    let hit = nearest(findAll(text, a.text), wasAt)
    let len = [...a.text].length
    if (hit === undefined) {
      // Edited inside: keep the anchor while its first and last characters survive, in order.
      const qcps = [...a.text]
      if (qcps.length > EDGE * 2) {
        const head = qcps.slice(0, EDGE).join('')
        const tail = qcps.slice(-EDGE).join('')
        const h = nearest(findAll(text, head), wasAt)
        if (h !== undefined) {
          const tails = findAll(text, tail).filter((x) => x >= h + EDGE)
          const tl = tails.length ? Math.min(...tails) : undefined
          if (tl !== undefined && tl - h < qcps.length * 3) {
            hit = h
            len = tl + EDGE - h
          }
        }
      }
    }
    if (hit === undefined) {
      a.orphaned = true
      return JSON.stringify(a) !== before
    }
    const from = toPos(hit)
    const to = toPos(hit + len)
    const s = this.session
    a.startNode = s.nodeAt(from) ?? a.startNode
    a.endNode = s.nodeAt(to) ?? a.endNode
    a.start = from.offset
    a.end = to.offset
    a.text = cps.slice(hit, hit + len).join('')
    a.orphaned = false
    return JSON.stringify(a) !== before
  }
}
