// Hyperlinks and 누름틀 (click-here) fields (spec task 2.4), under the coverage
// list's ids. The engine owns both: a hyperlink is a field range over text in
// one paragraph, offsets in Unicode characters; a 누름틀 is an empty field
// whose guide text 한글 shows until someone types into it.
import { targetOf } from './comments'
import { collapsed, ordered, type Session } from './session'
import { inBody, sameContainer, type Pos } from './position'
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
  if (p.story) return null
  try {
    return hyperlinksIn(s, p).find((l) => p.offset >= l.start && p.offset <= l.end) ?? null
  } catch {
    return null
  }
}

/** Fields in the body paragraph at the caret (cell fields are not addressed yet). */
export function fieldAt(s: Session, p: Pos = s.selection.head): FieldInfo | null {
  if (!inBody(p)) return null
  const list = JSON.parse(s.doc.raw.getFieldList()) as Array<{
    fieldId: number
    fieldType: string
    name: string
    guide: string
    value: string
    cellField: boolean
    location: { sectionIndex: number; paraIndex: number }
    startCharIdx: number
    endCharIdx: number
  }>
  const f = list.find((x) => !x.cellField && x.fieldType !== 'hyperlink' && x.location.sectionIndex === p.section && x.location.paraIndex === p.para && p.offset >= x.startCharIdx && p.offset <= x.endCharIdx)
  return f ? { fieldId: f.fieldId, fieldType: f.fieldType, name: f.name, guide: f.guide, value: f.value, section: p.section, para: p.para, start: f.startCharIdx, end: f.endCharIdx } : null
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
    return !a.story && sameContainer(a, b) && a.para === b.para
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

/** Insert a 누름틀 at the caret (body text). */
export const insertField: Command<{ guide: string; memo?: string; name?: string }> = {
  id: 'insert:field',
  isEnabled: ({ session }) => collapsed(session.selection) && inBody(session.selection.head),
  run({ session }, { guide, memo = '', name = '' }) {
    const p = session.selection.head
    return session.edit('insert:field', () => {
      const r = check(session.doc.raw.insertClickHereField(p.section, p.para, p.offset, guide, memo, name, true), 'insertClickHereField')
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
      check(session.doc.raw.removeFieldAt(f.section, f.para, f.start), 'removeFieldAt')
      return sel
    })
  },
}

export const FIELD_COMMANDS = [insertHyperlink, editHyperlink, removeHyperlink, insertField, removeField] as Command<never>[]
