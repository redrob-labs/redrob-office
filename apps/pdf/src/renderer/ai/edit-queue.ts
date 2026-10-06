/**
 * Selection-scoped AI edit queue (docs and markdown parity): the person marks
 * passages with short instructions from the Ask AI popover, they pile up above
 * the composer, and the batch is submitted as one agent run.
 *
 * A PDF does not reflow, so an item is anchored by its page and the quoted
 * text rather than by a live decoration. Text edits made since can still move
 * or remove the quote; the instruction tells the model to verify each quote on
 * its page before changing anything, and to report a target it cannot find
 * instead of guessing.
 */

/** Hard cap on queued edits: keeps one submission inside the agent's turn budget and the card readable */
export const EDIT_QUEUE_MAX = 10
/** Soft cap on one instruction; longer requests belong in the main composer */
export const EDIT_INSTRUCTION_MAX = 500
/** the quote kept per item; enough to find the passage, short enough for the prompt */
const EXCERPT_MAX = 400

export interface PdfQueueItem {
  qid: string
  /** 1-based page number as the tools use it (the original page), where the passage was marked */
  page: number
  /** the marked text, whitespace-collapsed */
  excerpt: string
  instruction: string
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

let seq = 0
/** A new item, or null when there is nothing to anchor or ask. */
export function makeQueueItem(page: number, excerpt: string, instruction: string): PdfQueueItem | null {
  const quote = excerpt.replace(/\s+/g, ' ').trim()
  const ask = instruction.trim().slice(0, EDIT_INSTRUCTION_MAX)
  if (!quote || !ask || !Number.isInteger(page) || page < 1) return null
  seq += 1
  return { qid: `q${Date.now().toString(36)}${seq}`, page, excerpt: quote.slice(0, EXCERPT_MAX), instruction: ask }
}

/** Adds an item unless the queue is full; the queue is never longer than EDIT_QUEUE_MAX. */
export function addToQueue(queue: readonly PdfQueueItem[], item: PdfQueueItem): PdfQueueItem[] {
  return queue.length >= EDIT_QUEUE_MAX ? [...queue] : [...queue, item]
}

/**
 * The batch instruction handed to the model (English regardless of UI
 * language). Items are listed in page order; PDF edits do not shift other
 * pages, so the order is for reading, not for index stability.
 */
export function buildQueueInstruction(items: readonly PdfQueueItem[]): string {
  const ordered = [...items].sort((a, b) => a.page - b.page)
  const lines = ordered.map(
    (item, i) => `${i + 1}. Page ${item.page}, target text: "${truncate(item.excerpt, 200)}"\n   Requested change: ${item.instruction}`,
  )
  return [
    'The user marked passages in the PDF and queued one request per passage; handle them all now as a single batch.',
    '',
    'Requests (page numbers are the ones the tools use, as in read_pages):',
    ...lines,
    '',
    'For each request, first confirm the quoted target text on that page (read_pages or search_text), then apply the change with the tool that fits it (edit_text, markup_text, add_note, ...). If a quote is no longer on its page, skip that request and say so; never change a different passage instead. Do not modify anything outside the listed targets. Finish with a short summary of what was changed.',
  ].join('\n')
}

/** user-facing echo of a submission, shown as the chat bubble text */
export function buildQueueSummary(header: string, items: readonly PdfQueueItem[]): string {
  return [header, ...items.map((item, i) => `${i + 1}. p.${item.page} ${truncate(item.excerpt, 24)} — ${item.instruction}`)].join('\n')
}
