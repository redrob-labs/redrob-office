// In-answer citations (spec task 3.6): the model links passages as
// [label](docnav://node/ID); clicking one selects that paragraph and scrolls
// to it. Node ids stay valid through edits, so a citation in an old reply
// still lands on the right paragraph after the document has changed.
import type { NodeId } from '@genoffice/hwp-core'
import type { EditorView } from '@genoffice/hwp-editor'
import { posOf } from './blocks'

export const DOC_NAV_SCHEME = 'docnav://'

/** docnav://node/ID -> ID; null for anything else */
export function parseDocNavHref(href: string): NodeId | null {
  const m = /^docnav:\/\/node\/(\d+)$/.exec(href)
  return m ? Number(m[1]) : null
}

/** Select paragraph `id` and scroll it into view; false when it no longer exists or is not reachable. */
export function navigateToNode(view: EditorView, id: NodeId): boolean {
  const s = view.session
  // Typing may have deferred pagination; the selection rectangles need real pages.
  s.settle()
  const p = posOf(s, id)
  if (!p) return false
  s.select({ anchor: p, head: { ...p, offset: s.text.length(p) } })
  view.render()
  view.focus()
  return true
}
