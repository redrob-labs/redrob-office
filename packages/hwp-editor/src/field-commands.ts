// Hyperlinks and 누름틀 (click-here) fields (spec task 2.4), under the coverage
// list's ids. The engine owns both: a hyperlink is a field range over text in
// one paragraph, offsets in Unicode characters; a 누름틀 is an empty field
// whose guide text 한글 shows until someone types into it.
import { targetOf } from './comments'
import { collapsed, ordered, type Session } from './session'
import { paraIndex, sameContainer, type CellRef, type Pos } from './position'
import type { Command } from './commands'

export interface HyperlinkInfo {
  fieldId: number
  start: number
  end: number
  text: string
  uri: string
}

export interface FieldInfo {
  fieldId: number
  fieldType: string
  name: string
  guide: string
  value: string
  section: number
  para: number
  start: number
  end: number
  /** Set when the field is in a table cell. */
  cell?: CellRef
}

/** Web addresses only: a link never runs a program or opens a local file. */
export function normalizeUri(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  if (/^mailto:[^\s]+@[^\s]+$/i.test(v)) return v
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(withScheme)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export function hyperlinksIn(s: Session, p: Pos): HyperlinkInfo[] {
  const r = JSON.parse(s.doc.raw.getHyperlinkContext(JSON.stringify(targetOf(p)))) as { links?: HyperlinkInfo[] }
  return r.links ?? []
}

/** The link the caret (or the selection's start) sits in. */
export function hyperlinkAt(s: Session, p: Pos = ordered(s.selection)[0]): HyperlinkInfo | null {
  if (p.story || p.cell?.textBox) return null
  try {
    return hyperlinksIn(s, p).find((l) => p.offset >= l.start && p.offset <= l.end) ?? null
  } catch {
    return null
  }
}

export interface ClickHereField {
  fieldId: number
  name: string
  guide: string
  value: string
  /** The field's paragraph, as an editor position at its start (body or one table cell). */
  at: Pos
  start: number
  end: number
}

/** The engine's location of a field: a body paragraph, or a path into cells and text boxes. */
interface FieldLocation {
  sectionIndex: number
  paraIndex: number
  path?: Array<{ type: 'cell' | 'textbox'; controlIndex: number; cellIndex?: number; paraIndex: number }>
}

/** Where a field sits as an editor position, or null where the editor has no position (nested tables, text boxes). */
function fieldPos(loc: FieldLocation, offset: number): Pos | null {
  const path = loc.path ?? []
  if (!path.length) return { section: loc.sectionIndex, para: loc.paraIndex, offset }
  const c = path[0]!
  if (path.length > 1 || c.type !== 'cell') return null
  return { section: loc.sectionIndex, para: loc.paraIndex, offset, cell: { control: c.controlIndex, cell: c.cellIndex ?? 0, para: c.paraIndex } }
}

/**
 * Every 누름틀 the editor can reach, in the body and in table cells, in reading
 * order. A cell's own name (한글's 셀 필드, `cellField`) is not a 누름틀 and is left out.
 */
export function clickHereFields(s: Session): ClickHereField[] {
  const list = JSON.parse(s.doc.raw.getFieldList()) as Array<{
    fieldId: number
    fieldType: string
    name: string
    guide: string
    value: string
    cellField: boolean
    location: FieldLocation
    startCharIdx: number
    endCharIdx: number
  }>
  const out: ClickHereField[] = []
  for (const f of list) {
    if (f.cellField || f.fieldType !== 'clickhere') continue
    const at = fieldPos(f.location, f.startCharIdx)
    if (at) out.push({ fieldId: f.fieldId, name: f.name, guide: f.guide, value: f.value, at, start: f.startCharIdx, end: f.endCharIdx })
  }
  const key = (p: Pos) => [p.section, p.para, p.cell ? p.cell.control : -1, p.cell ? p.cell.cell : -1, p.cell ? p.cell.para : -1, p.offset]
  return out.sort((a, b) => {
    const x = key(a.at)
    const y = key(b.at)
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!
    return 0
  })
}

/** Whether two positions are in the same paragraph (the same body paragraph, or the same paragraph of one cell). */
export function sameParagraph(a: Pos, b: Pos): boolean {
  return sameContainer(a, b) && paraIndex(a) === paraIndex(b)
}

/** The 누름틀 a position is in (its ends included), in the body or a table cell. */
export function fieldAt(s: Session, p: Pos = s.selection.head): FieldInfo | null {
  if (p.story || p.cell?.textBox) return null
  const f = clickHereFields(s).find((x) => sameParagraph(x.at, p) && p.offset >= x.start && p.offset <= x.end)
  return f ? { fieldId: f.fieldId, fieldType: 'clickhere', name: f.name, guide: f.guide, value: f.value, section: p.section, para: p.para, start: f.start, end: f.end, cell: p.cell } : null
}

function check(r: string, what: string): Record<string, unknown> {
  const v = JSON.parse(r) as Record<string, unknown>
  if (v.ok === false) throw new Error(`${what}: ${String(v.error ?? r)}`)
  return v
}

/**
 * Link the selected text (one paragraph) to an address. With nothing
 * selected, insert `text` (or the address itself) and link that, as one step.
 */
export const insertHyperlink: Command<{ uri: string; text?: string }> = {
  id: 'insert:hyperlink',
  isEnabled: ({ session }) => {
    const [a, b] = ordered(session.selection)
    // One paragraph of the body or of a table cell; the engine has no link target in text boxes.
    return !a.story && !a.cell?.textBox && sameParagraph(a, b)
  },
  run({ session }, { uri, text }) {
    const address = normalizeUri(uri)
    if (!address) throw new Error('insert:hyperlink: not a web address')
    const [a, b] = ordered(session.selection)
    return session.edit('insert:hyperlink', () => {
      let start = a.offset
      let end = b.offset
      if (collapsed(session.selection)) {
        const shown = text?.trim() || address
        const after = session.text.insert(a, shown)
        end = after.offset
        start = after.offset - [...shown].length
      }
      session.doc.raw.insertHyperlinkEx(JSON.stringify({ target: targetOf(a), start, end, uri: address }))
      const q: Pos = { ...a, offset: end }
      return { anchor: q, head: q }
    })
  },
}

export const editHyperlink: Command<{ uri: string; text?: string }> = {
  id: 'hyperlink:edit',
  isEnabled: ({ session }) => hyperlinkAt(session) !== null,
  run({ session }, { uri, text }) {
    const link = hyperlinkAt(session)!
    const address = normalizeUri(uri)
    if (!address) throw new Error('hyperlink:edit: not a web address')
    const p = ordered(session.selection)[0]
    const target = targetOf(p)
    return session.edit('hyperlink:edit', () => {
      const raw = session.doc.raw
      if (address !== link.uri) raw.updateHyperlinkEx(JSON.stringify({ target, fieldId: link.fieldId, uri: address }))
      let end = link.end
      if (text !== undefined && text.trim() && text !== link.text) {
        raw.replaceHyperlinkTextEx(JSON.stringify({ target, fieldId: link.fieldId, text }))
        end = link.start + [...text].length
      }
      const q: Pos = { ...p, offset: end }
      return { anchor: q, head: q }
    })
  },
}

/** Remove the link at the caret; the text and its formatting stay. */
export const removeHyperlink: Command = {
  id: 'hyperlink:remove',
  isEnabled: ({ session }) => hyperlinkAt(session) !== null,
  run({ session }) {
    const link = hyperlinkAt(session)!
    const p = ordered(session.selection)[0]
    const sel = session.selection
    return session.edit('hyperlink:remove', () => {
      session.doc.raw.removeHyperlinkEx(JSON.stringify({ target: targetOf(p), fieldId: link.fieldId, restoreFormatting: true }))
      return sel
    })
  },
}

/** Insert a 누름틀 at the caret, in body text or a table cell. */
export const insertField: Command<{ guide: string; memo?: string; name?: string }> = {
  id: 'insert:field',
  isEnabled: ({ session }) => {
    const p = session.selection.head
    return collapsed(session.selection) && !p.story && !p.cell?.textBox
  },
  run({ session }, { guide, memo = '', name = '' }) {
    const p = session.selection.head
    return session.edit('insert:field', () => {
      const raw = session.doc.raw
      const r = p.cell
        ? check(raw.insertClickHereFieldInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, p.offset, false, guide, memo, name, true), 'insertClickHereFieldInCell')
        : check(raw.insertClickHereField(p.section, p.para, p.offset, guide, memo, name, true), 'insertClickHereField')
      const q: Pos = { ...p, offset: Number(r.charOffset ?? p.offset) }
      return { anchor: q, head: q }
    })
  },
}

/** Remove the field at the caret; what was typed into it stays as plain text. */
export const removeField: Command = {
  id: 'field:remove',
  isEnabled: ({ session }) => fieldAt(session) !== null,
  run({ session }) {
    const f = fieldAt(session)!
    const sel = session.selection
    return session.edit('field:remove', () => {
      const raw = session.doc.raw
      // The engine removes the field together with what it holds; put the typed text back as plain text.
      if (f.cell) check(raw.removeFieldAtInCell(f.section, f.para, f.cell.control, f.cell.cell, f.cell.para, f.start, false), 'removeFieldAtInCell')
      else check(raw.removeFieldAt(f.section, f.para, f.start), 'removeFieldAt')
      if (f.value) {
        const at: Pos = { section: f.section, para: f.para, offset: f.start, ...(f.cell ? { cell: f.cell } : {}) }
        const end = session.text.insert(at, f.value)
        return { anchor: end, head: end }
      }
      return sel
    })
  },
}

export const FIELD_COMMANDS = [insertHyperlink, editHyperlink, removeHyperlink, insertField, removeField] as Command<never>[]
