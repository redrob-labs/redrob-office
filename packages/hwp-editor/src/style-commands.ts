// 스타일 (style editor, spec task 2.3): create, edit and delete paragraph
// styles. The engine owns the style table; changing a style's shapes restyles
// every paragraph that uses it. `char` and `para` take the same keys and units
// as format:char-shape-apply and format:para-shape-apply.
import type { Command } from './commands'
import type { Session } from './session'
import { styleList } from './format-commands'

export interface StyleDetail {
  charProps: Record<string, unknown>
  paraProps: Record<string, unknown>
}

export interface StyleEdit {
  name?: string
  englishName?: string
  nextStyleId?: number
  char?: Record<string, unknown>
  para?: Record<string, unknown>
}

export function styleDetail(s: Session, styleId: number): StyleDetail {
  return JSON.parse(s.doc.raw.getStyleDetail(styleId)) as StyleDetail
}

function ensure(ok: boolean, what: string): void {
  if (!ok) throw new Error(`${what} failed`)
}

function writeShapes(s: Session, id: number, e: StyleEdit): void {
  const char = e.char ?? {}
  const para = e.para ?? {}
  if (Object.keys(char).length || Object.keys(para).length) ensure(s.doc.raw.updateStyleShapes(id, JSON.stringify(char), JSON.stringify(para)), 'updateStyleShapes')
}

/** The id the last style:create made (the bus returns the change, not the id). */
export function lastCreatedStyle(s: Session): number {
  return Math.max(...styleList(s).map((x) => x.id))
}

export const createStyle: Command<StyleEdit & { name: string }> = {
  id: 'style:create',
  isEnabled: () => true,
  run({ session }, e) {
    const name = e.name.trim()
    if (!name) throw new Error('style:create: a style needs a name')
    if (styleList(session).some((x) => x.name === name)) throw new Error(`style:create: "${name}" already exists`)
    const sel = session.selection
    return session.edit('style:create', () => {
      const id = session.doc.raw.createStyle(JSON.stringify({ name, englishName: e.englishName ?? '', type: 0, nextStyleId: e.nextStyleId ?? 0 }))
      // A new style's next style is itself unless the person chose another.
      if (e.nextStyleId === undefined) ensure(session.doc.raw.updateStyle(id, JSON.stringify({ name, englishName: e.englishName ?? '', nextStyleId: id })), 'updateStyle')
      writeShapes(session, id, e)
      return sel
    })
  },
}

export const updateStyle: Command<StyleEdit & { styleId: number }> = {
  id: 'style:update',
  isEnabled: () => true,
  run({ session }, e) {
    const cur = styleList(session).find((x) => x.id === e.styleId)
    if (!cur) throw new Error(`style:update: no style ${e.styleId}`)
    const name = e.name?.trim() ?? cur.name
    if (!name) throw new Error('style:update: a style needs a name')
    if (name !== cur.name && styleList(session).some((x) => x.name === name)) throw new Error(`style:update: "${name}" already exists`)
    const sel = session.selection
    return session.edit('style:update', () => {
      const meta = { name, englishName: e.englishName ?? cur.englishName, nextStyleId: e.nextStyleId ?? cur.nextStyleId }
      ensure(session.doc.raw.updateStyle(e.styleId, JSON.stringify(meta)), 'updateStyle')
      writeShapes(session, e.styleId, e)
      return sel
    })
  },
}

/** Delete a style; its paragraphs fall back to 바탕글. 바탕글 itself can't be deleted. */
export const deleteStyle: Command<{ styleId: number }> = {
  id: 'style:delete',
  isEnabled: (_ctx, p) => (p?.styleId ?? 0) !== 0,
  run({ session }, { styleId }) {
    if (styleId === 0) return null
    const sel = session.selection
    return session.edit('style:delete', () => {
      ensure(session.doc.raw.deleteStyle(styleId), 'deleteStyle')
      return sel
    })
  },
}

export const STYLE_COMMANDS = [createStyle, updateStyle, deleteStyle] as Command<never>[]
