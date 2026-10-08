// Commands behind the remaining 한글 dialogs (spec task 2.6): insert and
// delete rows/columns, column and section settings, page border, endnote shape,
// header/footer templates, numbering shapes and click-here field edits. Each
// takes the dialog's values and runs as one undo step. The engine calls and
// presets are those rhwp-studio uses (MIT).
import type { Command } from './commands'
import type { Session } from './session'
import type { Pos } from './position'
import { applyParaShape } from './format-commands'
import { selectedCells, tableAt, tableCells } from './object-commands'
import { fieldAt } from './field-commands'

function json(r: string, what: string): Record<string, unknown> {
  const v = JSON.parse(r) as Record<string, unknown>
  if (v.ok === false) throw new Error(`${what}: ${String(v.error ?? r)}`)
  return v
}

const body = (s: Session): Pos | null => (s.selection.head.cell ? null : s.selection.head)

/** The rows and columns the selected cells span. */
function block(s: Session) {
  const t = tableAt(s)!
  const cells = tableCells(s, t)
  const sel = selectedCells(s).map((i) => cells[i]!)
  return {
    t,
    r0: Math.min(...sel.map((c) => c.row)),
    r1: Math.max(...sel.map((c) => c.row + c.rowSpan - 1)),
    c0: Math.min(...sel.map((c) => c.col)),
    c1: Math.max(...sel.map((c) => c.col + c.colSpan - 1)),
  }
}

/** 줄/칸 추가하기: `count` rows or columns on one side of the selection. */
export const insertRowsCols: Command<{ where: 'above' | 'below' | 'left' | 'right'; count: number }> = {
  id: 'table:insert-rows-cols',
  isEnabled: ({ session }) => tableAt(session) !== null,
  run({ session }, { where, count }) {
    const b = block(session)
    const n = Math.min(Math.max(1, Math.round(count)), 100)
    const sel = session.selection
    return session.edit('table:insert-rows-cols', () => {
      const raw = session.doc.raw
      for (let i = 0; i < n; i++) {
        if (where === 'above') json(raw.insertTableRow(b.t.section, b.t.host, b.t.control, b.r0, false), 'insertTableRow')
        else if (where === 'below') json(raw.insertTableRow(b.t.section, b.t.host, b.t.control, b.r1, true), 'insertTableRow')
        else if (where === 'left') json(raw.insertTableColumn(b.t.section, b.t.host, b.t.control, b.c0, false), 'insertTableColumn')
        else json(raw.insertTableColumn(b.t.section, b.t.host, b.t.control, b.c1, true), 'insertTableColumn')
      }
      return sel
    })
  },
}

/** 줄/칸 지우기: the rows or columns the selection spans. */
export const deleteRowsCols: Command<{ what: 'rows' | 'cols' }> = {
  id: 'table:delete-rows-cols',
  isEnabled: ({ session }) => tableAt(session) !== null,
  run({ session }, { what }) {
    const b = block(session)
    return session.edit('table:delete-rows-cols', () => {
      const raw = session.doc.raw
      // From the end, so the indices of those still to go do not move.
      if (what === 'rows') for (let r = b.r1; r >= b.r0; r--) json(raw.deleteTableRow(b.t.section, b.t.host, b.t.control, r), 'deleteTableRow')
      else for (let c = b.c1; c >= b.c0; c--) json(raw.deleteTableColumn(b.t.section, b.t.host, b.t.control, c), 'deleteTableColumn')
      const q: Pos = { section: b.t.section, para: b.t.host, offset: 0, cell: { control: b.t.control, cell: 0, para: 0 } }
      return { anchor: q, head: q }
    })
  },
}

export interface ColumnSettings {
  count: number
  /** 0 일반, 1 배분, 2 평행 */
  type: 0 | 1 | 2
  sameWidth: boolean
  /** gap between columns, HWPUNIT */
  spacing: number
}

export function columnSettings(s: Session): ColumnSettings {
  const c = JSON.parse(s.doc.raw.getColumnDef(s.selection.head.section)) as { columnCount: number; columnType: number; sameWidth: boolean; spacing: number }
  return { count: c.columnCount, type: (c.columnType as 0 | 1 | 2) ?? 0, sameWidth: !!c.sameWidth, spacing: c.spacing }
}

export const setColumns: Command<ColumnSettings> = {
  id: 'page:columns-set',
  isEnabled: ({ session }) => body(session) !== null,
  run({ session }, c) {
    const sel = session.selection
    return session.edit('page:columns-set', () => {
      json(session.doc.raw.setColumnDef(sel.head.section, Math.min(Math.max(1, Math.round(c.count)), 16), c.type, c.sameWidth ? 1 : 0, Math.max(0, Math.round(c.spacing))), 'setColumnDef')
      return sel
    })
  },
}

/** A section's or page's property object as the engine reads it. */
export const sectionDef = (s: Session) => JSON.parse(s.doc.raw.getSectionDef(s.selection.head.section)) as Record<string, unknown>
export const pageBorder = (s: Session) => JSON.parse(s.doc.raw.getPageBorderFill(s.selection.head.section)) as Record<string, unknown>
export const endnoteShape = (s: Session) => JSON.parse(s.doc.raw.getEndnoteShape(s.selection.head.section)) as Record<string, unknown>

function sectionProps(id: string, write: (s: Session, section: number, json: string) => string): Command<{ props: Record<string, unknown> }> {
  return {
    id,
    isEnabled: () => true,
    run({ session }, { props }) {
      if (!Object.keys(props).length) return null
      const sel = session.selection
      return session.edit(id, () => {
        json(write(session, sel.head.section, JSON.stringify(props)), id)
        return sel
      })
    },
  }
}

export const setSection = sectionProps('page:section-set', (s, sec, j) => s.doc.raw.setSectionDef(sec, j))
export const setPageBorder = sectionProps('page:border-set', (s, sec, j) => s.doc.raw.setPageBorderFill(sec, j))
export const setEndnoteShape = sectionProps('note:endnote-shape-set', (s, sec, j) => s.doc.raw.applyEndnoteShape(sec, j))

/**
 * 머리말/꼬리말 마당: 0 empty, 1–3 page number left/centre/right, 4 page number
 * and file name, 5 file name and page number; 6–10 the same, bold and underlined.
 */
export const applyHeaderFooterTemplate: Command<{ header: boolean; template: number; applyTo?: 0 | 1 | 2 }> = {
  id: 'page:hf-template',
  isEnabled: () => true,
  run({ session }, { header, template, applyTo = 0 }) {
    const sel = session.selection
    return session.edit('page:hf-template', () => {
      json(session.doc.raw.applyHfTemplate(sel.head.section, header, applyTo, Math.min(Math.max(0, Math.round(template)), 10)), 'applyHfTemplate')
      return sel
    })
  },
}

/** Number formats: 0 1, 1 ①, 2 I, 3 i, 4 A, 5 a, 6 가(음절), 7 一, 8 가(혼합), 10 ㄱ. */
export const NUMBERING_PRESETS: ReadonlyArray<{ id: string; levelFormats: string[]; numberFormats: number[] }> = [
  { id: 'outline', levelFormats: ['^1.', '^2.', '^3)', '^4)', '(^5)', '(^6)', '^7'], numberFormats: [0, 8, 0, 8, 0, 8, 1] },
  { id: 'digits', levelFormats: ['^1.', '^2.', '^3.', '^4.', '^5.', '^6.', '^7.'], numberFormats: [0, 0, 0, 0, 0, 0, 0] },
  { id: 'roman', levelFormats: ['^1.', '^2.', '^3.', '^4.', '(^5)', '(^6)', '^7'], numberFormats: [2, 4, 0, 5, 0, 5, 1] },
  { id: 'chapters', levelFormats: ['제^1장', '제^2절', '^3.', '^4.', '^5)', '^6)', '(^7)'], numberFormats: [0, 0, 0, 8, 0, 8, 0] },
  { id: 'hanja', levelFormats: ['^1', '^2', '^3', '^4', '^5', '^6', '^7'], numberFormats: [7, 7, 7, 7, 7, 7, 7] },
  { id: 'circled', levelFormats: ['^1', '^2', '^3', '^4', '^5', '^6', '^7'], numberFormats: [1, 1, 1, 1, 1, 1, 1] },
]

/** 문단 번호 모양: number the selected paragraphs with a preset; `restart` starts again from `start`. */
export const applyNumberingShape: Command<{ preset: string; start?: number; restart?: boolean }> = {
  id: 'format:numbering-shape',
  isEnabled: () => true,
  run(ctx, { preset, start = 1, restart = false }) {
    const p = NUMBERING_PRESETS.find((x) => x.id === preset)
    if (!p) throw new Error(`format:numbering-shape: no preset ${preset}`)
    const { session } = ctx
    return session.group('format:numbering-shape', () => {
      const nid = session.doc.raw.createNumbering(JSON.stringify({ levelFormats: p.levelFormats, numberFormats: p.numberFormats, startNumber: Math.max(1, Math.round(start)) }))
      applyParaShape.run(ctx, { props: { headType: 'Number', numberingId: nid, paraLevel: 0 } })
      const h = session.selection.head
      if (restart && !h.cell) json(session.doc.raw.setNumberingRestart(h.section, h.para, 2, Math.max(1, Math.round(start))), 'setNumberingRestart')
      return session.selection
    })
  },
}

/** 누름틀 고치기: rename the field at the caret and/or set what it holds. */
export const editField: Command<{ name?: string; value?: string }> = {
  id: 'field:edit-apply',
  isEnabled: ({ session }) => fieldAt(session) !== null,
  run({ session }, { name, value }) {
    const f = fieldAt(session)!
    const sel = session.selection
    return session.edit('field:edit-apply', () => {
      const raw = session.doc.raw
      if (name !== undefined && name.trim() && name !== f.name) json(raw.renameField(f.name, name.trim()), 'renameField')
      if (value !== undefined && value !== f.value) json(raw.setFieldValue(f.fieldId, value), 'setFieldValue')
      return sel
    })
  },
}

export const DIALOG_COMMANDS = [insertRowsCols, deleteRowsCols, setColumns, setSection, setPageBorder, setEndnoteShape, applyHeaderFooterTemplate, applyNumberingShape, editField] as Command<never>[]
