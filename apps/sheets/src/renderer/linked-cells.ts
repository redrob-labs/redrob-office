/**
 * Linked cells: a cell in this workbook as the source of a linked figure.
 *
 * Linking a cell defines a fact whose source is `<workbook path>` and
 * `<Sheet>!<A1>`; when that cell's value changes (typed, pasted or
 * recalculated), the workbook sends one edit and every other file that uses
 * the figure waits in Updates. Pure functions, so the rules are testable
 * without Univer.
 */
import { sameValue, type FactDef, type FactsCommand, type FactsState } from '@genoffice/facts'

/** Linked-cell copy; English is the master and the only selectable language. */
export const LINKED_CELL_STRINGS = {
  tool: 'Link this cell',
  linked: '{ref} is linked. Documents can now use it, and they follow when it changes.',
  notSaved: 'Save this workbook once to link its cells.',
  notNumber: 'Only a cell with a number can be linked.',
  noCell: 'Select one cell to link.',
  unavailable: 'Linked figures work when the workbook is open in Redrob Office.',
  failed: 'The link was not saved. Nothing changed in other files.',
  sent: '{ref} changed. {n} other files wait in Updates.',
  sentOne: '{ref} changed. 1 other file waits in Updates.',
} as const

export interface CellRef {
  sheet: string
  /** A1 address, e.g. `C2` */
  a1: string
}

/** `Summary!C2`; a sheet name with spaces or punctuation is quoted as Excel does. */
export function formatCellRef({ sheet, a1 }: CellRef): string {
  const plain = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheet)
  return `${plain ? sheet : `'${sheet.replace(/'/g, "''")}'`}!${a1}`
}

/** The inverse of formatCellRef; null when it is not a single-cell reference. */
export function parseCellRef(ref: string): CellRef | null {
  const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!\$?([A-Z]{1,3})\$?([1-9][0-9]{0,6})$/.exec(ref)
  if (!m) return null
  return { sheet: m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]!, a1: `${m[3]}${m[4]}` }
}

/** 32-bit FNV-1a, as eight hex digits. */
function fnv(s: string, seed: number): string {
  let h = seed >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * A stable fact id for a cell: the same workbook path and cell always give
 * the same id, so linking a cell twice is one fact. Ids stay inside the set
 * Word allows in a DOCVARIABLE name.
 */
export function factIdForCell(path: string, ref: CellRef): string {
  const key = `${path.toLowerCase()}|${ref.sheet}!${ref.a1}`
  return `cell-${fnv(key, 0x811c9dc5)}${fnv(key, 0x01000193)}`
}

export interface LinkCellInput {
  path: string
  ref: CellRef
  value: unknown
  /** the text in the cell to the left, if any: the figure's name */
  labelLeft?: unknown
}

export type LinkCellResult =
  | { ok: true; fact: FactDef; value: number; commands: FactsCommand[] }
  | { ok: false; reason: 'not-saved' | 'not-a-number' }

/** What linking a cell sends to the shell's index. */
export function linkCellCommands({ path, ref, value, labelLeft }: LinkCellInput): LinkCellResult {
  if (!path) return { ok: false, reason: 'not-saved' }
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isFinite(n)) return { ok: false, reason: 'not-a-number' }
  const where = formatCellRef(ref)
  const label = typeof labelLeft === 'string' && labelLeft.trim() ? labelLeft.trim().slice(0, 120) : where
  const fact: FactDef = { id: factIdForCell(path, ref), label, source: { file: path, ref: where } }
  return {
    ok: true,
    fact,
    value: n,
    commands: [
      { type: 'defineFact', fact, value: n },
      { type: 'useFact', file: path, use: { fact: fact.id, kind: 'value', where } },
    ],
  }
}

/** The facts whose source is a cell in this workbook. */
export function linkedCellsIn(state: FactsState | null, path: string | undefined): Array<{ fact: string; ref: CellRef }> {
  if (!state || !path) return []
  const out: Array<{ fact: string; ref: CellRef }> = []
  const key = path.toLowerCase()
  for (const def of Object.values(state.facts)) {
    if (def.source.file.toLowerCase() !== key) continue
    const ref = parseCellRef(def.source.ref)
    if (ref) out.push({ fact: def.id, ref })
  }
  return out
}

/**
 * The edits to send after the grid changed: one per linked cell whose value
 * now differs from the fact's source value. A cell that is empty, text or an
 * error sends nothing (a figure never becomes "#REF!").
 */
export function sourceEdits(
  state: FactsState | null,
  path: string | undefined,
  readCell: (ref: CellRef) => unknown,
): FactsCommand[] {
  if (!state || !path) return []
  const out: FactsCommand[] = []
  for (const { fact, ref } of linkedCellsIn(state, path)) {
    let raw: unknown
    try {
      raw = readCell(ref)
    } catch {
      continue
    }
    const v = typeof raw === 'number' ? raw : Number.NaN
    const current = state.values[fact]
    if (!Number.isFinite(v) || current === undefined || sameValue(v, current)) continue
    out.push({ type: 'editSource', fact, file: path, to: v })
  }
  return out
}
