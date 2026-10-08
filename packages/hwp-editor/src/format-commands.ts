// 한글 formatting and structure commands (spec task 2.2/2.6), under the ids of
// the coverage list (.kiro/specs/hangul-editor/coverage/commands.json).
//
// Character commands act on the selection; paragraph commands on every
// paragraph the selection touches (the caret's paragraph when collapsed), as
// in 한글. Values follow the engine's units: font size in 1/100 pt, 자간
// (spacings) in percent of the font size, 장평 (ratios) in percent, one value
// per script (한글, 영어, 한자, 일어, 외국어, 기호, 사용자).
import { at, containerOf, paraIndex, sameContainer, type Pos } from './position'
import { collapsed, ordered, type Session } from './session'
import type { Command } from './commands'

const SCRIPTS = 7

function json(r: string, what: string): Record<string, unknown> {
  const v = JSON.parse(r) as Record<string, unknown>
  if (v.ok === false) throw new Error(`${what}: ${String(v.error ?? r)}`)
  return v
}

/** Paragraph positions the selection covers, in one container. */
function selectedParagraphs(s: Session): Pos[] {
  const [a, b] = ordered(s.selection)
  if (!sameContainer(a, b)) return [s.selection.head]
  const out: Pos[] = []
  for (let i = paraIndex(a); i <= paraIndex(b); i++) out.push(at(containerOf(a), i, 0))
  return out
}

function paraProps(s: Session, p: Pos): Record<string, unknown> {
  const raw = s.doc.raw
  const r = p.cell ? raw.getCellParaPropertiesAt(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para) : raw.getParaPropertiesAt(p.section, p.para)
  return JSON.parse(r) as Record<string, unknown>
}

function applyPara(s: Session, p: Pos, props: Record<string, unknown>): void {
  const raw = s.doc.raw
  const j = JSON.stringify(props)
  if (p.cell) json(raw.applyParaFormatInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, j), 'applyParaFormatInCell')
  else json(raw.applyParaFormat(p.section, p.para, j), 'applyParaFormat')
}

function hasRange(s: Session): boolean {
  return !collapsed(s.selection) && sameContainer(s.selection.anchor, s.selection.head)
}

/** Apply char props to the selection; one undo step. */
export function applyCharProps(s: Session, id: string, props: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>)): ReturnType<Session['edit']> | null {
  if (!hasRange(s)) return null
  const sel = s.selection
  return s.edit(id, () => {
    const [a, b] = ordered(sel)
    const value = typeof props === 'function' ? props(s.text.charPropertiesAt(a)) : props
    s.text.applyCharFormat(a, b, value)
    return sel
  })
}

function charToggle(id: string, prop: 'emboss' | 'engrave' | 'superscript' | 'subscript'): Command {
  return {
    id,
    isEnabled: ({ session }) => hasRange(session),
    isActive: ({ session }) => Boolean(session.text.charPropertiesAt(ordered(session.selection)[0])[prop]),
    run({ session }) {
      return applyCharProps(session, id, (cur) => {
        const on = !cur[prop]
        // superscript and subscript exclude each other, as 한글's buttons do
        if (prop === 'superscript' && on) return { superscript: true, subscript: false }
        if (prop === 'subscript' && on) return { subscript: true, superscript: false }
        return { [prop]: on }
      })
    },
  }
}

function clampAll(values: unknown, delta: number, min: number, max: number): number[] {
  const arr = Array.isArray(values) && values.length === SCRIPTS ? (values as number[]) : new Array<number>(SCRIPTS).fill(0)
  return arr.map((v) => Math.min(max, Math.max(min, Math.round(v + delta))))
}

function charStep(id: string, apply: (cur: Record<string, unknown>) => Record<string, unknown>): Command {
  return { id, isEnabled: ({ session }) => hasRange(session), run: ({ session }) => applyCharProps(session, id, apply) }
}

/** 한글's own font size steps (pt), used by Alt+Shift+E/R and Ctrl+] / Ctrl+[. */
export const FONT_SIZE_STEPS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 54, 60, 72, 96]

export function nextFontSize(pt: number, dir: 1 | -1): number {
  if (dir > 0) return FONT_SIZE_STEPS.find((s) => s > pt + 1e-6) ?? Math.min(4096, pt + 10)
  return [...FONT_SIZE_STEPS].reverse().find((s) => s < pt - 1e-6) ?? Math.max(1, pt - 1)
}

type Align = 'left' | 'center' | 'right' | 'justify' | 'distribute' | 'split'

function align(id: string, value: Align): Command {
  return {
    id,
    isEnabled: () => true,
    isActive: ({ session }) => paraProps(session, session.selection.head).alignment === value,
    run({ session }) {
      const sel = session.selection
      return session.edit(id, () => {
        for (const p of selectedParagraphs(session)) applyPara(session, p, { alignment: value })
        return sel
      })
    },
  }
}

function paraStep(id: string, apply: (cur: Record<string, unknown>) => Record<string, unknown>): Command {
  return {
    id,
    isEnabled: () => true,
    run({ session }) {
      const sel = session.selection
      return session.edit(id, () => {
        for (const p of selectedParagraphs(session)) applyPara(session, p, apply(paraProps(session, p)))
        return sel
      })
    },
  }
}

/** Parameterised commands the ribbon and dialogs use. */
export const setFontSize: Command<{ pt: number }> = {
  id: 'format:font-size',
  isEnabled: ({ session }) => hasRange(session),
  run: ({ session }, { pt }) => applyCharProps(session, 'format:font-size', { fontSize: Math.round(pt * 100) }),
}

export const setFontFamily: Command<{ name: string; scripts?: number[] }> = {
  id: 'format:font-family',
  isEnabled: ({ session }) => hasRange(session),
  run({ session }, { name, scripts }) {
    return applyCharProps(session, 'format:font-family', (cur) => {
      // HWP keeps one font list per script, so a font id is looked up per script.
      const current = Array.isArray(cur.fontFamilies) ? (cur.fontFamilies as string[]) : []
      const want = new Set(scripts ?? [0, 1, 2, 3, 4, 5, 6])
      const fontIds = Array.from({ length: SCRIPTS }, (_, k) => session.doc.raw.findOrCreateFontIdForLang(k, want.has(k) ? name : (current[k] ?? name)))
      return { fontIds }
    })
  },
}

export const setTextColor: Command<{ color: string }> = {
  id: 'format:text-color',
  isEnabled: ({ session }) => hasRange(session),
  run: ({ session }, { color }) => applyCharProps(session, 'format:text-color', { textColor: color.toLowerCase() }),
}

export const setShadeColor: Command<{ color: string }> = {
  id: 'format:shade-color',
  isEnabled: ({ session }) => hasRange(session),
  run: ({ session }, { color }) => applyCharProps(session, 'format:shade-color', { shadeColor: color.toLowerCase() }),
}

/** Any character property set from the 글자 모양 dialog, as one undo step. */
export const applyCharShape: Command<{ props: Record<string, unknown> }> = {
  id: 'format:char-shape-apply',
  isEnabled: ({ session }) => hasRange(session),
  run: ({ session }, { props }) => applyCharProps(session, 'format:char-shape-apply', props),
}

/** Any paragraph property set from the 문단 모양 dialog, as one undo step. */
export const applyParaShape: Command<{ props: Record<string, unknown> }> = {
  id: 'format:para-shape-apply',
  isEnabled: () => true,
  run({ session }, { props }) {
    const sel = session.selection
    return session.edit('format:para-shape-apply', () => {
      for (const p of selectedParagraphs(session)) applyPara(session, p, props)
      return sel
    })
  },
}

export const applyStyle: Command<{ styleId: number }> = {
  id: 'format:apply-style',
  isEnabled: () => true,
  run({ session }, { styleId }) {
    const sel = session.selection
    return session.edit('format:apply-style', () => {
      const raw = session.doc.raw
      for (const p of selectedParagraphs(session)) {
        if (p.cell) json(raw.applyCellStyle(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, styleId), 'applyCellStyle')
        else json(raw.applyStyle(p.section, p.para, styleId), 'applyStyle')
      }
      return sel
    })
  },
}

export interface StyleInfo {
  id: number
  name: string
  englishName: string
  type: number
  nextStyleId: number
}

export function styleList(s: Session): StyleInfo[] {
  return JSON.parse(s.doc.raw.getStyleList()) as StyleInfo[]
}

export function styleAt(s: Session, p: Pos = s.selection.head): number {
  if (p.cell) return -1
  return Number((JSON.parse(s.doc.raw.getStyleAt(p.section, p.para)) as { id: number }).id)
}

// ── Structure ─────────────────────────────────────────────────────────

function bodyCaret(s: Session): Pos | null {
  const h = s.selection.head
  return h.cell ? null : h
}

export const pageBreak: Command = {
  id: 'page:break',
  isEnabled: ({ session }) => bodyCaret(session) !== null,
  run({ session }) {
    const p = bodyCaret(session)!
    return session.edit('page:break', () => {
      const r = json(session.doc.raw.insertPageBreak(p.section, p.para, p.offset), 'insertPageBreak')
      const q: Pos = { section: p.section, para: Number(r.paraIdx), offset: Number(r.charOffset ?? 0) }
      return { anchor: q, head: q }
    })
  },
}

export const columnBreak: Command = {
  id: 'page:column-break',
  isEnabled: ({ session }) => bodyCaret(session) !== null,
  run({ session }) {
    const p = bodyCaret(session)!
    return session.edit('page:column-break', () => {
      const r = json(session.doc.raw.insertColumnBreak(p.section, p.para, p.offset), 'insertColumnBreak')
      const q: Pos = { section: p.section, para: Number(r.paraIdx), offset: Number(r.charOffset ?? 0) }
      return { anchor: q, head: q }
    })
  },
}

export const createTable: Command<{ rows: number; cols: number }> = {
  id: 'table:create',
  isEnabled: ({ session }) => bodyCaret(session) !== null,
  run({ session }, { rows, cols }) {
    const p = bodyCaret(session)!
    return session.edit('table:create', () => {
      const r = json(session.doc.raw.createTable(p.section, p.para, p.offset, Math.max(1, rows), Math.max(1, cols)), 'createTable')
      const q: Pos = { section: p.section, para: Number(r.paraIdx), offset: 0, cell: { control: Number(r.controlIdx), cell: 0, para: 0 } }
      return { anchor: q, head: q }
    })
  },
}

function inTable(s: Session): { section: number; host: number; control: number; row: number; col: number } | null {
  const h = s.selection.head
  if (!h.cell) return null
  const info = JSON.parse(s.doc.raw.getCellInfo(h.section, h.para, h.cell.control, h.cell.cell)) as { row: number; col: number }
  return { section: h.section, host: h.para, control: h.cell.control, row: info.row, col: info.col }
}

function tableEdit(id: string, op: (s: Session, t: NonNullable<ReturnType<typeof inTable>>) => void, after: 'stay' | 'first' = 'stay'): Command {
  return {
    id,
    isEnabled: ({ session }) => inTable(session) !== null,
    run({ session }) {
      const t = inTable(session)!
      const sel = session.selection
      return session.edit(id, () => {
        op(session, t)
        if (after === 'first') {
          const q: Pos = { section: t.section, para: t.host, offset: 0, cell: { control: t.control, cell: 0, para: 0 } }
          return { anchor: q, head: q }
        }
        return sel
      })
    },
  }
}

export const insertRowAbove = tableEdit('table:insert-row-above', (s, t) => void json(s.doc.raw.insertTableRow(t.section, t.host, t.control, t.row, false), 'insertTableRow'))
export const insertRowBelow = tableEdit('table:insert-row-below', (s, t) => void json(s.doc.raw.insertTableRow(t.section, t.host, t.control, t.row, true), 'insertTableRow'))
export const insertColLeft = tableEdit('table:insert-col-left', (s, t) => void json(s.doc.raw.insertTableColumn(t.section, t.host, t.control, t.col, false), 'insertTableColumn'))
export const insertColRight = tableEdit('table:insert-col-right', (s, t) => void json(s.doc.raw.insertTableColumn(t.section, t.host, t.control, t.col, true), 'insertTableColumn'))
export const deleteRow = tableEdit('table:delete-row', (s, t) => void json(s.doc.raw.deleteTableRow(t.section, t.host, t.control, t.row), 'deleteTableRow'), 'first')
export const deleteCol = tableEdit('table:delete-col', (s, t) => void json(s.doc.raw.deleteTableColumn(t.section, t.host, t.control, t.col), 'deleteTableColumn'), 'first')

export const deleteTable: Command = {
  id: 'table:delete',
  isEnabled: ({ session }) => inTable(session) !== null,
  run({ session }) {
    const t = inTable(session)!
    return session.edit('table:delete', () => {
      json(session.doc.raw.deleteTableControl(t.section, t.host, t.control), 'deleteTableControl')
      const q: Pos = { section: t.section, para: t.host, offset: 0 }
      return { anchor: q, head: q }
    })
  },
}

/** Merge the cells between the selection's anchor and head cells (same table). */
export const mergeCells: Command = {
  id: 'table:cell-merge',
  isEnabled: ({ session }) => {
    const { anchor, head } = session.selection
    return !!anchor.cell && !!head.cell && anchor.para === head.para && anchor.cell.control === head.cell.control && anchor.cell.cell !== head.cell.cell
  },
  run({ session }) {
    const { anchor, head } = session.selection
    const raw = session.doc.raw
    const a = JSON.parse(raw.getCellInfo(anchor.section, anchor.para, anchor.cell!.control, anchor.cell!.cell)) as { row: number; col: number }
    const b = JSON.parse(raw.getCellInfo(head.section, head.para, head.cell!.control, head.cell!.cell)) as { row: number; col: number }
    return session.edit('table:cell-merge', () => {
      json(raw.mergeTableCells(head.section, head.para, head.cell!.control, Math.min(a.row, b.row), Math.min(a.col, b.col), Math.max(a.row, b.row), Math.max(a.col, b.col)), 'mergeTableCells')
      const q: Pos = { section: head.section, para: head.para, offset: 0, cell: { control: head.cell!.control, cell: 0, para: 0 } }
      return { anchor: q, head: q }
    })
  },
}

export const FORMAT_COMMANDS = [
  charToggle('format:emboss', 'emboss'),
  charToggle('format:engrave', 'engrave'),
  charToggle('format:superscript', 'superscript'),
  charToggle('format:subscript', 'subscript'),
  charStep('format:font-size-increase', (c) => ({ fontSize: Math.round(nextFontSize(Number(c.fontSize) / 100, 1) * 100) })),
  charStep('format:font-size-decrease', (c) => ({ fontSize: Math.round(nextFontSize(Number(c.fontSize) / 100, -1) * 100) })),
  // 자간 and 장평 step by 1 percentage point per press, as in 한글.
  charStep('format:char-spacing-increase', (c) => ({ spacings: clampAll(c.spacings, 1, -50, 50) })),
  charStep('format:char-spacing-decrease', (c) => ({ spacings: clampAll(c.spacings, -1, -50, 50) })),
  charStep('format:char-ratio-increase', (c) => ({ ratios: clampAll(c.ratios, 1, 50, 200) })),
  charStep('format:char-ratio-decrease', (c) => ({ ratios: clampAll(c.ratios, -1, 50, 200) })),
  align('format:align-left', 'left'),
  align('format:align-center', 'center'),
  align('format:align-right', 'right'),
  align('format:align-justify', 'justify'),
  align('format:align-distribute', 'distribute'),
  align('format:align-split', 'split'),
  // Line spacing steps by 10 percentage points, as in 한글 (Alt+Shift+Z / A).
  paraStep('format:line-spacing-increase', (c) => ({ lineSpacingType: 'Percent', lineSpacing: Math.min(500, Number(c.lineSpacingType === 'Percent' ? c.lineSpacing : 160) + 10) })),
  paraStep('format:line-spacing-decrease', (c) => ({ lineSpacingType: 'Percent', lineSpacing: Math.max(50, Number(c.lineSpacingType === 'Percent' ? c.lineSpacing : 160) - 10) })),
  setFontSize,
  setFontFamily,
  setTextColor,
  setShadeColor,
  applyCharShape,
  applyParaShape,
  applyStyle,
  pageBreak,
  columnBreak,
  createTable,
  insertRowAbove,
  insertRowBelow,
  insertColLeft,
  insertColRight,
  deleteRow,
  deleteCol,
  deleteTable,
  mergeCells,
] as Command<never>[]
