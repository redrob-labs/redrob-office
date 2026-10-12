/**
 * Linked figures in a .docx.
 *
 * A linked figure is a Word field, `DOCVARIABLE RedrobFact_<id>` for the value
 * or `DOCVARIABLE RedrobFactWords_<id>` for the sentence that depends on it.
 * The cached result is what the document shows, so Word, LibreOffice and any
 * reader without Redrob see the number the file last kept. The link to the
 * source lives in the instruction; the app-wide index in the shell says which
 * files use which fact.
 */

export type LinkedFigurePart = 'figures' | 'sentence'

export interface LinkedFigureRef {
  fact: string
  part: LinkedFigurePart
}

const VALUE = 'RedrobFact_'
const WORDS = 'RedrobFactWords_'
/** Word variable names are letters, digits and underscores; keep ids inside that plus `-`. */
const ID_RE = /^[A-Za-z0-9_-]{1,120}$/
const INSTR_RE = /^\s*DOCVARIABLE\s+(RedrobFactWords_|RedrobFact_)([A-Za-z0-9_-]{1,120})(?:\s+\\\*\s*MERGEFORMAT)?\s*$/

export function isLinkedFigureId(id: string): boolean {
  return ID_RE.test(id)
}

/** The field instruction for a figure; throws on an id Word could not name. */
export function linkedFigureInstr(fact: string, part: LinkedFigurePart = 'figures'): string {
  if (!isLinkedFigureId(fact)) throw new Error(`Invalid linked figure id: ${fact}`)
  return `DOCVARIABLE ${part === 'sentence' ? WORDS : VALUE}${fact} \\* MERGEFORMAT`
}

/** The figure an instruction names, or null when it is any other field. */
export function parseLinkedFigureInstr(instr: string): LinkedFigureRef | null {
  const m = INSTR_RE.exec(instr)
  if (!m) return null
  return { fact: m[2]!, part: m[1] === WORDS ? 'sentence' : 'figures' }
}
