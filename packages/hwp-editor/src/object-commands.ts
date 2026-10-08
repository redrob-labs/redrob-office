// Table, cell and object property commands (spec task 2.3): 표/셀 속성 and the
// object property dialogs read the engine's own property JSON and write back
// only the keys the person changed, each as one undo step.
//
// Lengths are HWPUNIT (7200 per inch). A cell's borders and fill are its
// border-fill: `borderLeft/Right/Top/Bottom` ({ type, width, color }, where
// `type` is the HWP line type 0–17 and `width` the HWP width index 0–15) and
// `fillType` ('none' | 'solid') with `fillColor`.
import type { ChartData, NewChart } from '@genoffice/hwp-core'
import { inBody, type Pos } from './position'
import type { ObjectRef, Session } from './session'
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
  return p.cell && !p.cell.textBox ? { section: p.section, host: p.para, control: p.cell.control } : null
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

// ── Pictures and drawing objects ──────────────────────────────────────

/** An object's box on a page, in page pixels (96 per inch). */
export interface ObjectBox extends ObjectRef {
  page: number
  x: number
  y: number
  width: number
  height: number
  /** paint order on the page: higher is drawn later, on top */
  zOrder: number
  /** a group of objects (개체 묶기), selected and moved as one shape */
  group?: true
}

interface LayoutControl {
  type: string
  x: number
  y: number
  w: number
  h: number
  secIdx?: number
  paraIdx?: number
  controlIdx?: number
}

/** The pictures and drawing objects the engine laid out on a page. */
export function objectsOnPage(s: Session, page: number): ObjectBox[] {
  const r = JSON.parse(s.doc.raw.getPageControlLayout(page)) as { controls?: LayoutControl[] }
  const out: ObjectBox[] = []
  let charts: Set<string> | null = null
  const isChart = (sec: number, para: number, ctrl: number) => {
    charts ??= new Set(s.doc.charts().map((c) => `${c.section}:${c.paragraph}:${c.control}`))
    return charts.has(`${sec}:${para}:${ctrl}`)
  }
  // The engine lists controls in paint order; its own `zOrder` field is not reliable here.
  for (const [i, c] of (r.controls ?? []).entries()) {
    if (c.secIdx === undefined || c.paraIdx === undefined || c.controlIdx === undefined) continue
    const kind = c.type === 'image' ? 'picture' : c.type === 'equation' ? 'equation' : isChart(c.secIdx, c.paraIdx, c.controlIdx) ? 'chart' : c.type === 'shape' || c.type === 'group' ? 'shape' : null
    if (!kind) continue
    out.push({ kind, section: c.secIdx, para: c.paraIdx, control: c.controlIdx, page, x: c.x, y: c.y, width: c.w, height: c.h, zOrder: i, ...(c.type === 'group' ? { group: true as const } : {}) })
  }
  return out
}

/** The topmost picture or drawing object under a page point, if any. */
export function objectAt(s: Session, page: number, x: number, y: number): ObjectBox | null {
  const hits = objectsOnPage(s, page).filter((o) => x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height)
  return hits.sort((a, b) => b.zOrder - a.zOrder)[0] ?? null
}

/** Where an object is drawn now (it moves when the text before it reflows). */
export function objectBox(s: Session, o: ObjectRef): ObjectBox | null {
  for (let page = 0; page < s.doc.pageCount(); page++) {
    const hit = objectsOnPage(s, page).find((b) => b.kind === o.kind && b.section === o.section && b.para === o.para && b.control === o.control)
    if (hit) return hit
  }
  return null
}

export function objectProperties(s: Session, o: ObjectRef | null = s.object): Record<string, unknown> | null {
  if (!o) return null
  try {
    const raw = s.doc.raw
    const r =
      o.kind === 'picture'
        ? raw.getPictureProperties(o.section, o.para, o.control)
        : o.kind === 'equation'
          ? raw.getEquationProperties(o.section, o.para, o.control, -1, -1)
          : raw.getShapeProperties(o.section, o.para, o.control)
    return json(r, 'objectProperties')
  } catch {
    return null
  }
}

/** HWP colours are COLORREF integers (0x00BBGGRR); the dialogs speak CSS hex. */
export function colorRefToCss(v: unknown): string {
  const n = Number(v) >>> 0
  const hex = (x: number) => x.toString(16).padStart(2, '0')
  return `#${hex(n & 0xff)}${hex((n >> 8) & 0xff)}${hex((n >> 16) & 0xff)}`
}

export function cssToColorRef(css: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css.trim())
  if (!m) return 0
  return parseInt(m[1]!, 16) | (parseInt(m[2]!, 16) << 8) | (parseInt(m[3]!, 16) << 16)
}

const hasObject = ({ session }: { session: Session }) => session.object !== null

export const setObjectProperties: Command<{ props: Record<string, unknown> }> = {
  id: 'object:set-properties',
  isEnabled: hasObject,
  run({ session }, { props }) {
    const o = session.object!
    if (!Object.keys(props).length) return null
    const sel = session.selection
    return session.edit('object:set-properties', () => {
      const raw = session.doc.raw
      const body = JSON.stringify(props)
      json(
        o.kind === 'picture'
          ? raw.setPictureProperties(o.section, o.para, o.control, body)
          : o.kind === 'equation'
            ? raw.setEquationProperties(o.section, o.para, o.control, -1, -1, body)
            : raw.setShapeProperties(o.section, o.para, o.control, body),
        'setObjectProperties',
      )
      return sel
    })
  },
}

export const deleteObject: Command = {
  id: 'insert:picture-delete',
  isEnabled: hasObject,
  run({ session }) {
    const o = session.object!
    const change = session.edit('insert:picture-delete', () => {
      const raw = session.doc.raw
      json(
        o.kind === 'picture'
          ? raw.deletePictureControl(o.section, o.para, o.control)
          : o.kind === 'equation'
            ? raw.deleteEquationControl(o.section, o.para, o.control)
            : raw.deleteShapeControl(o.section, o.para, o.control),
        'deleteObject',
      )
      const q: Pos = { section: o.section, para: o.para, offset: 0 }
      return { anchor: q, head: q }
    })
    session.selectObject(null)
    return change
  },
}

function zOrder(id: string, op: 'front' | 'back' | 'forward' | 'backward'): Command {
  return {
    id,
    isEnabled: ({ session }) => !!session.object && session.object.kind !== 'equation',
    run({ session }) {
      const o = session.object!
      const sel = session.selection
      return session.edit(id, () => {
        json(session.doc.raw.changeShapeZOrder(o.section, o.para, o.control, op), 'changeShapeZOrder')
        return sel
      })
    },
  }
}

export type ShapeKind = 'rectangle' | 'ellipse' | 'line' | 'textbox'

/**
 * Insert a drawing object at the caret, anchored to its paragraph. 한글 draws
 * a shape by dragging; this places one at a default size the person can then
 * resize in the object properties.
 */
export const insertShape: Command<{ shapeType: ShapeKind; width?: number; height?: number }> = {
  id: 'insert:shape',
  isEnabled: ({ session }) => inBody(session.selection.head),
  run({ session }, { shapeType, width = 14173, height = 7087 }) {
    const p = session.selection.head
    let created: ObjectRef | null = null
    const change = session.edit('insert:shape', () => {
      const raw = session.doc.raw
      const r = json(
        raw.createShapeControl(JSON.stringify({ sectionIdx: p.section, paraIdx: p.para, charOffset: p.offset, width, height: shapeType === 'line' ? 0 : height, shapeType })),
        'createShapeControl',
      )
      const ref: ObjectRef = { kind: 'shape', section: p.section, para: Number(r.paraIdx), control: Number(r.controlIdx) }
      if (shapeType !== 'textbox') {
        // Anchor to the paragraph so it travels with the text, not pinned to the paper corner.
        json(raw.setShapeProperties(ref.section, ref.para, ref.control, JSON.stringify({ vertRelTo: 'Para', horzRelTo: 'Para', vertOffset: 0, horzOffset: 0 })), 'setShapeProperties')
      }
      // A new object goes on top of the others, as in 한글 (the engine creates every shape at z 0).
      json(raw.changeShapeZOrder(ref.section, ref.para, ref.control, 'front'), 'changeShapeZOrder')
      created = ref
      return session.selection
    })
    session.selectObject(created)
    return change
  },
}

/** The selected object, when it is a chart. */
export function selectedChart(s: Session): ObjectRef | null {
  const o = s.object
  if (!o || o.kind !== 'chart') return null
  return o
}

export function chartData(s: Session, o: ObjectRef | null = selectedChart(s)): ChartData | null {
  if (!o) return null
  try {
    return s.doc.chartData(o.section, o.para, o.control)
  } catch {
    return null
  }
}

/** Insert a chart at the caret (body text) and select it. */
export const insertChart: Command<{ chart: NewChart }> = {
  id: 'insert:chart',
  isEnabled: ({ session }) => inBody(session.selection.head),
  run({ session }, { chart }) {
    const p = session.selection.head
    let created: ObjectRef | null = null
    const change = session.edit('insert:chart', () => {
      const r = session.doc.insertChart(p.section, p.para, p.offset, chart)
      created = { kind: 'chart', section: p.section, para: r.paraIdx, control: r.controlIdx }
      return session.selection
    })
    session.selectObject(created)
    return change
  },
}

/**
 * Replace the selected chart's categories and series (rows and columns may
 * change). Values are numbers here and stored as the shortest text that reads
 * back the same.
 */
export const setChartDataCommand: Command<{ categories: string[]; series: Array<{ name: string; values: number[] }> }> = {
  id: 'chart:set-data',
  isEnabled: ({ session }) => selectedChart(session) !== null,
  run({ session }, { categories, series }) {
    const o = selectedChart(session)!
    if (series.some((x) => x.values.length !== categories.length || x.values.some((v) => !Number.isFinite(v)))) throw new Error('chart:set-data: every series needs one number per category')
    const sel = session.selection
    return session.edit('chart:set-data', () => {
      const r = session.doc.setChartData(o.section, o.para, o.control, { labels: categories, series: series.map((x) => ({ name: x.name, values: x.values.map((v) => String(v)) })), structure: true })
      if (!r.ok) throw new Error(`chart:set-data: ${(r.invalid ?? []).map((i) => i.message).join('; ') || 'refused'}`)
      return sel
    })
  },
}

/** 수식 고치기: the selected equation's script. */
export const editEquation: Command<{ script: string }> = {
  id: 'insert:equation-edit',
  isEnabled: ({ session }) => session.object?.kind === 'equation',
  run(ctx, { script }) {
    if (!script.trim()) throw new Error('insert:equation-edit: an equation needs a script')
    return setObjectProperties.run(ctx, { props: { script } })
  },
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
/** HWPUNIT per CSS px at 96 dpi. */
export const HU_PER_PX = 75

/** The box an object takes after a drag of (dx, dy) page px: moved, or resized from a handle. */
export function draggedBox(box: { x: number; y: number; width: number; height: number }, handle: Handle | 'move', dx: number, dy: number, minPx = 4): { x: number; y: number; width: number; height: number } {
  if (handle === 'move') return { ...box, x: box.x + dx, y: box.y + dy }
  let { x, y, width, height } = box
  if (handle.includes('e')) width = Math.max(minPx, width + dx)
  if (handle.includes('s')) height = Math.max(minPx, height + dy)
  if (handle.includes('w')) {
    const w = Math.max(minPx, width - dx)
    x += width - w
    width = w
  }
  if (handle.includes('n')) {
    const h = Math.max(minPx, height - dy)
    y += height - h
    height = h
  }
  return { x, y, width, height }
}

/**
 * Move or resize the selected object by a drag, as one undo step. Offsets and
 * size change by the drag in HWPUNIT; an object placed as a character moves
 * with its text and can only be resized.
 */
export const dragObject: Command<{ handle: Handle | 'move'; dx: number; dy: number }> = {
  id: 'object:drag',
  isEnabled: ({ session }) => !!session.object && session.object.kind !== 'equation',
  run(ctx, { handle, dx, dy }) {
    const p = objectProperties(ctx.session)
    if (!p) return null
    const inline = !!p.treatAsChar
    if (handle === 'move' && inline) return null
    const w0 = Number(p.width)
    const h0 = Number(p.height)
    const next = draggedBox({ x: 0, y: 0, width: w0 / HU_PER_PX, height: h0 / HU_PER_PX }, handle, dx, dy)
    const props: Record<string, unknown> = {}
    const width = Math.round(next.width * HU_PER_PX)
    const height = Math.round(next.height * HU_PER_PX)
    if (width !== w0) props.width = width
    if (height !== h0) props.height = height
    if (!inline) {
      const mx = Math.round(next.x * HU_PER_PX)
      const my = Math.round(next.y * HU_PER_PX)
      if (mx) props.horzOffset = Number(p.horzOffset ?? 0) + mx
      if (my) props.vertOffset = Number(p.vertOffset ?? 0) + my
    }
    if (!Object.keys(props).length) return null
    return setObjectProperties.run(ctx, { props })
  },
}

export const OBJECT_COMMANDS = [
  dragObject,
  editEquation,
  insertChart,
  setChartDataCommand,
  setTableProperties,
  setCellProperties,
  setObjectProperties,
  deleteObject,
  zOrder('insert:arrange-front', 'front'),
  zOrder('insert:arrange-back', 'back'),
  zOrder('insert:arrange-forward', 'forward'),
  zOrder('insert:arrange-backward', 'backward'),
  insertShape,
] as Command<never>[]
