/**
 * Home's composer: "describe a document" opens the file it is about with
 * Redrob already answering.
 *
 * The shell routes the request to an editor, opens a blank file there, and
 * queues the request against that editor view's webContents. The editor asks
 * for it once on boot (`app:consume-ask-prompt`) and hands it to its Redrob
 * panel, which runs it through the normal agent loop - so the run is visible,
 * fails closed and can be rolled back like any other.
 *
 * Only editors whose panel can take a queued request are routed to; anything
 * else opens in Docs.
 */
import { ipcMain } from 'electron'

/** editors whose Redrob panel can run a queued request today */
export type AskTarget = 'docs' | 'slides'

/** a request longer than this is cut before it reaches an editor */
export const ASK_PROMPT_MAX = 4000

export const ASK_CHANNELS = {
  consume: 'app:consume-ask-prompt',
} as const

const DECK = /\b(deck|slides?|presentation|pitch|keynote|pptx?)\b/i

/** which editor a Home request opens in; Docs when nothing points elsewhere */
export function routeAsk(prompt: string): AskTarget {
  return DECK.test(prompt) ? 'slides' : 'docs'
}

/** trimmed, length-capped request text, or null when there is nothing to ask */
export function cleanAskPrompt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null
  return text.length > ASK_PROMPT_MAX ? text.slice(0, ASK_PROMPT_MAX) : text
}

const pending = new Map<number, string>()

/** park a request for the editor view with this webContents id */
export function queueAskPrompt(webContentsId: number, prompt: string): void {
  pending.set(webContentsId, prompt)
}

/** the request parked for this view, consumed once */
export function takeAskPrompt(webContentsId: number): string | null {
  const prompt = pending.get(webContentsId) ?? null
  pending.delete(webContentsId)
  return prompt
}

let registered = false

export function registerAskPromptIpc(): void {
  if (registered) return
  registered = true
  // keyed by the sender, so a view can only ever read its own request
  ipcMain.handle(ASK_CHANNELS.consume, (event) => takeAskPrompt(event.sender.id))
}
