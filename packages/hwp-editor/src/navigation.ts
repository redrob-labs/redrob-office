// Caret movement. Horizontal moves are model moves (code point by code point,
// across paragraph ends within a container); vertical moves ask the engine,
// which knows the laid-out lines, tables and page breaks (`moveVertical`).
import { NO_CELL, at, containerOf, fromEngine, paraIndex, type Pos } from './position'
import type { Session } from './session'

export function documentStart(): Pos {
  return { section: 0, para: 0, offset: 0 }
}

export function documentEnd(s: Session, section = s.doc.sectionCount() - 1): Pos {
  const para = s.doc.paragraphCount(section) - 1
  return { section, para, offset: s.doc.paragraphLength(section, para) }
}

/** One code point left (-1) or right (+1), crossing paragraph breaks inside the container. */
export function moveHorizontal(s: Session, p: Pos, dir: -1 | 1): Pos {
  const len = s.text.length(p)
  if (dir < 0 && p.offset > 0) return { ...p, offset: p.offset - 1 }
  if (dir > 0 && p.offset < len) return { ...p, offset: p.offset + 1 }
  const c = containerOf(p)
  const i = paraIndex(p)
  if (dir < 0 && i > 0) {
    const prev = at(c, i - 1, 0)
    return { ...prev, offset: s.text.length(prev) }
  }
  if (dir > 0 && i < s.text.paragraphCount(c) - 1) return at(c, i + 1, 0)
  return p
}

/** Preferred x for a run of vertical moves, kept by the caller between moves. */
let preferredX = -1
let lastVertical: Pos | null = null

export function moveVerticalFrom(s: Session, p: Pos, dir: -1 | 1): Pos {
  // In a header, footer or note: the previous or next paragraph, at the same offset where it fits.
  if (p.story) {
    const n = s.text.paragraphCount(containerOf(p))
    const i = Math.min(Math.max(0, p.para + dir), n - 1)
    if (i === p.para) return dir < 0 ? { ...p, offset: 0 } : { ...p, offset: s.text.length(p) }
    const q = { ...p, para: i, offset: 0 }
    return { ...q, offset: Math.min(p.offset, s.text.length(q)) }
  }
  if (!lastVertical || lastVertical !== p) preferredX = -1
  const json = p.cell
    ? s.doc.raw.moveVertical(p.section, p.cell.para, p.offset, dir, preferredX, p.para, p.cell.control, p.cell.cell, p.cell.para)
    : s.doc.raw.moveVertical(p.section, p.para, p.offset, dir, preferredX, NO_CELL, NO_CELL, NO_CELL, NO_CELL)
  const r = JSON.parse(json) as Parameters<typeof fromEngine>[0] & { preferredX?: number }
  preferredX = r.preferredX ?? -1
  const next = fromEngine(r)
  lastVertical = next
  return next
}
