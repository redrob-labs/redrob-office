/**
 * @vitest-environment jsdom
 *
 * The Markdown assistant offers sign-in only when a run failed on
 * authentication (the transport's code, never the localized text), like
 * Docs, Sheets, Slides and PDF.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStreamCallbacks } from '@genoffice/agent-core'

const failures: Array<[string, string | undefined]> = []
vi.mock('../src/renderer/ai/transport', () => ({
  createElectronTransport: () => ({
    stream: (_req: unknown, cb: AgentStreamCallbacks) => {
      const [message, code] = failures.shift() ?? ['boom', undefined]
      queueMicrotask(() => cb.onError(message, code as never))
      return { cancel: () => undefined }
    },
  }),
}))

const { AiPanel } = await import('../src/renderer/ai/AiPanel')
const { LocaleProvider } = await import('../src/renderer/i18n/locale')

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true
Element.prototype.scrollTo = function scrollTo() {}

const markdownApi = {
  getAiSettings: vi.fn(async () => ({ provider: 'genspark', providers: {} })),
  aiSignIn: vi.fn(async () => undefined),
  onLanguageChanged: () => () => undefined,
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(window as unknown as { markdownApi: typeof markdownApi }).markdownApi = markdownApi
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const flush = async () => {
  for (let i = 0; i < 6; i++) await act(async () => new Promise((r) => setTimeout(r, 0)))
}

const deps = {
  getEditor: () => null,
  getFrontmatter: () => '',
  setFrontmatter: () => undefined,
  getSnapshot: () => ({ body: '', frontmatter: '' }),
  restoreSnapshot: () => undefined,
  onRunDone: () => undefined,
}

async function runOnce(text: string) {
  act(() =>
    root.render(
      createElement(LocaleProvider, {
        initial: 'en',
        children: createElement(AiPanel, { deps, filePath: null, onCollapse: () => undefined, preset: { text, nonce: Date.now() } }),
      }),
    ),
  )
  await flush()
}

const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)

describe('Markdown AI failure', () => {
  it('an authentication failure offers sign-in, which runs Redrob sign-in', async () => {
    failures.push(['Your Redrob session expired.', 'auth'])
    await runOnce('tidy the headings')
    expect(host.textContent).toContain('Your Redrob session expired.')
    expect(host.textContent).toContain('Not sent')
    await act(async () => button('Sign in to Redrob')!.click())
    expect(markdownApi.aiSignIn).toHaveBeenCalled()
  })

  it('any other failure shows its own message and no sign-in', async () => {
    failures.push(['Out of credits for today.', 'credits'])
    await runOnce('tidy the headings')
    expect(host.textContent).toContain('Out of credits for today.')
    expect(button('Sign in to Redrob')).toBeUndefined()
  })
})
