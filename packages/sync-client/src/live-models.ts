/**
 * Live sharing for editors whose document is not one text: Sheets shares
 * cell contents, Slides shares the text of each shape. Both are maps in the
 * room's Y.Doc, keyed by a durable address, last writer wins per entry.
 * That is how people edit those documents (one cell, one text box at a
 * time); two people typing in the same text box at once keep the later one.
 *
 * Only yjs: preloads and renderers may import this.
 */
import type * as Y from 'yjs'

const LOCAL = Symbol('live-model-local')

/** One cell's content: the value shown, and its formula when it has one. */
export interface LiveCell {
  sheetId: string
  row: number
  col: number
  v: string | number | boolean | null
  f?: string | undefined
}

export const CELLS_MAP = 'cells'
const cellKey = (c: { sheetId: string; row: number; col: number }) => `${c.sheetId}!${c.row}:${c.col}`

function parseCellKey(key: string): { sheetId: string; row: number; col: number } | null {
  const m = /^(.+)!(\d{1,7}):(\d{1,5})$/.exec(key)
  return m ? { sheetId: m[1]!, row: Number(m[2]), col: Number(m[3]) } : null
}

function cleanCellValue(raw: unknown): { v: LiveCell['v']; f?: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { v?: unknown; f?: unknown }
  const v = r.v === null || ['string', 'number', 'boolean'].includes(typeof r.v) ? (r.v as LiveCell['v']) : null
  if (typeof r.v === 'number' && !Number.isFinite(r.v)) return null
  const f = typeof r.f === 'string' && r.f.length <= 8192 ? r.f : undefined
  if (typeof v === 'string' && v.length > 32767) return null
  return f ? { v, f } : { v }
}

export interface CellsBinding {
  /** cells this person changed (a read-only session writes nothing) */
  push(cells: readonly LiveCell[]): void
  /** every cell the room holds, e.g. to apply on joining */
  all(): LiveCell[]
  destroy(): void
}

export function bindCells(doc: Y.Doc, opts: { readOnly: boolean; onRemote: (cells: LiveCell[]) => void }): CellsBinding {
  // entries are checked on the way out, so the map is read as unknown
  const map = doc.getMap<unknown>(CELLS_MAP)
  const toCells = (keys: Iterable<string>): LiveCell[] => {
    const out: LiveCell[] = []
    for (const key of keys) {
      const at = parseCellKey(key)
      const value = cleanCellValue(map.get(key))
      if (at && value) out.push({ ...at, ...value })
    }
    return out
  }
  const observe = (e: Y.YMapEvent<unknown>) => {
    if (e.transaction.origin === LOCAL) return
    const cells = toCells(e.keysChanged)
    if (cells.length > 0) opts.onRemote(cells)
  }
  map.observe(observe)
  return {
    push(cells) {
      if (opts.readOnly || cells.length === 0) return
      doc.transact(() => {
        for (const c of cells) {
          const value = cleanCellValue(c)
          if (value) map.set(cellKey(c), value)
        }
      }, LOCAL)
    },
    all: () => toCells(map.keys()),
    destroy: () => map.unobserve(observe),
  }
}

/** One text box's paragraphs, as the editor's own edit payload (opaque JSON here). */
export interface LiveShapeText {
  slideId: string
  shapeId: string
  paragraphs: unknown[]
}

export const SHAPES_MAP = 'shape-text'
const MAX_SHAPE_JSON = 512 * 1024

export interface ShapesBinding {
  push(edit: LiveShapeText): void
  all(): LiveShapeText[]
  destroy(): void
}

export function bindShapeText(doc: Y.Doc, opts: { readOnly: boolean; onRemote: (edits: LiveShapeText[]) => void }): ShapesBinding {
  const map = doc.getMap<string>(SHAPES_MAP)
  const toEdits = (keys: Iterable<string>): LiveShapeText[] => {
    const out: LiveShapeText[] = []
    for (const key of keys) {
      const i = key.indexOf('|')
      const raw = map.get(key)
      if (i <= 0 || typeof raw !== 'string') continue
      try {
        const paragraphs = JSON.parse(raw) as unknown
        if (Array.isArray(paragraphs)) out.push({ slideId: key.slice(0, i), shapeId: key.slice(i + 1), paragraphs })
      } catch {
        // a malformed entry is skipped; the next write replaces it
      }
    }
    return out
  }
  const observe = (e: Y.YMapEvent<string>) => {
    if (e.transaction.origin === LOCAL) return
    const edits = toEdits(e.keysChanged)
    if (edits.length > 0) opts.onRemote(edits)
  }
  map.observe(observe)
  return {
    push(edit) {
      if (opts.readOnly || !edit.slideId || !edit.shapeId || edit.slideId.includes('|')) return
      const json = JSON.stringify(edit.paragraphs)
      if (json.length > MAX_SHAPE_JSON) return
      const key = `${edit.slideId}|${edit.shapeId}`
      if (map.get(key) === json) return
      doc.transact(() => map.set(key, json), LOCAL)
    },
    all: () => toEdits(map.keys()),
    destroy: () => map.unobserve(observe),
  }
}
