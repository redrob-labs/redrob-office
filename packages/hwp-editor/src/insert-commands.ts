// Insert flows (spec task 2.4): footnote, endnote, equation, picture,
// bookmark, header and footer. Each is one undo step and is placed at the
// caret in body text (한글 inserts these into the body; inside a table cell the
// caret's host paragraph is used for headers and footers only).
import type { Command } from './commands'
import { HWPUNIT_PER_MM } from './find-commands'
import type { Pos } from './position'
import type { Session } from './session'

function ok(r: string, what: string): Record<string, unknown> {
  const v = JSON.parse(r) as Record<string, unknown>
  if (v.ok === false) throw new Error(`${what}: ${String(v.error ?? r)}`)
  return v
}

const bodyCaret = (s: Session): Pos | null => (s.selection.head.cell ? null : s.selection.head)
const inBody = ({ session }: { session: Session }): boolean => bodyCaret(session) !== null

function note(id: 'insert:footnote' | 'insert:endnote'): Command<{ text?: string } | undefined> {
  return {
    id,
    isEnabled: inBody,
    run({ session, origin }, params) {
      const p = bodyCaret(session)!
      return session.edit(
        id,
        () => {
          const raw = session.doc.raw
          const r = ok(id === 'insert:footnote' ? raw.insertFootnote(p.section, p.para, p.offset) : raw.insertEndnote(p.section, p.para, p.offset), id)
          const control = Number(r.controlIdx)
          if (params?.text && id === 'insert:footnote') ok(raw.insertTextInFootnote(p.section, Number(r.paraIdx), control, 0, 0, params.text), 'insertTextInFootnote')
          // The note marker occupies one position after the caret.
          const q: Pos = { section: p.section, para: Number(r.paraIdx), offset: p.offset + 1 }
          return { anchor: q, head: q }
        },
        origin,
      )
    },
  }
}

export const insertFootnote = note('insert:footnote')
export const insertEndnote = note('insert:endnote')

/** 한글 equation script, e.g. "a over b", "sqrt {x^2 + 1}". Font size in pt. */
export const insertEquation: Command<{ script: string; fontSizePt?: number }> = {
  id: 'insert:equation',
  isEnabled: inBody,
  run({ session, origin }, { script, fontSizePt = 10 }) {
    if (!script.trim()) return null
    const p = bodyCaret(session)!
    return session.edit(
      'insert:equation',
      () => {
        const r = ok(session.doc.raw.insertEquation(p.section, p.para, p.offset, script, Math.round(fontSizePt * 100), 0), 'insertEquation')
        const q: Pos = { section: p.section, para: Number(r.paraIdx), offset: p.offset + 1 }
        return { anchor: q, head: q }
      },
      origin,
    )
  },
}

export interface PictureParams {
  bytes: Uint8Array
  /** File extension without the dot: png, jpg, gif, bmp. */
  extension: string
  /** Natural size in px. */
  widthPx: number
  heightPx: number
  description?: string
}

/** Size a picture to its natural size at 96 dpi, shrunk to fit the body width. */
export function pictureSize(s: Session, widthPx: number, heightPx: number, section = 0): { width: number; height: number } {
  const def = JSON.parse(s.doc.raw.getPageDef(section)) as { width: number; marginLeft: number; marginRight: number; landscape: boolean; height: number }
  const pageWidth = def.landscape ? def.height : def.width
  const body = pageWidth - def.marginLeft - def.marginRight
  const width = widthPx * 75 // 7200 HWPUNIT per inch / 96 px per inch
  const scale = width > body ? body / width : 1
  return { width: Math.round(width * scale), height: Math.round(heightPx * 75 * scale) }
}

export const insertPicture: Command<PictureParams> = {
  id: 'insert:image',
  isEnabled: inBody,
  run({ session, origin }, pic) {
    const p = bodyCaret(session)!
    const { width, height } = pictureSize(session, pic.widthPx, pic.heightPx, p.section)
    return session.edit(
      'insert:image',
      () => {
        const r = ok(
          session.doc.raw.insertPicture(p.section, p.para, p.offset, '[]', pic.bytes, width, height, pic.widthPx, pic.heightPx, pic.extension.toLowerCase(), pic.description ?? ''),
          'insertPicture',
        )
        const q: Pos = { section: p.section, para: Number(r.paraIdx ?? p.para), offset: p.offset + 1 }
        return { anchor: q, head: q }
      },
      origin,
    )
  },
}

export const insertBookmark: Command<{ name: string }> = {
  id: 'insert:bookmark',
  isEnabled: inBody,
  run({ session, origin }, { name }) {
    if (!name.trim()) return null
    const p = bodyCaret(session)!
    const sel = session.selection
    return session.edit(
      'insert:bookmark',
      () => {
        ok(session.doc.raw.addBookmark(p.section, p.para, p.offset, name.trim()), 'addBookmark')
        return sel
      },
      origin,
    )
  },
}

export interface Bookmark {
  name: string
  sec: number
  para: number
  charPos: number
}

export function bookmarks(s: Session): Bookmark[] {
  return JSON.parse(s.doc.raw.getBookmarks()) as Bookmark[]
}

/** Header or footer text on both, odd or even pages (apply 0, 1, 2), created if missing. */
function headerFooter(id: 'page:header-create' | 'page:footer-create'): Command<{ text: string; applyTo?: 0 | 1 | 2 }> {
  const isHeader = id === 'page:header-create'
  return {
    id,
    isEnabled: () => true,
    run({ session, origin }, { text, applyTo = 0 }) {
      const section = session.selection.head.section
      const sel = session.selection
      return session.edit(
        id,
        () => {
          const raw = session.doc.raw
          const existing = JSON.parse(raw.getHeaderFooter(section, isHeader, applyTo)) as { exists?: boolean; text?: string }
          if (!existing.exists) ok(raw.createHeaderFooter(section, isHeader, applyTo), 'createHeaderFooter')
          // Append to the first paragraph, after anything already there.
          const at = existing.exists ? [...(existing.text ?? '')].length : 0
          if (text) ok(raw.insertTextInHeaderFooter(section, isHeader, applyTo, 0, at, text), 'insertTextInHeaderFooter')
          return sel
        },
        origin,
      )
    },
  }
}

export const createHeader = headerFooter('page:header-create')
export const createFooter = headerFooter('page:footer-create')

export const INSERT_COMMANDS = [insertFootnote, insertEndnote, insertEquation, insertPicture, insertBookmark, createHeader, createFooter] as Command<never>[]

export { HWPUNIT_PER_MM }
