/**
 * @vitest-environment jsdom
 *
 * The Redrob panel on a real editor session (spec task 3.5): a scripted model
 * over the real IPC transport calls a Hangul tool, the document changes, the
 * receipt and rollback point appear, and rolling back restores the document.
 * A failed turn renders as a failure, never as a silent fallback.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AiStreamChunk } from '@genoffice/ai-provider'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, type Pos } from '@genoffice/hwp-editor'
import { HangulAiPanel } from '../src/renderer/ai/AiPanel'
import { navigateToNode, parseDocNavHref } from '../src/renderer/ai/doc-nav'
import { LocaleProvider } from '../src/renderer/i18n/locale'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true

beforeAll(() => {
  initHwpCoreNode()
  // jsdom has no layout scrolling
  Element.prototype.scrollTo = function () {}
})

type Turn = (req: { requestId: string; messages: unknown[]; tools: Array<{ name: string }> }) => AiStreamChunk[]

let host: HTMLDivElement
let root: Root
let listeners: Array<(c: AiStreamChunk) => void>
let turns: Turn[]
let requests: Array<{ tools: Array<{ name: string }> }>

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  listeners = []
  turns = []
  requests = []
  ;(window as unknown as { hangulApi: unknown }).hangulApi = {
    getAiSettings: async () => ({ provider: 'redrob', providers: { redrob: { model: '' } } }),
    aiStream: async (req: { requestId: string; messages: unknown[]; tools: Array<{ name: string }> }) => {
      requests.push(req)
      const turn = turns.shift()
      const chunks = turn ? turn(req) : [{ requestId: req.requestId, type: 'done' as const }]
      setTimeout(() => chunks.forEach((c) => listeners.forEach((l) => l({ ...c, requestId: req.requestId }))), 0)
    },
    aiStreamCancel: async () => {},
    onAiStream: (l: (c: AiStreamChunk) => void) => {
      listeners.push(l)
      return () => (listeners = listeners.filter((x) => x !== l))
    },
    webSearch: async () => ({ results: [] }),
    getLanguage: async () => 'en',
    onLanguageChanged: () => () => {},
  }
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function editor(lines: string[]): EditorView {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  let p: Pos = { section: 0, para: 0, offset: 0 }
  lines.forEach((line, i) => {
    if (i > 0) p = s.text.split(p)
    p = s.text.insert(p, line)
  })
  const el = document.createElement('div')
  document.body.append(el)
  return new EditorView(el, s, new CommandBus(s), { painter: () => {} })
}

const body = (s: Session) => Array.from({ length: s.doc.paragraphCount(0) }, (_, i) => s.doc.text(0, i))

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await act(async () => new Promise((r) => setTimeout(r, 5)))
}

function mount(view: EditorView, readOnly = false): { runs: boolean[] } {
  const runs: boolean[] = []
  act(() =>
    root.render(
      createElement(LocaleProvider, {
        initial: 'en',
        children: createElement(HangulAiPanel, {
          readOnly,
          onCollapse: () => {},
          deps: { getSession: () => view.session, getView: () => view, onRunDone: (m: boolean) => runs.push(m) },
        }),
      }),
    ),
  )
  return { runs }
}

async function ask(text: string): Promise<void> {
  const box = host.querySelector('textarea')!
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(box, text)
    box.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await settle()
}

describe('Redrob panel', () => {
  it('runs a tool on the document, shows a receipt, and rolls back', async () => {
    const view = editor(['첫 문단', '둘째 문단'])
    const id = view.session.doc.nodeIdAt(0, 0)!
    turns.push((req) => [{ requestId: req.requestId, type: 'tool-call', toolCall: { id: 'c1', name: 'replace_blocks', input: { ids: [id], html: '<p>바뀐 문단</p>' } } }, { requestId: req.requestId, type: 'done' }])
    turns.push((req) => [{ requestId: req.requestId, type: 'delta', text: `Rewrote [the first paragraph](docnav://node/${id + 1}).` }, { requestId: req.requestId, type: 'done' }])
    const { runs } = mount(view)
    await ask('첫 문단을 다시 써 줘')
    expect(body(view.session)).toEqual(['바뀐 문단', '둘째 문단'])
    expect(requests[0]!.tools.map((t) => t.name)).toContain('replace_blocks')
    expect(host.textContent).toContain('Rewrote')
    expect(runs).toEqual([true])
    expect(view.session.dirty).toBe(true)
    const rollback = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Roll back')!
    expect(rollback).toBeTruthy()
    await act(async () => rollback.click())
    expect(body(view.session)).toEqual(['첫 문단', '둘째 문단'])
    // The rollback is itself undoable.
    view.session.undo()
    expect(body(view.session)).toEqual(['바뀐 문단', '둘째 문단'])
  })

  it('fails closed: a failed turn shows the engine’s message and marks the request undelivered', async () => {
    const view = editor(['문단'])
    turns.push((req) => [{ requestId: req.requestId, type: 'error', error: 'engine refused', errorCode: 'auth' }])
    mount(view)
    await ask('hello')
    expect(host.textContent).toContain('The assistant could not finish')
    expect(host.textContent).toContain('Not sent')
    expect(body(view.session)).toEqual(['문단'])
  })

  it('offers no tools in viewing mode', async () => {
    const view = editor(['문단'])
    mount(view, true)
    await ask('rewrite')
    expect(requests[0]!.tools).toEqual([])
  })
})

describe('docnav', () => {
  it('selects the cited paragraph and survives edits before it', () => {
    const view = editor(['하나', '둘', '셋'])
    const s = view.session
    const id = s.doc.nodeIdAt(0, 2)!
    expect(parseDocNavHref(`docnav://node/${id}`)).toBe(id)
    expect(parseDocNavHref('https://example.com')).toBeNull()
    s.select({ anchor: { section: 0, para: 0, offset: 0 }, head: { section: 0, para: 0, offset: 0 } })
    new CommandBus(s).run('edit:insert-text', { text: '영\n' })
    expect(navigateToNode(view, id)).toBe(true)
    expect(s.text.textBetween(s.selection.anchor, s.selection.head)).toBe('셋')
    expect(navigateToNode(view, 99999)).toBe(false)
  })
})
