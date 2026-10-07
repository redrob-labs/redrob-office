import type { Editor } from '@tiptap/core'
import { Fragment, type Node as PmNode } from '@tiptap/pm/model'
import { TextSelection, type EditorState } from '@tiptap/pm/state'

/** Word's Sort Text: what each paragraph is compared by, and which way. */
export interface SortOptions {
  by: 'text' | 'number' | 'date'
  order: 'asc' | 'desc'
}

/** blocks Sort may reorder; a table, picture or section break in the range refuses the sort */
const SORTABLE = new Set(['docParagraph', 'docHeading', 'docListItem'])

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** The first number in a paragraph ("1,250", "-3.5", "₩3.86bn" → 3.86); null when it has none. */
export function numberKey(text: string): number | null {
  const m = /[-−]?\d[\d,]*(?:\.\d+)?|[-−]?\.\d+/.exec(text)
  if (!m) return null
  const n = Number(m[0].replace(/,/g, '').replace('−', '-'))
  return Number.isFinite(n) ? n : null
}

/** A date at the start of a paragraph, as a timestamp; null when it does not start with one. */
export function dateKey(text: string): number | null {
  const t = text.trim()
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t)
  if (iso) {
    const d = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return Number.isFinite(d) ? d : null
  }
  const head = /^[^\n]{1,40}?\d{4}/.exec(t)?.[0]
  const d = head ? Date.parse(head) : Number.NaN
  return Number.isFinite(d) ? d : null
}

/**
 * Paragraphs in the sorted order. Like Word: blank paragraphs go first when
 * ascending (last when descending), paragraphs with no number or date for a
 * number or date sort go after those that have one, and equal keys keep
 * their order.
 */
export function sortBlocks<T>(items: readonly T[], textOf: (item: T) => string, opts: SortOptions): T[] {
  const dir = opts.order === 'asc' ? 1 : -1
  const keyed = items.map((item, i) => {
    const text = textOf(item).trim()
    const key = opts.by === 'number' ? numberKey(text) : opts.by === 'date' ? dateKey(text) : null
    return { item, i, text, key }
  })
  keyed.sort((a, b) => {
    const blankA = a.text === ''
    const blankB = b.text === ''
    if (blankA !== blankB) return (blankA ? -1 : 1) * dir
    if (opts.by !== 'text') {
      if ((a.key === null) !== (b.key === null)) return a.key === null ? 1 : -1
      if (a.key !== null && b.key !== null && a.key !== b.key) return (a.key - b.key) * dir
      if (a.key !== null && b.key !== null) return a.i - b.i
    }
    const c = collator.compare(a.text, b.text)
    return c !== 0 ? c * dir : a.i - b.i
  })
  return keyed.map((k) => k.item)
}

/** The run of sibling blocks the selection covers, when Sort can reorder them. */
export function sortRange(state: EditorState): { start: number; end: number; blocks: PmNode[] } | null {
  const { $from, $to } = state.selection
  const range = $from.blockRange($to)
  if (!range) return null
  const blocks: PmNode[] = []
  for (let i = range.startIndex; i < range.endIndex; i++) {
    const node = range.parent.child(i)
    if (!SORTABLE.has(node.type.name)) return null
    blocks.push(node)
  }
  return blocks.length >= 2 ? { start: range.start, end: range.end, blocks } : null
}

/** Whether Sort has something to do here (two or more selected paragraphs, nothing else in between). */
export function canSortSelection(editor: Editor): boolean {
  return sortRange(editor.state) !== null
}

/** Sort the selected paragraphs or list items in one undo step; false when there is nothing to sort. */
export function sortSelection(editor: Editor, opts: SortOptions): boolean {
  return editor
    .chain()
    .focus()
    .command(({ state, tr, dispatch }) => {
      const at = sortRange(state)
      if (!at) return false
      const sorted = sortBlocks(at.blocks, (n) => n.textContent, opts)
      if (sorted.every((n, i) => n === at.blocks[i])) return true
      if (dispatch) {
        tr.replaceWith(at.start, at.end, Fragment.from(sorted))
        // keep the sorted paragraphs selected, as Word does
        const end = at.start + Fragment.from(sorted).size
        tr.setSelection(TextSelection.between(tr.doc.resolve(at.start + 1), tr.doc.resolve(end - 1)))
        dispatch(tr)
      }
      return true
    })
    .run()
}
