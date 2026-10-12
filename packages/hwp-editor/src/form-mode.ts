// 양식 모드 (form mode, spec task 2.6): the document is a form to fill in. As in
// 한글, only 누름틀 (click-here fields) take typing; everything else stays as
// it is. Tab and Shift+Tab go to the next and previous field and select what
// is in it, so filling a form is type, Tab, type.
//
// The editor view asks `formAllows` before each command while form mode is on.
import { ordered, type Session } from './session'
import { clickHereFields, sameParagraph } from './field-commands'
import type { CellRef, Pos } from './position'

export interface FormField {
  fieldId: number
  name: string
  guide: string
  section: number
  para: number
  start: number
  end: number
  /** Set for a field in a table cell, where most 한글 forms keep them. */
  cell?: CellRef
}

/** Commands that never change the document: moving, selecting, finding, the view. */
const READING = /^(move:|view:|edit:select-all$|edit:find-next$|edit:find-prev$|edit:copy$)/

/** The click-here fields in the body and in table cells, in reading order. */
export function formFields(s: Session): FormField[] {
  return clickHereFields(s).map((f) => ({ fieldId: f.fieldId, name: f.name, guide: f.guide, section: f.at.section, para: f.at.para, start: f.start, end: f.end, ...(f.at.cell ? { cell: f.at.cell } : {}) }))
}

const fieldPos = (f: FormField, offset: number): Pos => ({ section: f.section, para: f.para, offset, ...(f.cell ? { cell: f.cell } : {}) })

/** The field a position is in (its ends included). */
export function formFieldAt(s: Session, p: Pos): FormField | null {
  if (p.story) return null
  return formFields(s).find((f) => sameParagraph(fieldPos(f, f.start), p) && p.offset >= f.start && p.offset <= f.end) ?? null
}

/**
 * Whether a command may run in form mode: reading commands always; typing and
 * deleting only inside one field, and never across its ends.
 */
export function formAllows(s: Session, id: string): boolean {
  if (READING.test(id)) return true
  if (id !== 'edit:insert-text' && id !== 'edit:delete-backward' && id !== 'edit:delete-forward') return false
  const [a, b] = ordered(s.selection)
  const f = formFieldAt(s, a)
  if (!f || !sameParagraph(a, b) || b.offset > f.end) return false
  const empty = a.offset === b.offset
  if (empty && id === 'edit:delete-backward') return a.offset > f.start
  if (empty && id === 'edit:delete-forward') return a.offset < f.end
  return true
}

/** Select the next (or previous) field after the caret, wrapping around; false with none. */
export function gotoFormField(s: Session, dir: 1 | -1): boolean {
  const fields = formFields(s)
  if (!fields.length) return false
  const h = s.selection.head
  const here = formFieldAt(s, h)
  // Reading order as formFields sorts: section, host paragraph, then cell, cell paragraph, offset.
  const key = (p: Pos) => [p.section, p.para, p.cell ? p.cell.control : -1, p.cell ? p.cell.cell : -1, p.cell ? p.cell.para : -1, p.offset]
  const cmp = (x: number[], y: number[]) => {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!
    return 0
  }
  const at = key(here ? fieldPos(here, here.start) : h)
  const next =
    dir === 1
      ? (fields.find((f) => cmp(key(fieldPos(f, f.start)), at) > 0) ?? fields[0]!)
      : ([...fields].reverse().find((f) => cmp(key(fieldPos(f, f.start)), at) < 0) ?? fields[fields.length - 1]!)
  s.select({ anchor: fieldPos(next, next.start), head: fieldPos(next, next.end) })
  return true
}
