import type { AgentMessage } from '@genoffice/agent-core'

/**
 * Route labels for Redrob Auto. Console routes `auto` on the ModelGuide - the request's profession and
 * task, then that cell's best model at its ranked effort - and the label is meant to come from the
 * person's machine, so only two ids leave it.
 *
 * Main processes inject the labeller (see @genoffice/electron-utils/route-labeller), the same way they
 * inject the rescue fetch: this layer stays free of the model and its runtime, and a renderer, which
 * never injects one, sends no label and lets Console label the request itself.
 *
 * Fails open: a label is a routing hint. A labeller that is slow, absent or throwing costs the
 * request its hint, never the request.
 */
export type RouteLabelFn = (text: string) => Promise<Record<string, unknown> | null>

let labeller: RouteLabelFn | null = null

/** How long a turn waits for its label before going without one. */
const LABEL_TIMEOUT_MS = 2_000

export function setRouteLabeller(fn: RouteLabelFn | null): void {
  labeller = fn
}

/** What the person asked for in this turn: the newest user message's text. */
function newestUserText(messages: AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && message.text.trim()) return message.text
  }
  return ''
}

/** `{ redrob: { route } }` for a request body, or nothing when there is no label to give. */
export async function routeFieldsFor(
  messages: AgentMessage[],
): Promise<{ redrob?: { route: Record<string, unknown> } }> {
  const text = newestUserText(messages)
  if (!labeller || !text) return {}
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const route = await Promise.race([
      labeller(text),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), LABEL_TIMEOUT_MS)
      }),
    ])
    return route ? { redrob: { route } } : {}
  } catch {
    return {}
  } finally {
    if (timer) clearTimeout(timer)
  }
}
