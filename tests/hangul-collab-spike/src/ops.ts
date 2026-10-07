// The edit vocabulary of the spike: body text of section 0, addressed by
// paragraph index and offset. Offsets are code points, as the engine counts
// them (an astral character is one); the fuzzer stays in the BMP so code
// points and Yjs's UTF-16 indices agree. A real binding maps between the two.
import type { HwpCoreDocument } from '@genoffice/hwp-core'

export type Op =
  | { t: 'insert'; p: number; o: number; text: string }
  | { t: 'delete'; p: number; o: number; n: number }
  | { t: 'split'; p: number; o: number }
  | { t: 'merge'; p: number } // join paragraph p and p + 1

export function paragraphs(doc: HwpCoreDocument): string[] {
  const out: string[] = []
  for (let p = 0; p < doc.paragraphCount(0); p++) out.push(doc.text(0, p))
  return out
}

/** Apply an op to the engine. Ops are assumed valid for the current state. */
export function applyToCore(doc: HwpCoreDocument, op: Op): void {
  switch (op.t) {
    case 'insert':
      if (op.text) check(doc.insertText(0, op.p, op.o, op.text))
      return
    case 'delete':
      if (op.n > 0) check(doc.deleteRange(0, op.p, op.o, op.p, op.o + op.n))
      return
    case 'split':
      check(JSON.parse(doc.raw.splitParagraph(0, op.p, op.o)))
      return
    case 'merge':
      check(doc.deleteRange(0, op.p, doc.paragraphLength(0, op.p), op.p + 1, 0))
      return
  }
}

function check(r: { ok: boolean; error?: string }): void {
  if (!r.ok) throw new Error(`engine refused an edit: ${r.error ?? JSON.stringify(r)}`)
}

/** A deterministic PRNG so a failing fuzz seed can be replayed. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SYLLABLES = '가나다라마바사아자차카타파하한글문서정부공문'

/** A random valid op for the paragraph state `paras`. */
export function randomOp(paras: string[], rand: () => number, allowMerge = true): Op {
  const p = Math.floor(rand() * paras.length)
  const len = [...paras[p]!].length
  const r = rand()
  if (r < 0.5 || len === 0) {
    const n = 1 + Math.floor(rand() * 3)
    let text = ''
    for (let i = 0; i < n; i++) text += SYLLABLES[Math.floor(rand() * SYLLABLES.length)]
    return { t: 'insert', p, o: Math.floor(rand() * (len + 1)), text }
  }
  if (r < 0.75) {
    const o = Math.floor(rand() * len)
    return { t: 'delete', p, o, n: 1 + Math.floor(rand() * Math.min(3, len - o)) }
  }
  if (r < 0.9 || !allowMerge || paras.length < 2 || p === paras.length - 1) return { t: 'split', p, o: Math.floor(rand() * (len + 1)) }
  return { t: 'merge', p }
}
