// Tracked changes in the editor (spec tasks 4.3 and 4.4, R8.1): review
// (accept, reject, all) and recording, over the engine's revision API (E5b).
//
// Accepting or rejecting is one undo step: the engine drops the revision's
// marks, and when the text should go (an accepted deletion, a rejected
// insertion) the editor deletes it.
//
// Recording (suggesting mode) takes over typing and deleting through the
// command bus:
//   - typed text is inserted and marked as an insertion; typing at the end of
//     your own insertion extends it;
//   - Backspace and Delete mark text deleted instead of removing it (and move
//     the caret over it); inside your own insertion they really delete;
//   - a selection replaced by typing is marked deleted;
//   - adjacent deletions by the same person merge into one.
// Enter still splits the paragraph untracked; 한글 tracks paragraph marks in a
// way that needs files 한글 2024 writes to learn (P-1).
import type { ParagraphTarget, Revision } from '@genoffice/hwp-core'
import type { Command, CommandBus } from './commands'
import { posOfTarget, targetOf } from './comments'
import { moveHorizontal } from './navigation'
import { at, compare, containerOf, paraIndex, sameContainer, type Pos } from './position'
import { collapsed, ordered, type Change, type ChangeOrigin, type Selection, type Session } from './session'

const iso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

function sameTarget(a: ParagraphTarget, b: ParagraphTarget): boolean {
  return a.section === b.section && a.para === b.para && JSON.stringify(a.cellPath) === JSON.stringify(b.cellPath)
}

export class Revisions {
  constructor(readonly session: Session, private readonly now: () => string = iso) {}

  list(): Revision[] {
    return this.session.doc.revisions()
  }

  /** The revision's range as a selection. */
  range(r: Revision): Selection {
    return { anchor: posOfTarget(r.target, r.start), head: posOfTarget(r.endTarget, r.end) }
  }

  /** The revision under the caret or overlapping the selection, if any. */
  at(sel: Selection = this.session.selection): Revision | undefined {
    const [a, b] = ordered(sel)
    return this.list().find((r) => {
      const ra = posOfTarget(r.target, r.start)
      const rb = posOfTarget(r.endTarget, r.end)
      if (!sameContainer(ra, a)) return false
      return compare(ra, b) <= 0 && compare(a, rb) <= 0
    })
  }

  accept(id: number, origin: ChangeOrigin = 'user'): Change {
    return this.resolve('review:revision-accept', [id], true, origin)
  }

  reject(id: number, origin: ChangeOrigin = 'user'): Change {
    return this.resolve('review:revision-reject', [id], false, origin)
  }

  acceptAll(origin: ChangeOrigin = 'user'): Change | null {
    const ids = this.list().map((r) => r.id)
    return ids.length ? this.resolve('review:revision-accept-all', ids, true, origin) : null
  }

  rejectAll(origin: ChangeOrigin = 'user'): Change | null {
    const ids = this.list().map((r) => r.id)
    return ids.length ? this.resolve('review:revision-reject-all', ids, false, origin) : null
  }

  private resolve(command: string, ids: number[], accept: boolean, origin: ChangeOrigin): Change {
    return this.session.edit(
      command,
      () => {
        let sel = this.session.selection
        // Last first, so deleting one revision's text never moves the next.
        const doomed = this.list()
          .filter((r) => ids.includes(r.id))
          .sort((x, y) => y.target.section - x.target.section || y.target.para - x.target.para || y.start - x.start)
        if (doomed.length !== ids.length) throw new Error('the change no longer exists')
        for (const r of doomed) {
          const range = this.range(r)
          this.session.doc.removeRevision(r.id)
          const dropText = accept ? r.kind === 'delete' : r.kind === 'insert'
          if (dropText && sameContainer(range.anchor, range.head)) {
            const p = this.dropRange(range.anchor, range.head)
            sel = { anchor: p, head: p }
          }
        }
        this.dropEmpty()
        return sel
      },
      origin,
    )
  }

  /**
   * Delete a revision's text. When it was a whole paragraph (a paragraph Redrob
   * or a person deleted or inserted in suggesting mode), the paragraph goes too,
   * so accepting a deleted paragraph leaves no empty line behind.
   */
  private dropRange(a: Pos, b: Pos): Pos {
    const t = this.session.text
    const c = containerOf(a)
    const whole = paraIndex(a) === paraIndex(b) && a.offset === 0 && b.offset === t.length(b) && t.paragraphCount(c) > 1
    if (!whole) return t.delete(a, b)
    const i = paraIndex(a)
    if (i > 0) {
      const prev = at(c, i - 1, 0)
      const end = { ...prev, offset: t.length(prev) }
      t.delete(end, b)
      return end
    }
    return t.delete(a, at(c, 1, 0))
  }

  /** Mark [a, b) of one paragraph inserted by `author`. */
  markInserted(a: Pos, b: Pos, author: string): void {
    if (b.offset > a.offset) this.session.doc.addRevision(targetOf(a), a.offset, b.offset, 'insert', author, this.now())
  }

  /** Revisions left with no text (their text was deleted) are removed. */
  private dropEmpty(): void {
    for (const r of this.list()) if (sameTarget(r.target, r.endTarget) && r.start === r.end) this.session.doc.removeRevision(r.id)
  }

  // ── Recording ─────────────────────────────────────────────────────────

  private inParagraph(t: ParagraphTarget): Revision[] {
    return this.list().filter((r) => sameTarget(r.target, t) && sameTarget(r.endTarget, t))
  }

  /** Mark [a, b) of one paragraph deleted by `author`, merging with that person's touching deletions. */
  markDeleted(a: Pos, b: Pos, author: string): void {
    const t = targetOf(a)
    let start = a.offset
    let end = b.offset
    for (const r of this.inParagraph(t)) {
      if (r.kind === 'delete' && r.author === author && r.start <= end && r.end >= start) {
        start = Math.min(start, r.start)
        end = Math.max(end, r.end)
        this.session.doc.removeRevision(r.id)
      }
    }
    if (end > start) this.session.doc.addRevision(t, start, end, 'delete', author, this.now())
  }

  /** Whether [a, b) lies inside `author`'s own insertion. */
  private inOwnInsertion(a: Pos, b: Pos, author: string): boolean {
    return this.inParagraph(targetOf(a)).some((r) => r.kind === 'insert' && r.author === author && r.start <= a.offset && r.end >= b.offset)
  }

  private inDeletion(a: Pos, b: Pos): boolean {
    return this.inParagraph(targetOf(a)).some((r) => r.kind === 'delete' && r.start <= a.offset && r.end >= b.offset)
  }

  /** Insert text at p as a tracked insertion; returns the position after it. */
  private insertTracked(p: Pos, text: string, author: string): Pos {
    if (!text) return p
    const t = targetOf(p)
    // Revisions ending exactly here would swallow the new text (their end mark moves with it);
    // only the author's own insertion should grow.
    const ending = this.inParagraph(t).filter((r) => r.end === p.offset && r.start < p.offset)
    const extendOwn = ending.some((r) => r.kind === 'insert' && r.author === author)
    const q = this.session.text.insert(p, text)
    for (const r of ending) {
      if (r.kind === 'insert' && r.author === author) continue
      this.session.doc.removeRevision(r.id)
      this.session.doc.addRevision(t, r.start, p.offset, r.kind, r.author, r.date || this.now())
    }
    if (!extendOwn) this.session.doc.addRevision(t, p.offset, q.offset, 'insert', author, this.now())
    return q
  }

  /** Mark a selection deleted, paragraph by paragraph; returns where typing continues. */
  private deleteSelectionTracked(sel: Selection, author: string): Pos {
    const [a, b] = ordered(sel)
    if (!sameContainer(a, b)) return sel.head
    const c = containerOf(a)
    for (let i = paraIndex(a); i <= paraIndex(b); i++) {
      const p = at(c, i, 0)
      const from = i === paraIndex(a) ? a.offset : 0
      const to = i === paraIndex(b) ? b.offset : this.session.text.length(p)
      if (to > from) this.markDeleted({ ...p, offset: from }, { ...p, offset: to }, author)
    }
    return b
  }

  /**
   * Record edits as tracked changes by `author` until the returned function is
   * called. Covers typing, Backspace, Delete, and typing over a selection.
   */
  record(bus: CommandBus, author: string): () => void {
    const s = this.session
    return bus.addIntercept((id, params, origin) => {
      if (origin !== 'user' && origin !== 'ai') return undefined
      if (id === 'edit:insert-text') {
        const text = String((params as { text?: string } | undefined)?.text ?? '')
        if (!text) return null
        return s.edit('edit:insert-text', () => {
          let p = collapsed(s.selection) ? s.selection.head : this.deleteSelectionTracked(s.selection, author)
          text.replace(/\r\n?/g, '\n').split('\n').forEach((part, i) => {
            if (i > 0) p = s.text.split(p)
            p = this.insertTracked(p, part, author)
          })
          return { anchor: p, head: p }
        }, origin)
      }
      if (id === 'edit:delete-backward' || id === 'edit:delete-forward') {
        if (!collapsed(s.selection)) {
          return s.edit('edit:delete', () => {
            const end = this.deleteSelectionTracked(s.selection, author)
            const [a] = ordered(s.selection)
            return id === 'edit:delete-backward' ? { anchor: a, head: a } : { anchor: end, head: end }
          }, origin)
        }
        const dir = id === 'edit:delete-backward' ? -1 : 1
        const h = s.selection.head
        const o = moveHorizontal(s, h, dir)
        // Across a paragraph break or a container edge: just move (paragraph marks are not tracked).
        const sameParagraph = sameContainer(h, o) && paraIndex(h) === paraIndex(o)
        if (!sameParagraph || compare(h, o) === 0) {
          s.select({ anchor: o, head: o })
          return null
        }
        const [a, b] = dir < 0 ? [o, h] : [h, o]
        if (this.inOwnInsertion(a, b, author)) {
          return s.edit(id, () => {
            const p = s.text.delete(a, b)
            this.dropEmpty()
            return { anchor: p, head: p }
          }, origin)
        }
        if (this.inDeletion(a, b)) {
          s.select({ anchor: o, head: o })
          return null
        }
        return s.edit(id, () => {
          this.markDeleted(a, b, author)
          return { anchor: o, head: o }
        }, origin)
      }
      return undefined
    })
  }
}

/** Ordered position of a revision's start, for next/previous. */
function startKey(r: Revision): number[] {
  return [r.target.section, r.target.para, ...r.target.cellPath.flat(), r.start]
}

function cmpKey(x: number[], y: number[]): number {
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1)
    if (d) return d
  }
  return 0
}

export interface RecordingControl {
  isRecording(): boolean
  setRecording(on: boolean): void
}

/** The 검토 commands for the command bus: accept, reject, all, next, previous, and the track-changes toggle. */
export function revisionCommands(rev: Revisions, recording: RecordingControl): Command<never>[] {
  const s = rev.session
  const caretKey = (): number[] => {
    const h = ordered(s.selection)[0]
    return [h.section, h.para, ...(h.cell ? [h.cell.control, h.cell.cell, h.cell.para] : []), h.offset]
  }
  const go = (dir: 1 | -1): Change | null => {
    const list = rev.list().sort((x, y) => cmpKey(startKey(x), startKey(y)))
    const here = caretKey()
    const r = dir > 0 ? list.find((x) => cmpKey(startKey(x), here) > 0) ?? list[0] : [...list].reverse().find((x) => cmpKey(startKey(x), here) < 0) ?? list.at(-1)
    if (r) s.select(rev.range(r))
    return null
  }
  const cmds: Command<unknown>[] = [
    { id: 'review:revision-accept', isEnabled: () => !!rev.at(), run: () => (rev.at() ? rev.accept(rev.at()!.id) : null) },
    { id: 'review:revision-reject', isEnabled: () => !!rev.at(), run: () => (rev.at() ? rev.reject(rev.at()!.id) : null) },
    { id: 'review:revision-accept-all', isEnabled: () => rev.list().length > 0, run: () => rev.acceptAll() },
    { id: 'review:revision-reject-all', isEnabled: () => rev.list().length > 0, run: () => rev.rejectAll() },
    { id: 'review:revision-next', isEnabled: () => rev.list().length > 0, run: () => go(1) },
    { id: 'review:revision-previous', isEnabled: () => rev.list().length > 0, run: () => go(-1) },
    {
      id: 'review:track-changes',
      isEnabled: () => s.format === 'hwpx',
      isActive: () => recording.isRecording(),
      run: () => (recording.setRecording(!recording.isRecording()), null),
    },
  ]
  return cmds as Command<never>[]
}
