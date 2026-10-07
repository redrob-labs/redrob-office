// Find, replace and page setup (spec task 2.3). Search runs in the engine;
// a found match becomes the selection. Replace-all and page setup are one
// undo step each.
import type { Command } from './commands'
import { compare, sameContainer, type Pos } from './position'
import { collapsed, ordered, type Session } from './session'

export interface FindParams {
  query: string
  caseSensitive?: boolean
  backward?: boolean
}

interface EngineMatch {
  found: boolean
  sec?: number
  para?: number
  charOffset?: number
  length?: number
  totalMatchCount?: number
}

interface BodyMatch {
  sec: number
  para: number
  charOffset: number
  length: number
}

/**
 * Select the next match after (or before) the selection, wrapping around.
 * Matches come from the engine's whole-document search (body text), so a
 * match starting exactly at the caret is found too (the engine's
 * incremental search starts after its position).
 */
export function findNext(s: Session, { query, caseSensitive = false, backward = false }: FindParams): EngineMatch {
  if (!query) return { found: false }
  const all = (JSON.parse(s.doc.raw.searchAllText(query, caseSensitive, false)) as BodyMatch[]).sort((x, y) => x.sec - y.sec || x.para - y.para || x.charOffset - y.charOffset)
  if (!all.length) return { found: false, totalMatchCount: 0 }
  const [a, b] = ordered(s.selection)
  const ref = (m: BodyMatch, p: Pos) => m.sec - p.section || m.para - p.para || m.charOffset - p.offset
  // From inside a cell, search from the table's host paragraph.
  const fromA: Pos = a.cell ? { section: a.section, para: a.para, offset: 0 } : a
  const fromB: Pos = b.cell ? { section: b.section, para: b.para, offset: 0 } : b
  let m: BodyMatch | undefined
  let wrapped = false
  if (backward) {
    m = [...all].reverse().find((x) => ref(x, fromA) < 0)
    if (!m) [m, wrapped] = [all[all.length - 1], true]
  } else {
    m = collapsed(s.selection) ? all.find((x) => ref(x, fromA) >= 0) : all.find((x) => ref(x, fromB) >= 0 && ref(x, fromA) !== 0)
    if (!m) [m, wrapped] = [all[0], true]
  }
  const anchor: Pos = { section: m!.sec, para: m!.para, offset: m!.charOffset }
  s.select({ anchor, head: { ...anchor, offset: m!.charOffset + m!.length } })
  return { found: true, sec: m!.sec, para: m!.para, charOffset: m!.charOffset, length: m!.length, totalMatchCount: all.length, wrapped } as EngineMatch & { wrapped: boolean }
}

export function countMatches(s: Session, query: string, caseSensitive = false): number {
  if (!query) return 0
  return (JSON.parse(s.doc.raw.searchAllText(query, caseSensitive, true)) as unknown[]).length
}

function selectionIs(s: Session, query: string, caseSensitive: boolean): boolean {
  const sel = s.selection
  if (collapsed(sel) || !sameContainer(sel.anchor, sel.head)) return false
  const text = s.text.textBetween(sel.anchor, sel.head)
  return caseSensitive ? text === query : text.toLowerCase() === query.toLowerCase()
}

export const findNextCommand: Command<FindParams> = {
  id: 'edit:find-next',
  isEnabled: (_c, p) => !!p?.query,
  run({ session }, params) {
    findNext(session, params)
    return null
  },
}

/** Replace the selected match (if the selection is one) and move to the next match. */
export const replaceCommand: Command<FindParams & { replacement: string }> = {
  id: 'edit:replace',
  isEnabled: (_c, p) => !!p?.query,
  run({ session, origin }, params) {
    if (!selectionIs(session, params.query, !!params.caseSensitive)) {
      findNext(session, params)
      return null
    }
    const change = session.edit(
      'edit:replace',
      () => {
        const [a, b] = ordered(session.selection)
        let p = session.text.delete(a, b)
        p = session.text.insert(p, params.replacement)
        return { anchor: p, head: p }
      },
      origin,
    )
    findNext(session, params)
    return change
  },
}

export const replaceAllCommand: Command<FindParams & { replacement: string }> = {
  id: 'edit:replace-all',
  isEnabled: (_c, p) => !!p?.query,
  run({ session, origin }, { query, replacement, caseSensitive = false }) {
    if (countMatches(session, query, caseSensitive) === 0) return null
    const sel = session.selection
    return session.edit(
      'edit:replace-all',
      () => {
        const r = JSON.parse(session.doc.raw.replaceAll(query, replacement, caseSensitive)) as { ok: boolean; error?: string }
        if (!r.ok) throw new Error(`replaceAll: ${r.error}`)
        // Keep the caret where it was if that paragraph still has room; otherwise go to the start.
        const head = sel.head.cell ? { section: sel.head.section, para: sel.head.para, offset: 0 } : sel.head
        const len = session.text.length(head)
        const p = compare(head, { ...head, offset: len }) <= 0 ? head : { ...head, offset: len }
        return { anchor: p, head: p }
      },
      origin,
    )
  },
}

/** 1 inch = 7200 HWPUNIT. */
export const HWPUNIT_PER_MM = 7200 / 25.4

export interface PageDef {
  width: number
  height: number
  marginLeft: number
  marginRight: number
  marginTop: number
  marginBottom: number
  marginHeader: number
  marginFooter: number
  marginGutter: number
  landscape: boolean
  binding: number
}

export function pageDef(s: Session, section = s.selection.head.section): PageDef {
  return JSON.parse(s.doc.raw.getPageDef(section)) as PageDef
}

export const pageSetupCommand: Command<{ props: Partial<PageDef>; section?: number }> = {
  id: 'page:setup-apply',
  isEnabled: () => true,
  run({ session, origin }, { props, section }) {
    const sel = session.selection
    const sec = section ?? sel.head.section
    return session.edit(
      'page:setup-apply',
      () => {
        const r = JSON.parse(session.doc.raw.setPageDef(sec, JSON.stringify(props))) as { ok: boolean; error?: string }
        if (!r.ok) throw new Error(`setPageDef: ${r.error}`)
        return sel
      },
      origin,
    )
  },
}

export const FIND_COMMANDS = [findNextCommand, replaceCommand, replaceAllCommand, pageSetupCommand] as Command<never>[]
