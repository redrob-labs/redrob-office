// Comments (spec task 4.2, R7.2) over 한글 memos (engine E4).
//
// A comment is a 한글 memo, so 한글 2024 shows every comment written here.
// What memos lack (format research, finding 2) lives in a Redrob part of the
// package (`META-INF/redrob-comments.json` in HWPX, `/RedrobComments` in HWP
// 5.0), keyed by 한글's memo number, which is stored in the file:
//   - threads: a reply is a memo on the same text with `parent` set;
//   - resolved state;
//   - mentions, and when each comment was written.
// A memo with no entry (one 한글 wrote) is a thread of its own. An entry whose
// memo is gone (deleted in 한글) is dropped on the next change.
//
// Every change is one `Session.edit`, so it is one undo step and marks the
// document unsaved; the metadata travels in the engine's snapshot with the
// memos, so undo restores both together.
import type { Memo, NodeId, ParagraphTarget } from '@genoffice/hwp-core'
import { ordered, type ChangeOrigin, type Selection, type Session } from './session'
import { sameContainer, type Pos } from './position'

export interface CommentMeta {
  parent?: number
  resolved?: boolean
  mentions?: string[]
  /** ISO time the comment was written here (memos carry no date). */
  at?: string
}

interface MetaFile {
  version: 1
  comments: Record<string, CommentMeta>
}

export interface CommentItem {
  number: number
  fieldId: number
  author: string
  text: string
  at?: string
  mentions: string[]
}

export interface CommentThread {
  /** The root comment's memo number: the thread's id. */
  id: number
  root: CommentItem
  replies: CommentItem[]
  resolved: boolean
  anchor: { nodeId: NodeId; start: number; end: number; text: string; target: ParagraphTarget }
}

export const REDROB_MENTION = 'Redrob'

/** "@Name" mentions in a comment, matched against the people who can be mentioned, in the order they appear. */
export function mentionsIn(text: string, people: readonly string[]): string[] {
  const out: Array<{ name: string; at: number }> = []
  let rest = text
  for (const name of [...people].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[\\s([{"'])@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'u')
    const m = re.exec(rest)
    if (m) {
      out.push({ name, at: m.index })
      // blank out the match so a shorter name can't match inside it; positions stay
      rest = rest.slice(0, m.index) + m[1] + ' '.repeat(m[0].length - m[1]!.length) + rest.slice(m.index + m[0].length)
    }
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.name)
}

function targetOf(p: Pos): ParagraphTarget {
  return { section: p.section, para: p.para, cellPath: p.cell ? [[p.cell.control, p.cell.cell, p.cell.para]] : [] }
}

function posOfTarget(t: ParagraphTarget, offset: number): Pos {
  const c = t.cellPath[0]
  return c ? { section: t.section, para: t.para, offset, cell: { control: c[0], cell: c[1], para: c[2] } } : { section: t.section, para: t.para, offset }
}

export class Comments {
  constructor(readonly session: Session, private readonly now: () => string = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')) {}

  private get raw() {
    return this.session.doc.raw
  }

  private meta(): MetaFile {
    try {
      const text = this.raw.getRedrobComments()
      if (!text) return { version: 1, comments: {} }
      const v = JSON.parse(text) as MetaFile
      return v && v.version === 1 && v.comments && typeof v.comments === 'object' ? v : { version: 1, comments: {} }
    } catch {
      return { version: 1, comments: {} }
    }
  }

  private writeMeta(m: MetaFile, memos: Memo[]): void {
    const live = new Set(memos.map((x) => String(x.number)))
    for (const k of Object.keys(m.comments)) if (!live.has(k)) delete m.comments[k]
    this.raw.setRedrobComments(Object.keys(m.comments).length ? JSON.stringify(m) : '')
  }

  memos(): Memo[] {
    return this.session.doc.memos()
  }

  threads(): CommentThread[] {
    const memos = this.memos()
    const meta = this.meta().comments
    const byNumber = new Map(memos.map((m) => [m.number, m]))
    const item = (m: Memo): CommentItem => {
      const e = meta[String(m.number)] ?? {}
      return { number: m.number, fieldId: m.fieldId, author: m.author, text: m.body, mentions: e.mentions ?? [], ...(e.at ? { at: e.at } : {}) }
    }
    const rootOf = (m: Memo): Memo => {
      let cur = m
      const seen = new Set<number>()
      for (;;) {
        const parent = meta[String(cur.number)]?.parent
        const p = parent !== undefined ? byNumber.get(parent) : undefined
        if (!p || seen.has(p.number)) return cur
        seen.add(cur.number)
        cur = p
      }
    }
    const threads = new Map<number, CommentThread>()
    for (const m of memos) {
      const root = rootOf(m)
      let t = threads.get(root.number)
      if (!t) {
        t = { id: root.number, root: item(root), replies: [], resolved: !!meta[String(root.number)]?.resolved, anchor: { nodeId: root.nodeId, start: root.start, end: root.end, text: root.text, target: root.target } }
        threads.set(root.number, t)
      }
      if (m !== root) t.replies.push(item(m))
    }
    for (const t of threads.values()) t.replies.sort((a, b) => a.number - b.number)
    // Document order of the anchors, as the rail shows them.
    const order = new Map(memos.map((m, i) => [m.number, i]))
    return [...threads.values()].sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  }

  thread(id: number): CommentThread | undefined {
    return this.threads().find((t) => t.id === id)
  }

  /** The selection's range as a comment anchor, or null (collapsed, or spanning paragraphs). */
  static anchorOf(sel: Selection): { target: ParagraphTarget; start: number; end: number } | null {
    const [a, b] = ordered(sel)
    if (!sameContainer(a, b)) return null
    const sameParagraph = a.cell ? a.cell.para === b.cell!.para : a.para === b.para
    if (!sameParagraph || a.offset === b.offset) return null
    return { target: targetOf(a), start: a.offset, end: b.offset }
  }

  /**
   * Add a comment on the selection; returns the new thread id (its memo number).
   * A 한글 memo annotates text within one paragraph, so a selection across
   * paragraphs anchors on its first paragraph's part.
   */
  add(sel: Selection, author: string, text: string, people: readonly string[] = [], origin: ChangeOrigin = 'user'): number {
    let anchor = Comments.anchorOf(sel)
    if (!anchor) {
      const [a, b] = ordered(sel)
      if (!sameContainer(a, b) || (a.offset === b.offset && (a.cell ? a.cell.para === b.cell!.para : a.para === b.para))) throw new Error('select the text to comment on')
      anchor = { target: targetOf(a), start: a.offset, end: this.session.text.length(a) }
      if (anchor.end <= anchor.start) throw new Error('select the text to comment on')
    }
    const { target, start, end } = anchor
    let number = 0
    this.session.edit('review:memo-insert', () => {
      const fieldId = this.session.doc.addMemo(target, start, end, author, text)
      const memos = this.memos()
      number = memos.find((m) => m.fieldId === fieldId)!.number
      const m = this.meta()
      m.comments[String(number)] = { at: this.now(), ...(mentionsIn(text, people).length ? { mentions: mentionsIn(text, people) } : {}) }
      this.writeMeta(m, memos)
      return this.session.selection
    }, origin)
    return number
  }

  /** Reply in a thread: a memo on the thread's text. Returns the reply's number. */
  reply(threadId: number, author: string, text: string, people: readonly string[] = [], origin: ChangeOrigin = 'user'): number {
    const t = this.thread(threadId)
    if (!t) throw new Error('the comment no longer exists')
    let number = 0
    this.session.edit('review:memo-reply', () => {
      const fieldId = this.session.doc.addMemo(t.anchor.target, t.anchor.start, t.anchor.end, author, text)
      const memos = this.memos()
      number = memos.find((m) => m.fieldId === fieldId)!.number
      const m = this.meta()
      const mentions = mentionsIn(text, people)
      m.comments[String(number)] = { parent: t.id, at: this.now(), ...(mentions.length ? { mentions } : {}) }
      // Replying reopens a resolved thread, as in Docs.
      if (m.comments[String(t.id)]?.resolved) m.comments[String(t.id)]!.resolved = false
      this.writeMeta(m, memos)
      return this.session.selection
    }, origin)
    return number
  }

  resolve(threadId: number, resolved: boolean, origin: ChangeOrigin = 'user'): void {
    if (!this.thread(threadId)) throw new Error('the comment no longer exists')
    this.session.edit('review:memo-resolve', () => {
      const m = this.meta()
      const e = (m.comments[String(threadId)] ??= {})
      e.resolved = resolved
      if (!resolved) delete e.resolved
      this.writeMeta(m, this.memos())
      return this.session.selection
    }, origin)
  }

  edit(number: number, text: string, origin: ChangeOrigin = 'user'): void {
    const memo = this.memos().find((m) => m.number === number)
    if (!memo) throw new Error('the comment no longer exists')
    this.session.edit('review:memo-edit', () => {
      this.session.doc.setMemoBody(memo.fieldId, text)
      return this.session.selection
    }, origin)
  }

  /** Delete a comment; deleting a thread's root deletes its replies. The text stays. */
  remove(number: number, origin: ChangeOrigin = 'user'): void {
    const t = this.threads().find((x) => x.id === number || x.replies.some((r) => r.number === number))
    if (!t) throw new Error('the comment no longer exists')
    const doomed = t.id === number ? [t.root, ...t.replies] : t.replies.filter((r) => r.number === number)
    this.session.edit('review:memo-delete', () => {
      for (const c of doomed) this.session.doc.removeMemo(c.fieldId)
      this.writeMeta(this.meta(), this.memos())
      return this.session.selection
    }, origin)
  }

  /** The anchored range of a thread, for the overlay and for jumping to it. */
  range(t: CommentThread): Selection {
    return { anchor: posOfTarget(t.anchor.target, t.anchor.start), head: posOfTarget(t.anchor.target, t.anchor.end) }
  }

  /** Everyone who can be mentioned: Redrob, the comment authors, and this person. */
  people(me: string | null): string[] {
    const names = new Set<string>([REDROB_MENTION])
    for (const m of this.memos()) if (m.author.trim()) names.add(m.author.trim())
    if (me?.trim()) names.add(me.trim())
    return [...names]
  }
}
