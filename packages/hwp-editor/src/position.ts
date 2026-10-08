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
  /** The "cell" is a text box's text (control is the shape; cell is 0), not a table cell. */
  textBox?: boolean
}

/**
 * A text flow outside the body (task 1.7): a header or footer of a section, or a
 * footnote/endnote. A position in a story has `para` = the paragraph inside it.
 */
export type Story =
  | { kind: 'header' | 'footer'; /** 0 both pages, 1 even, 2 odd */ applyTo: number; /** page the caret is drawn on */ page: number }
  | { kind: 'note'; /** body paragraph holding the note */ host: number; control: number }

export interface Pos {
  section: number
  /** Body paragraph; for a cell position, the table's host paragraph; in a story, the story's paragraph. */
  para: number
  offset: number
  cell?: CellRef
  story?: Story
}

/** The container a paragraph sits in: the section body, one table cell, or a story. */
export interface Container {
  section: number
  /** For a cell: the table's host paragraph, control and cell. */
  cell?: { host: number; control: number; cell: number }
  story?: Story
}

export function containerOf(p: Pos): Container {
  if (p.story) return { section: p.section, story: p.story }
  return p.cell ? { section: p.section, cell: { host: p.para, control: p.cell.control, cell: p.cell.cell } } : { section: p.section }
}

/** Index of the position's paragraph inside its container. */
export function paraIndex(p: Pos): number {
  return p.cell ? p.cell.para : p.para
}

/** Whether a position is in the body text (not a cell, text box, header, footer or note). */
export function inBody(p: Pos): boolean {
  return !p.cell && !p.story
}

function sameStory(a: Story | undefined, b: Story | undefined): boolean {
  if (!a || !b) return !a && !b
  if (a.kind !== b.kind) return false
  if (a.kind === 'note' && b.kind === 'note') return a.host === b.host && a.control === b.control
  return a.kind !== 'note' && b.kind !== 'note' && a.applyTo === b.applyTo
}

export function sameContainer(a: Pos, b: Pos): boolean {
  if (a.section !== b.section) return false
  if (a.story || b.story) return sameStory(a.story, b.story)
  if (!a.cell || !b.cell) return !a.cell && !b.cell
  return a.para === b.para && a.cell.control === b.cell.control && a.cell.cell === b.cell.cell
}

/** Position at paragraph `index` of a container. */
export function at(c: Container, index: number, offset: number): Pos {
  if (c.story) return { section: c.section, para: index, offset, story: c.story }
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
    if (c.story) return this.storyInfo(c.section, c.story, 0).paraCount
    return c.cell ? this.raw.getCellParagraphCount(c.section, c.cell.host, c.cell.control, c.cell.cell) : this.doc.paragraphCount(c.section)
  }

  /** Paragraph count and one paragraph's text in a header, footer or note. */
  private storyInfo(section: number, st: Story, para: number): { paraCount: number; text: string } {
    if (st.kind === 'note') {
      const r = ok(this.raw.getFootnoteInfo(section, st.host, st.control), 'getFootnoteInfo') as { paraCount: number; texts: string[] }
      return { paraCount: r.paraCount, text: r.texts[para] ?? '' }
    }
    const r = ok(this.raw.getHeaderFooterParaInfo(section, st.kind === 'header', st.applyTo, para), 'getHeaderFooterParaInfo') as { paraCount: number; text: string }
    return { paraCount: r.paraCount, text: r.text ?? '' }
  }

  length(p: Pos): number {
    if (p.story) return [...this.storyInfo(p.section, p.story, p.para).text].length
    return p.cell
      ? this.raw.getCellParagraphLength(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para)
      : this.doc.paragraphLength(p.section, p.para)
  }

  /** Text of the paragraph at `p`, from `offset` for `count` code points (default: to the end). */
  text(p: Pos, offset = 0, count?: number): string {
    const n = count ?? Math.max(0, this.length(p) - offset)
    if (p.story) return [...this.storyInfo(p.section, p.story, p.para).text].slice(offset, offset + n).join('')
    return p.cell ? this.raw.getTextInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, offset, n) : this.doc.text(p.section, p.para, offset, n)
  }

  insert(p: Pos, text: string): Pos {
    if (!text) return p
    if (p.story) {
      const st = p.story
      const r =
        st.kind === 'note'
          ? ok(this.raw.insertTextInFootnote(p.section, st.host, st.control, p.para, p.offset, text), 'insertTextInFootnote')
          : ok(this.raw.insertTextInHeaderFooter(p.section, st.kind === 'header', st.applyTo, p.para, p.offset, text), 'insertTextInHeaderFooter')
      return { ...p, offset: Number(r.charOffset ?? p.offset + [...text].length) }
    }
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
    if (a.story) {
      this.deleteInStory(a, b)
      return a
    }
    if (a.cell) {
      ok(this.raw.deleteRangeInCell(a.section, a.para, a.cell.control, a.cell.cell, a.cell.para, a.offset, b.cell!.para, b.offset), 'deleteRangeInCell')
    } else {
      ok(this.raw.deleteRange(a.section, a.para, a.offset, b.para, b.offset), 'deleteRange')
    }
    return a
  }

  /** Delete [a, b) in a story: the text on each paragraph, then join the paragraphs. */
  private deleteInStory(a: Pos, b: Pos): void {
    const st = a.story!
    const del = (para: number, offset: number, count: number) => {
      if (count <= 0) return
      if (st.kind === 'note') ok(this.raw.deleteTextInFootnote(a.section, st.host, st.control, para, offset, count), 'deleteTextInFootnote')
      else ok(this.raw.deleteTextInHeaderFooter(a.section, st.kind === 'header', st.applyTo, para, offset, count), 'deleteTextInHeaderFooter')
    }
    const merge = (para: number) => {
      if (st.kind === 'note') ok(this.raw.mergeParagraphInFootnote(a.section, st.host, st.control, para), 'mergeParagraphInFootnote')
      else ok(this.raw.mergeParagraphInHeaderFooter(a.section, st.kind === 'header', st.applyTo, para), 'mergeParagraphInHeaderFooter')
    }
    if (a.para === b.para) return del(a.para, a.offset, b.offset - a.offset)
    del(b.para, 0, b.offset)
    for (let i = b.para - 1; i > a.para; i--) del(i, 0, this.length({ ...a, para: i, offset: 0 }))
    del(a.para, a.offset, this.length(a) - a.offset)
    // Joining paragraph i to the one before it, from the end, leaves `a` holding the rest.
    for (let i = b.para; i > a.para; i--) merge(i)
  }

  /** Split the paragraph at `p`; returns the start of the new paragraph. */
  split(p: Pos): Pos {
    if (p.story) {
      const st = p.story
      const r =
        st.kind === 'note'
          ? ok(this.raw.splitParagraphInFootnote(p.section, st.host, st.control, p.para, p.offset), 'splitParagraphInFootnote')
          : ok(this.raw.splitParagraphInHeaderFooter(p.section, st.kind === 'header', st.applyTo, p.para, p.offset), 'splitParagraphInHeaderFooter')
      const next = Number(r.paraIdx ?? r.hfParaIndex ?? r.fnParaIndex ?? r.paraIndex ?? p.para + 1)
      return { ...p, para: next, offset: 0 }
    }
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
    if (a.story) {
      if (a.story.kind === 'note') throw new Error('character format in a note is not supported yet')
      ok(this.raw.applyCharFormatInHeaderFooter(a.section, a.story.kind === 'header', a.story.applyTo, a.para, a.offset, b.para, b.offset, json), 'applyCharFormatInHeaderFooter')
      return
    }
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
    if (p.story && p.story.kind !== 'note') {
      return JSON.parse(this.raw.getCharPropertiesInHeaderFooter(p.section, p.story.kind === 'header', p.story.applyTo, p.para, p.offset)) as Record<string, unknown>
    }
    if (p.story) return JSON.parse(this.raw.getCharPropertiesAt(p.section, p.story.host, 0)) as Record<string, unknown>
    const json = p.cell
      ? this.raw.getCellCharPropertiesAt(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, p.offset)
      : this.raw.getCharPropertiesAt(p.section, p.para, p.offset)
    return JSON.parse(json) as Record<string, unknown>
  }

  cursorRect(p: Pos): CursorRect {
    if (p.story) {
      const st = p.story
      const json =
        st.kind === 'note'
          ? this.raw.getCursorRectInNote(p.section, st.host, st.control, p.para, p.offset)
          : this.raw.getCursorRectInHeaderFooter(p.section, st.kind === 'header', st.applyTo, p.para, p.offset, st.page)
      return JSON.parse(json) as CursorRect
    }
    const json = p.cell
      ? this.raw.getCursorRectInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, p.offset)
      : this.raw.getCursorRect(p.section, p.para, p.offset)
    return JSON.parse(json) as CursorRect
  }

  selectionRects(from: Pos, to: Pos): SelectionRect[] {
    if (!sameContainer(from, to)) return []
    const [a, b] = compare(from, to) <= 0 ? [from, to] : [to, from]
    if (a.story) return this.storySelectionRects(a, b)
    const json = a.cell
      ? this.raw.getSelectionRectsInCell(a.section, a.para, a.cell.control, a.cell.cell, a.cell.para, a.offset, b.cell!.para, b.offset)
      : this.raw.getSelectionRects(a.section, a.para, a.offset, b.para, b.offset)
    return JSON.parse(json) as SelectionRect[]
  }

  /** Selection boxes in a story: the engine's for a header or footer, caret-to-caret lines for a note. */
  private storySelectionRects(a: Pos, b: Pos): SelectionRect[] {
    const st = a.story!
    if (st.kind !== 'note') {
      return JSON.parse(this.raw.getSelectionRectsInHeaderFooter(a.section, st.kind === 'header', st.applyTo, st.page, a.para, a.offset, b.para, b.offset)) as SelectionRect[]
    }
    const out: SelectionRect[] = []
    for (let i = a.para; i <= b.para; i++) {
      const s = this.cursorRect({ ...a, para: i, offset: i === a.para ? a.offset : 0 })
      const e = this.cursorRect({ ...a, para: i, offset: i === b.para ? b.offset : this.length({ ...a, para: i, offset: 0 }) })
      if (s.pageIndex === e.pageIndex && e.y === s.y) out.push({ pageIndex: s.pageIndex, x: s.x, y: s.y, width: Math.max(1, e.x - s.x), height: s.height })
      else out.push({ pageIndex: s.pageIndex, x: s.x, y: s.y, width: 2, height: s.height }, { pageIndex: e.pageIndex, x: e.x, y: e.y, width: 2, height: e.height })
    }
    return out
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
  isTextBox?: boolean
}): Pos {
  const inCell = r.cellPath !== undefined ? r.cellPath.length > 0 : r.parentParaIndex !== undefined && r.cellIndex !== undefined
  if (inCell && r.parentParaIndex !== undefined && r.controlIndex !== undefined && r.cellIndex !== undefined) {
    const cell: CellRef = { control: r.controlIndex, cell: r.cellIndex, para: r.cellParaIndex ?? 0 }
    if (r.isTextBox) cell.textBox = true
    return { section: r.sectionIndex, para: r.parentParaIndex, offset: r.charOffset, cell }
  }
  return { section: r.sectionIndex, para: r.paragraphIndex, offset: r.charOffset }
}

/** Sentinel the engine uses for "not in a cell" in moveVertical. */
export const NO_CELL = 0xffffffff
