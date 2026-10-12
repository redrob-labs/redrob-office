// Selection-scoped AI edit queue (spec task 3.6, Docs and Markdown parity):
// the user selects passages, gives each a short instruction, and sends the
// batch as one run. Each item is an Anchor (packages/hwp-editor/src/anchors.ts),
// so it follows the document through edits and orphans when its text is gone.
//
// Unlike Docs, the batch needs no bottom-up ordering: items are addressed by
// Node id, which no other edit can shift.
import type { Anchors, Session } from '@genoffice/hwp-editor'

export const EDIT_QUEUE_MAX = 10
export const EDIT_INSTRUCTION_MAX = 500

export interface EditQueueItem {
  /** The anchor id. */
  qid: string
  instruction: string
  /** text at annotation time; the label of last resort once the anchor is gone */
  capturedText: string
}

export interface ResolvedItem {
  item: EditQueueItem
  /** null = the anchored text is gone */
  target: { startNode: number; endNode: number; start: number; end: number; excerpt: string } | null
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function resolveItem(anchors: Anchors, item: EditQueueItem): ResolvedItem {
  const a = anchors.get(item.qid)
  if (!a || a.orphaned) return { item, target: null }
  return { item, target: { startNode: a.startNode, endNode: a.endNode, start: a.start, end: a.end, excerpt: a.text.replace(/\s+/g, ' ').trim() } }
}

export type LiveItem = ResolvedItem & { target: NonNullable<ResolvedItem['target']> }

export function liveItems(anchors: Anchors, items: EditQueueItem[]): LiveItem[] {
  return items.map((i) => resolveItem(anchors, i)).filter((r): r is LiveItem => r.target !== null)
}

/** The batch instruction for the model (English whatever the UI language). */
export function buildQueueInstruction(entries: LiveItem[]): string {
  const lines = entries.map((e, i) => {
    const where =
      e.target.startNode === e.target.endNode
        ? `paragraph ${e.target.startNode}, characters ${e.target.start}–${e.target.end}`
        : `paragraphs ${e.target.startNode} (from character ${e.target.start}) to ${e.target.endNode} (to character ${e.target.end})`
    return `${i + 1}. ${where}, target text: "${truncate(e.target.excerpt, 200)}"\n   Requested change: ${e.item.instruction}`
  })
  return [
    'The user marked passages in the document and queued one edit per passage; apply them all now as a single batch.',
    '',
    'Edits (Node ids are stable, so the order does not matter):',
    ...lines,
    '',
    'Verify each quoted target text with read_blocks before changing it. Prefer replace_text for a change inside a sentence and replace_blocks for a whole-paragraph rewrite. Do not modify anything outside the listed targets. Finish with a short summary.',
  ].join('\n')
}

export function buildQueueSummary(header: string, entries: LiveItem[]): string {
  return [header, ...entries.map((e, i) => `${i + 1}. ${truncate(e.target.excerpt, 24)} — ${e.item.instruction}`)].join('\n')
}

/** Highlight queued passages on the page (overlay decorations; never the document canvas). */
export function decorate(session: Session, anchors: Anchors, items: EditQueueItem[], setDecoration: (key: string, rects: ReturnType<Session['text']['selectionRects']> | null) => void, previous: Set<string>): Set<string> {
  const now = new Set<string>()
  for (const item of items) {
    const r = anchors.range(item.qid)
    if (!r) continue
    const key = `queue:${item.qid}`
    now.add(key)
    try {
      setDecoration(key, session.text.selectionRects(r.anchor, r.head))
    } catch {
      setDecoration(key, null)
    }
  }
  for (const key of previous) if (!now.has(key)) setDecoration(key, null)
  return now
}
