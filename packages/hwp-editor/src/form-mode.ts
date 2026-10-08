// 양식 모드 (form mode, spec task 2.6): the document is a form to fill in. As in
// 한글, only 누름틀 (click-here fields) take typing; everything else stays as
// it is. Tab and Shift+Tab go to the next and previous field and select what
// is in it, so filling a form is type, Tab, type.
//
// The editor view asks `formAllows` before each command while form mode is on.
import { ordered, type Session } from './session'
import { inBody, type Pos } from './position'

export interface FormField {
  fieldId: number
  name: string
  guide: string
  section: number
  para: number
  start: number
  end: number
}

/** Commands that never change the document: moving, selecting, finding, the view. */
const READING = /^(move:|view:|edit:select-all$|edit:find-next$|edit:find-prev$|edit:copy$)/

/** The click-here fields in the body, in reading order. */
export function formFields(s: Session): FormField[] {
  const list = JSON.parse(s.doc.raw.getFieldList()) as Array<{
    fieldId: number
    fieldType: string
    name: string
    guide: string
    cellField: boolean
    location: { sectionIndex: number; paraIndex: number }
    startCharIdx: number
    endCharIdx: number
  }>
  return list
    .filter((f) => f.fieldType === 'clickhere' && !f.cellField)
    .map((f) => ({ fieldId: f.fieldId, name: f.name, guide: f.guide, section: f.location.sectionIndex, para: f.location.paraIndex, start: f.startCharIdx, end: f.endCharIdx }))
    .sort((a, b) => a.section - b.section || a.para - b.para || a.start - b.start)
}

/** The field a position is in (its ends included). */
export function formFieldAt(s: Session, p: Pos): FormField | null {
  if (!inBody(p)) return null
  return formFields(s).find((f) => f.section === p.section && f.para === p.para && p.offset >= f.start && p.offset <= f.end) ?? null
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
  if (!f || b.section !== a.section || b.para !== a.para || b.offset > f.end || (b.cell ?? null) !== (a.cell ?? null)) return false
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
  const key = (f: { section: number; para: number; start: number }) => [f.section, f.para, f.start] as const
  const cmp = (x: readonly number[], y: readonly number[]) => x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!
  const here = formFieldAt(s, h)
  const at = here ? key(here) : ([h.section, h.para, h.offset] as const)
  const next =
    dir === 1
      ? (fields.find((f) => cmp(key(f), at) > 0) ?? fields[0]!)
      : ([...fields].reverse().find((f) => cmp(key(f), at) < 0) ?? fields[fields.length - 1]!)
  s.select({ anchor: { section: next.section, para: next.para, offset: next.start }, head: { section: next.section, para: next.para, offset: next.end } })
  return true
}
