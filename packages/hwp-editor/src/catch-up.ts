// Catch-up for Hangul (spec task 5.1, R9.1): what changed since the person
// last had the document open. Comments and tracked changes carry dates; plain
// edits don't, so they are found by comparing the document with the version
// saved before the last visit, paragraph by paragraph (an outline diff).
import type { HwpCoreDocument, NodeId } from '@genoffice/hwp-core'
import type { CatchUpComment, CatchUpRevision } from '@genoffice/versions'
import { Comments } from './comments'
import type { Session } from './session'

function bodyTexts(doc: HwpCoreDocument): Array<{ id: NodeId; text: string }> {
  const out: Array<{ id: NodeId; text: string }> = []
  for (const section of doc.outline().sections) {
    section.paragraphs.forEach((p, i) => out.push({ id: p.id, text: doc.text(section.section, i) }))
  }
  return out
}

/**
 * Paragraphs of `now` whose text is not in `then` (counting repeats), in
 * document order. Moved paragraphs don't count; edited, added and split ones do.
 */
export function changedParagraphs(then: HwpCoreDocument, now: HwpCoreDocument): NodeId[] {
  const pool = new Map<string, number>()
  for (const p of bodyTexts(then)) pool.set(p.text, (pool.get(p.text) ?? 0) + 1)
  const out: NodeId[] = []
  for (const p of bodyTexts(now)) {
    const n = pool.get(p.text) ?? 0
    if (n > 0) pool.set(p.text, n - 1)
    else if (p.text.trim()) out.push(p.id)
  }
  return out
}

/** Comments in the shape catch-up reads (dates come from the Redrob comment part). */
export function catchUpComments(s: Session): CatchUpComment[] {
  const out: CatchUpComment[] = []
  for (const t of new Comments(s).threads()) {
    for (const c of [t.root, ...t.replies]) out.push({ id: String(c.number), author: c.author, date: c.at, text: c.text, ...(c === t.root ? {} : { parentId: String(t.id) }) })
  }
  return out
}

/** Tracked changes in the shape catch-up reads; `at` is the paragraph's Node id. */
export function catchUpRevisions(s: Session): CatchUpRevision[] {
  return s.doc.revisions().map((r) => ({ kind: r.kind === 'insert' ? 'ins' : 'del', author: r.author, date: r.date, at: r.nodeId }))
}
