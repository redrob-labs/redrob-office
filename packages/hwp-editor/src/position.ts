// Positions in a Hangul document and the engine calls that act on them.
//
// A position is a caret slot: before character `offset` of a paragraph. The
// paragraph is either a body paragraph or a paragraph in a table cell. Offsets
// are code points, the engine's unit (an emoji or a 옛한글 jamo counts as
// written), never UTF-16 units.
//
// Every engine call that differs between body and cell goes through `Text`, so
// commands, the AI skill and the live binding never branch on context.
import type { CursorRect, HwpCoreDocument, SelectionRect } from '@genoffice/hwp-core'

export interface CellRef {
  /** Control index of the table in its host paragraph. */
  control: number
  cell: number
  /** Paragraph index inside the cell. */
  para: number
}

export interface Pos {
  section: number
  /** Body paragraph; for a cell position, the table's host paragraph. */
  para: number
  offset: number
  cell?: CellRef
}

/** The container a paragraph sits in: the section body, or one table cell. */
export interface Container {
  section: number
  /** For a cell: the table's host paragraph, control and cell. */
  cell?: { host: number; control: number; cell: number }
}

export function containerOf(p: Pos): Container {
  return p.cell ? { section: p.section, cell: { host: p.para, control: p.cell.control, cell: p.cell.cell } } : { section: p.section }
}

/** Index of the position's paragraph inside its container. */
export function paraIndex(p: Pos): number {
  return p.cell ? p.cell.para : p.para
}

export function sameContainer(a: Pos, b: Pos): boolean {
  if (a.section !== b.section) return false
  if (!a.cell || !b.cell) return !a.cell && !b.cell
  return a.para === b.para && a.cell.control === b.cell.control && a.cell.cell === b.cell.cell
}

/** Position at paragraph `index` of a container. */
export function at(c: Container, index: number, offset: number): Pos {
  return c.cell ? { section: c.section, para: c.cell.host, offset, cell: { control: c.cell.control, cell: c.cell.cell, para: index } } : { section: c.section, para: index, offset }
}

/** Order two positions in the same container. */
export function compare(a: Pos, b: Pos): number {
  return paraIndex(a) - paraIndex(b) || a.offset - b.offset
}

export function equal(a: Pos, b: Pos): boolean {
  return sameContainer(a, b) && compare(a, b) === 0
}

function ok(json: string, what: string): Record<string, unknown> {
  const r = JSON.parse(json) as Record<string, unknown>
  if (r.ok === false) throw new Error(`${what}: ${String(r.error ?? json)}`)
  return r
}

/** Container-agnostic text operations over the engine. */
export class Text {
  constructor(readonly doc: HwpCoreDocument) {}

  private get raw() {
    return this.doc.raw
  }

  paragraphCount(c: Container): number {
    return c.cell ? this.raw.getCellParagraphCount(c.section, c.cell.host, c.cell.control, c.cell.cell) : this.doc.paragraphCount(c.section)
  }

  length(p: Pos): number {
    return p.cell
      ? this.raw.getCellParagraphLength(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para)
      : this.doc.paragraphLength(p.section, p.para)
  }

  /** Text of the paragraph at `p`, from `offset` for `count` code points (default: to the end). */
  text(p: Pos, offset = 0, count?: number): string {
    const n = count ?? Math.max(0, this.length(p) - offset)
    return p.cell ? this.raw.getTextInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, offset, n) : this.doc.text(p.section, p.para, offset, n)
  }

  insert(p: Pos, text: string): Pos {
    if (!text) return p
    const r = p.cell
      ? ok(this.raw.insertTextInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, p.offset, text), 'insertTextInCell')
      : ok(this.raw.insertText(p.section, p.para, p.offset, text), 'insertText')
    return { ...p, offset: Number(r.charOffset ?? p.offset + [...text].length) }
  }

  /** Delete [from, to) in one container; returns the collapsed position. */
  delete(from: Pos, to: Pos): Pos {
    if (!sameContainer(from, to)) throw new Error('delete across containers')
    const [a, b] = compare(from, to) <= 0 ? [from, to] : [to, from]
    if (compare(a, b) === 0) return a
    if (a.cell) {
      ok(this.raw.deleteRangeInCell(a.section, a.para, a.cell.control, a.cell.cell, a.cell.para, a.offset, b.cell!.para, b.offset), 'deleteRangeInCell')
    } else {
      ok(this.raw.deleteRange(a.section, a.para, a.offset, b.para, b.offset), 'deleteRange')
    }
    return a
  }

  /** Split the paragraph at `p`; returns the start of the new paragraph. */
  split(p: Pos): Pos {
    if (p.cell) {
      const r = ok(this.raw.splitParagraphInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, p.offset), 'splitParagraphInCell')
      return { ...p, offset: 0, cell: { ...p.cell, para: Number(r.cellParaIndex) } }
    }
    const r = ok(this.raw.splitParagraph(p.section, p.para, p.offset), 'splitParagraph')
    return { section: p.section, para: Number(r.paraIdx), offset: 0 }
  }

  applyCharFormat(from: Pos, to: Pos, props: Record<string, unknown>): void {
    if (!sameContainer(from, to)) throw new Error('format across containers')
    const [a, b] = compare(from, to) <= 0 ? [from, to] : [to, from]
    const json = JSON.stringify(props)
    for (let i = paraIndex(a); i <= paraIndex(b); i++) {
      const p = at(containerOf(a), i, 0)
      const start = i === paraIndex(a) ? a.offset : 0
      const end = i === paraIndex(b) ? b.offset : this.length(p)
      if (end <= start) continue
      if (p.cell) ok(this.raw.applyCharFormatInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, start, end, json), 'applyCharFormatInCell')
      else ok(this.raw.applyCharFormat(p.section, p.para, start, end, json), 'applyCharFormat')
    }
  }

  charPropertiesAt(p: Pos): Record<string, unknown> {
    const json = p.cell
      ? this.raw.getCellCharPropertiesAt(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, p.offset)
      : this.raw.getCharPropertiesAt(p.section, p.para, p.offset)
    return JSON.parse(json) as Record<string, unknown>
  }

  cursorRect(p: Pos): CursorRect {
    const json = p.cell
      ? this.raw.getCursorRectInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, p.offset)
      : this.raw.getCursorRect(p.section, p.para, p.offset)
    return JSON.parse(json) as CursorRect
  }

  selectionRects(from: Pos, to: Pos): SelectionRect[] {
    if (!sameContainer(from, to)) return []
    const [a, b] = compare(from, to) <= 0 ? [from, to] : [to, from]
    const json = a.cell
      ? this.raw.getSelectionRectsInCell(a.section, a.para, a.cell.control, a.cell.cell, a.cell.para, a.offset, b.cell!.para, b.offset)
      : this.raw.getSelectionRects(a.section, a.para, a.offset, b.para, b.offset)
    return JSON.parse(json) as SelectionRect[]
  }

  /** Text between two positions in one container, paragraphs joined with "\n". */
  textBetween(from: Pos, to: Pos): string {
    const [a, b] = compare(from, to) <= 0 ? [from, to] : [to, from]
    const out: string[] = []
    for (let i = paraIndex(a); i <= paraIndex(b); i++) {
      const p = at(containerOf(a), i, 0)
      const start = i === paraIndex(a) ? a.offset : 0
      const end = i === paraIndex(b) ? b.offset : this.length(p)
      out.push(this.text(p, start, Math.max(0, end - start)))
    }
    return out.join('\n')
  }
}

/** Parse an engine hit-test or moveVertical result into a position. */
export function fromEngine(r: {
  sectionIndex: number
  paragraphIndex: number
  charOffset: number
  parentParaIndex?: number
  controlIndex?: number
  cellIndex?: number
  cellParaIndex?: number
  cellPath?: unknown[]
}): Pos {
  const inCell = r.cellPath !== undefined ? r.cellPath.length > 0 : r.parentParaIndex !== undefined && r.cellIndex !== undefined
  if (inCell && r.parentParaIndex !== undefined && r.controlIndex !== undefined && r.cellIndex !== undefined) {
    return { section: r.sectionIndex, para: r.parentParaIndex, offset: r.charOffset, cell: { control: r.controlIndex, cell: r.cellIndex, para: r.cellParaIndex ?? 0 } }
  }
  return { section: r.sectionIndex, para: r.paragraphIndex, offset: r.charOffset }
}

/** Sentinel the engine uses for "not in a cell" in moveVertical. */
export const NO_CELL = 0xffffffff
