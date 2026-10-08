// 문서 비교 (compare documents, spec task 2.6): how the open document differs
// from another one, paragraph by paragraph. The two bodies are aligned by a
// longest common subsequence of paragraph texts, so a paragraph that only moved
// a little stays matched; what is left is text only in this document, text
// only in the other, and pairs of those that sit in the same place (changed).
import type { HwpCoreDocument } from '@genoffice/hwp-core'

export interface CompareEntry {
  kind: 'added' | 'removed' | 'changed'
  /** the paragraph in this document (for added and changed), to go to */
  at: { section: number; para: number } | null
  /** its text in this document */
  mine: string
  /** its text in the other document */
  theirs: string
}

interface Para {
  section: number
  para: number
  text: string
}

/** Above this many cells the alignment falls back to matching equal texts in order. */
const MAX_CELLS = 16_000_000

function paragraphs(doc: HwpCoreDocument): Para[] {
  const out: Para[] = []
  for (const s of doc.outline().sections) s.paragraphs.forEach((_, i) => out.push({ section: s.section, para: i, text: doc.text(s.section, i) }))
  return out
}

/** Index pairs of matched paragraphs, in order. */
function align(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const n = a.length
  const m = b.length
  const pairs: Array<[number, number]> = []
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    // Too large for the table: match each text to its next equal one, in order.
    let j = 0
    for (let i = 0; i < n && j < m; i++) {
      const k = b.indexOf(a[i]!, j)
      if (k >= 0) {
        pairs.push([i, k])
        j = k + 1
      }
    }
    return pairs
  }
  const w = m + 1
  const L = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1]! + 1 : Math.max(L[(i + 1) * w + j]!, L[i * w + j + 1]!)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i++
      j++
    } else if (L[(i + 1) * w + j]! >= L[i * w + j + 1]!) i++
    else j++
  }
  return pairs
}

/** How `mine` differs from `theirs`, in the order of this document. Empty paragraphs are ignored. */
export function compareDocuments(mine: HwpCoreDocument, theirs: HwpCoreDocument): CompareEntry[] {
  const a = paragraphs(mine).filter((p) => p.text.trim())
  const b = paragraphs(theirs).filter((p) => p.text.trim())
  const pairs = align(
    a.map((p) => p.text),
    b.map((p) => p.text),
  )
  const out: CompareEntry[] = []
  let i = 0
  let j = 0
  const gap = (iEnd: number, jEnd: number) => {
    const onlyMine = a.slice(i, iEnd)
    const onlyTheirs = b.slice(j, jEnd)
    const both = Math.min(onlyMine.length, onlyTheirs.length)
    for (let k = 0; k < both; k++) out.push({ kind: 'changed', at: { section: onlyMine[k]!.section, para: onlyMine[k]!.para }, mine: onlyMine[k]!.text, theirs: onlyTheirs[k]!.text })
    for (const p of onlyMine.slice(both)) out.push({ kind: 'added', at: { section: p.section, para: p.para }, mine: p.text, theirs: '' })
    // A paragraph only in the other one is shown where it would be: before the next matched paragraph here.
    const next = a[iEnd]
    for (const p of onlyTheirs.slice(both)) out.push({ kind: 'removed', at: next ? { section: next.section, para: next.para } : null, mine: '', theirs: p.text })
  }
  for (const [pi, pj] of pairs) {
    gap(pi, pj)
    i = pi + 1
    j = pj + 1
  }
  gap(a.length, b.length)
  return out
}
