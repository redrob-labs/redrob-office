// Editing headers, footers and notes (spec task 1.7). The caret enters a story
// (a header or footer of a section, or a footnote/endnote), types there through
// the same Text calls as the body, and leaves it again. The coverage list's
// close, previous and next commands act on the story the caret is in.
import type { Command } from './commands'
import type { Session } from './session'
import { inBody, type Pos, type Story } from './position'

function json(r: string, what: string): Record<string, unknown> {
  const v = JSON.parse(r) as Record<string, unknown>
  if (v.ok === false) throw new Error(`${what}: ${String(v.error ?? r)}`)
  return v
}

const story = (s: Session): Story | undefined => s.selection.head.story

/** Where the caret was in the body when it entered a header or footer, to go back to on close. */
const returnTo = new WeakMap<Session, Pos>()
const remember = (s: Session) => {
  const h = s.selection.head
  if (!h.story) returnTo.set(s, h)
}
const stillThere = (s: Session, p: Pos): boolean => {
  try {
    return p.para < s.doc.paragraphCount(p.section) && p.offset <= s.text.length(p)
  } catch {
    return false
  }
}

function caretPage(s: Session, p: Pos = s.selection.head): number {
  try {
    return s.text.cursorRect(p).pageIndex
  } catch {
    return 0
  }
}

/** The end of a story's last paragraph. */
function storyEnd(s: Session, section: number, st: Story): Pos {
  const n = s.text.paragraphCount({ section, story: st })
  const last: Pos = { section, para: Math.max(0, n - 1), offset: 0, story: st }
  return { ...last, offset: s.text.length(last) }
}

/** Put the caret in a header or footer of the caret's page (creating it if there is none). */
export const editHeaderFooter: Command<{ kind: 'header' | 'footer'; applyTo?: number; page?: number }> = {
  id: 'page:headerfooter-edit',
  isEnabled: () => true,
  run({ session }, { kind, applyTo = 0, page }) {
    const pg = page ?? caretPage(session)
    const section = session.doc.pageInfo(pg).sectionIndex
    const exists = (json(session.doc.raw.getHeaderFooter(section, kind === 'header', applyTo), 'getHeaderFooter') as { exists: boolean }).exists
    const st: Story = { kind, applyTo, page: pg }
    remember(session)
    const enter = () => {
      const q = storyEnd(session, section, st)
      session.select({ anchor: q, head: q })
    }
    if (exists) {
      enter()
      return null
    }
    const change = session.edit('page:headerfooter-edit', () => {
      json(session.doc.raw.createHeaderFooter(section, kind === 'header', applyTo), 'createHeaderFooter')
      const q = storyEnd(session, section, st)
      return { anchor: q, head: q }
    })
    return change
  },
}

/** Leave the header, footer or note: back to the body where the story is anchored. */
function closeStory(id: string, kinds: Array<Story['kind']>): Command {
  return {
    id,
    isEnabled: ({ session }) => {
      const st = story(session)
      return !!st && kinds.includes(st.kind)
    },
    run({ session }) {
      const h = session.selection.head
      const st = h.story!
      let q: Pos
      if (st.kind === 'note') {
        const positions = JSON.parse(session.doc.raw.getControlTextPositions(h.section, st.host)) as number[]
        const at = positions[st.control]
        q = { section: h.section, para: st.host, offset: at === undefined ? 0 : Math.min(at + 1, session.doc.paragraphLength(h.section, st.host)) }
      } else if (returnTo.has(session) && stillThere(session, returnTo.get(session)!)) {
        q = returnTo.get(session)!
      } else {
        // The top of the body on the page the caret was on.
        const info = session.doc.pageInfo(st.page)
        const r = JSON.parse(session.doc.raw.hitTest(st.page, info.marginLeft + 1, info.marginTop + info.marginHeader + 1)) as { sectionIndex: number; paragraphIndex: number; charOffset: number }
        q = { section: r.sectionIndex, para: r.paragraphIndex, offset: r.charOffset }
      }
      session.select({ anchor: q, head: q })
      return null
    },
  }
}

/** 이전/다음 머리말: the same kind of header or footer on the previous or next page that has one. */
function stepHeaderFooter(id: string, dir: -1 | 1): Command {
  return {
    id,
    isEnabled: ({ session }) => {
      const st = story(session)
      return !!st && st.kind !== 'note'
    },
    run({ session }) {
      const st = story(session)!
      if (st.kind === 'note') return null
      const r = json(session.doc.raw.navigateHeaderFooterByPage(st.page, st.kind === 'header', dir), 'navigateHeaderFooterByPage')
      if (r.pageIndex === undefined) return null
      const next: Story = { kind: st.kind, applyTo: Number(r.applyTo ?? st.applyTo), page: Number(r.pageIndex) }
      const q = storyEnd(session, Number(r.sectionIdx ?? 0), next)
      session.select({ anchor: q, head: q })
      return null
    },
  }
}

/** Put the caret in the footnote or endnote whose marker is nearest the caret, at its end. */
export const editNote: Command = {
  id: 'insert:note-edit',
  isEnabled: ({ session }) => noteNear(session) !== null,
  run({ session }) {
    remember(session)
    const n = noteNear(session)!
    const q = storyEnd(session, n.section, { kind: 'note', host: n.host, control: n.control })
    session.select({ anchor: q, head: q })
    return null
  },
}

function noteNear(s: Session): { section: number; host: number; control: number } | null {
  const h = s.selection.head
  if (!inBody(h)) return null
  for (const dir of ['backward', 'forward']) {
    try {
      const r = JSON.parse(s.doc.raw.getFootnoteAtCursor(h.section, h.para, h.offset, dir)) as { hit?: boolean; sectionIndex: number; paragraphIndex: number; controlIndex: number }
      if (r.hit && r.paragraphIndex === h.para) return { section: r.sectionIndex, host: r.paragraphIndex, control: r.controlIndex }
    } catch {
      // no note on this side
    }
  }
  return null
}

export const STORY_COMMANDS = [
  editHeaderFooter,
  closeStory('page:headerfooter-close', ['header', 'footer']),
  closeStory('insert:note-close', ['note']),
  stepHeaderFooter('page:headerfooter-prev', -1),
  stepHeaderFooter('page:headerfooter-next', 1),
  editNote,
] as Command<never>[]
