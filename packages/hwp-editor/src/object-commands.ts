// Table, cell and object property commands (spec task 2.3): 표/셀 속성 and the
// object property dialogs read the engine's own property JSON and write back
// only the keys the person changed, each as one undo step.
//
// Lengths are HWPUNIT (7200 per inch). A cell's borders and fill are its
// border-fill: `borderLeft/Right/Top/Bottom` ({ type, width, color }, where
// `type` is the HWP line type 0–17 and `width` the HWP width index 0–15) and
// `fillType` ('none' | 'solid') with `fillColor`.
import type { Pos } from './position'
import type { Session } from './session'
import type { Command } from './commands'

function json(r: string, what: string): Record<string, unknown> {
  const v = JSON.parse(r) as Record<string, unknown>
  if (v.ok === false) throw new Error(`${what}: ${String(v.error ?? r)}`)
  return v
}

/** The table the caret is in (a body-level table; nested tables are not addressed yet). */
export interface TableTarget {
  section: number
  /** paragraph holding the table */
  host: number
  control: number
}

export interface CellGeometry {
  index: number
  row: number
  col: number
  rowSpan: number
  colSpan: number
}

export function tableAt(s: Session, p: Pos = s.selection.head): TableTarget | null {
  return p.cell ? { section: p.section, host: p.para, control: p.cell.control } : null
}

export function tableCells(s: Session, t: TableTarget): CellGeometry[] {
  const raw = s.doc.raw
  const dims = json(raw.getTableDimensions(t.section, t.host, t.control), 'getTableDimensions')
  const out: CellGeometry[] = []
  for (let i = 0; i < Number(dims.cellCount); i++) {
    const c = json(raw.getCellInfo(t.section, t.host, t.control, i), 'getCellInfo')
    out.push({ index: i, row: Number(c.row), col: Number(c.col), rowSpan: Number(c.rowSpan), colSpan: Number(c.colSpan) })
  }
  return out
}

/**
 * The cells the selection covers: the rectangle between the anchor's and the
 * head's cells when both are in the same table, else the caret's cell.
 */
export function selectedCells(s: Session): number[] {
  const { anchor, head } = s.selection
  const t = tableAt(s)
  if (!t || !head.cell) return []
  if (!anchor.cell || anchor.section !== head.section || anchor.para !== head.para || anchor.cell.control !== head.cell.control || anchor.cell.cell === head.cell.cell) {
    return [head.cell.cell]
  }
  const cells = tableCells(s, t)
  const a = cells[anchor.cell.cell]!
  const b = cells[head.cell.cell]!
  const r0 = Math.min(a.row, b.row)
  const r1 = Math.max(a.row + a.rowSpan, b.row + b.rowSpan) - 1
  const c0 = Math.min(a.col, b.col)
  const c1 = Math.max(a.col + a.colSpan, b.col + b.colSpan) - 1
  return cells.filter((c) => c.row >= r0 && c.row <= r1 && c.col >= c0 && c.col <= c1).map((c) => c.index)
}

export function tableProperties(s: Session, t: TableTarget | null = tableAt(s)): Record<string, unknown> | null {
  if (!t) return null
  return json(s.doc.raw.getTableProperties(t.section, t.host, t.control), 'getTableProperties')
}

export function cellProperties(s: Session, cell?: number, t: TableTarget | null = tableAt(s)): Record<string, unknown> | null {
  const h = s.selection.head
  const index = cell ?? h.cell?.cell
  if (!t || index === undefined) return null
  return json(s.doc.raw.getCellProperties(t.section, t.host, t.control, index), 'getCellProperties')
}

export const setTableProperties: Command<{ props: Record<string, unknown> }> = {
  id: 'table:set-properties',
  isEnabled: ({ session }) => tableAt(session) !== null,
  run({ session }, { props }) {
    const t = tableAt(session)!
    if (!Object.keys(props).length) return null
    const sel = session.selection
    return session.edit('table:set-properties', () => {
      json(session.doc.raw.setTableProperties(t.section, t.host, t.control, JSON.stringify(props)), 'setTableProperties')
      return sel
    })
  },
}

/** Cell properties for the selected cells (or the listed ones), as one undo step. */
export const setCellProperties: Command<{ props: Record<string, unknown>; cells?: number[] }> = {
  id: 'table:cell-set-properties',
  isEnabled: ({ session }) => tableAt(session) !== null,
  run({ session }, { props, cells }) {
    const t = tableAt(session)!
    const targets = cells ?? selectedCells(session)
    if (!Object.keys(props).length || !targets.length) return null
    const sel = session.selection
    const body = JSON.stringify(props)
    return session.edit('table:cell-set-properties', () => {
      for (const c of targets) json(session.doc.raw.setCellProperties(t.section, t.host, t.control, c, body), 'setCellProperties')
      return sel
    })
  },
}

export const OBJECT_COMMANDS = [setTableProperties, setCellProperties] as Command<never>[]
