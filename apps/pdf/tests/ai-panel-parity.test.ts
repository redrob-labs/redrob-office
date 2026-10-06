/**
 * @vitest-environment jsdom
 *
 * The PDF assistant keeps Docs' guarantees: one rollback point per run that
 * edited (undoable, spent once used), sign-in offered only on an
 * authentication failure, attachments read through the files skill, and an
 * edit queue sent as one batch.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStreamCallbacks, AgentStreamRequest } from '@genoffice/agent-core'

/** each model turn, scripted by the test: emit text and tool calls, then finish or fail */
type Turn = (cb: AgentStreamCallbacks, req: AgentStreamRequest) => void
const turns: Turn[] = []
const requests: AgentStreamRequest[] = []
vi.mock('../src/renderer/ai/transport', () => ({
  createElectronTransport: () => ({
    stream: (req: AgentStreamRequest, cb: AgentStreamCallbacks) => {
      requests.push(req)
      const turn = turns.shift() ?? ((c: AgentStreamCallbacks) => (c.onDelta('done'), c.onDone()))
      queueMicrotask(() => turn(cb, req))
      return { cancel: () => undefined }
    },
  }),
}))

/** the document the fake skill edits; rollback captures and restores it */
let doc = { text: 'original' }
vi.mock('../src/renderer/ai/pdf-skill', () => ({
  createPdfSkill: () => ({
    id: 'pdf',
    systemPrompt: '',
    tools: [{ name: 'edit_text', description: '', inputSchema: { type: 'object' } }],
    buildContext: () => '',
    executeTool: async (call: { input: Record<string, unknown> }) => {
      doc = { text: String(call.input.to) }
      return { output: 'ok', mutated: true, summary: 'Edited' }
    },
  }),
}))

const { AiPanel } = await import('../src/renderer/ai/AiPanel')
const { LocaleProvider } = await import('../src/renderer/i18n/locale')
const { addToQueue, buildQueueInstruction, makeQueueItem, EDIT_QUEUE_MAX } = await import('../src/renderer/ai/edit-queue')
const { createFilesSkill } = await import('../src/renderer/ai/files-skill')

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const pdfApi = {
  getAiSettings: vi.fn(async () => ({ provider: 'genspark', providers: {} })),
  gskStatus: vi.fn(async () => ({ loggedIn: false })),
  aiSignIn: vi.fn(async () => undefined),
  onLanguageChanged: () => () => undefined,
  pickAttachments: vi.fn(async () => ({ accepted: [{ path: 'C:\\in\\brief.txt', name: 'brief.txt', ext: 'txt', sizeBytes: 12 }], rejected: [] })),
  readAttachment: vi.fn(async () => ({ ok: true, text: 'brief text', offset: 0, totalChars: 10 })),
  readAttachmentImage: vi.fn(),
  getPathForFile: () => '',
}

// jsdom has no layout: the panel's follow-the-stream scroll is a no-op here
Element.prototype.scrollTo = function scrollTo() {}

beforeEach(() => {
  ;(window as unknown as { pdfApi: typeof pdfApi }).pdfApi = pdfApi
  doc = { text: 'original' }
  turns.length = 0
  requests.length = 0
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

const rollback = {
  capture: vi.fn(() => ({ ...doc })),
  restore: vi.fn((s: unknown) => {
    doc = s as typeof doc
  }),
}

async function mount(props: Record<string, unknown> = {}) {
  act(() =>
    root.render(
      createElement(LocaleProvider, {
        initial: 'en',
        children: createElement(AiPanel, { api: { selection: () => null } as never, onCollapse: () => undefined, rollback, ...props }),
      }),
    ),
  )
  await flush()
}

async function send(text: string) {
  const field = host.querySelector('textarea')!
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    set.call(field, text)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const sendBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === 'Send' || b.textContent === 'Send')!
  await act(async () => sendBtn.click())
  await flush()
}

const editTurn: Turn = (cb) => {
  cb.onToolCall({ id: 't1', name: 'edit_text', input: { to: 'changed by AI' } })
  cb.onDone()
}
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)

describe('PDF AI rollback', () => {
  it('a run that edited offers one rollback, which restores the state before its first edit', async () => {
    turns.push(editTurn)
    await mount()
    await send('fix the typo')
    expect(doc.text).toBe('changed by AI')
    const roll = button('Roll back')
    expect(roll).toBeDefined()
    await act(async () => roll!.click())
    expect(rollback.restore).toHaveBeenCalledWith({ text: 'original' })
    expect(doc.text).toBe('original')
    // spent: the point now describes a discarded future
    expect(button('Roll back')).toBeUndefined()
  })

  it('a run that only read offers no rollback', async () => {
    await mount()
    await send('what is on page 2?')
    expect(button('Roll back')).toBeUndefined()
  })
})

describe('PDF AI failures', () => {
  it('offers sign-in only for an authentication failure, and marks the message undelivered', async () => {
    turns.push((cb) => cb.onError('Your Redrob session expired.', 'auth'))
    await mount()
    await send('summarize')
    expect(host.textContent).toContain('Your Redrob session expired.')
    expect(host.textContent).toContain('Not sent')
    const signIn = button('Sign in to Redrob')!
    await act(async () => signIn.click())
    expect(pdfApi.aiSignIn).toHaveBeenCalled()
  })

  it('any other failure shows its own message and no sign-in', async () => {
    turns.push((cb) => cb.onError('The request timed out.', 'timeout'))
    await mount()
    await send('summarize')
    expect(host.textContent).toContain('The request timed out.')
    expect(button('Sign in to Redrob')).toBeUndefined()
  })
})

describe('PDF AI attachments', () => {
  it('attached files are listed to the model and read through read_attachment', async () => {
    await mount()
    const attach = host.querySelector<HTMLButtonElement>('button[aria-label^="Attach local files"]')!
    await act(async () => attach.click())
    await flush()
    expect(host.textContent).toContain('brief.txt')
    await send('use the brief')
    const last = requests.at(-1)!
    const userText = JSON.stringify(last.messages)
    expect(userText).toContain('brief.txt')
    expect(last.tools.map((t) => t.name)).toContain('read_attachment')
  })

  it('the files skill pages through text and leaves images to the message', async () => {
    const read = vi.fn(async () => ({ ok: true, text: 'abc', offset: 0, totalChars: 3 }))
    const skill = createFilesSkill(() => [
      { path: '/a.txt', name: 'a.txt', ext: 'txt', sizeBytes: 3 },
      { path: '/b.png', name: 'b.png', ext: 'png', sizeBytes: 9 },
    ], read)
    const text = await skill.executeTool({ id: '1', name: 'read_attachment', input: { index: 0 } })
    expect(text.output).toContain('total characters 3')
    expect(text.output).toContain('(end of file)')
    const image = await skill.executeTool({ id: '2', name: 'read_attachment', input: { index: 1 } })
    expect(image.output).toContain('already sent as an image')
    expect(read).toHaveBeenCalledTimes(1)
    expect((await skill.executeTool({ id: '3', name: 'read_attachment', input: { index: 7 } })).isError).toBe(true)
  })
})

describe('PDF edit queue', () => {
  it('keeps page and quote, caps the queue, and asks the model to verify each quote', () => {
    expect(makeQueueItem(0, 'x', 'y')).toBeNull()
    expect(makeQueueItem(2, '   ', 'y')).toBeNull()
    const a = makeQueueItem(3, ' Net   revenue grew ', 'say by how much')!
    const b = makeQueueItem(1, 'Introduction', 'make it bold')!
    expect(a.excerpt).toBe('Net revenue grew')
    let q = [a, b]
    for (let i = 0; i < EDIT_QUEUE_MAX + 2; i++) q = addToQueue(q, makeQueueItem(5, `p${i}`, 'x')!)
    expect(q).toHaveLength(EDIT_QUEUE_MAX)
    const instruction = buildQueueInstruction([a, b])
    expect(instruction.indexOf('Page 1')).toBeLessThan(instruction.indexOf('Page 3'))
    expect(instruction).toContain('"Net revenue grew"')
    expect(instruction).toMatch(/first confirm the quoted target text/)
    expect(instruction).toMatch(/never change a different passage/)
  })

  it('the panel sends the queue as one run and consumes the items', async () => {
    const item = makeQueueItem(2, 'Total: 40', 'correct the total to 42')!
    const onQueueConsume = vi.fn()
    await mount({ editQueue: [item], onQueueConsume })
    expect(host.textContent).toContain('Queued requests')
    await act(async () => button('Send 1')!.click())
    await flush()
    expect(onQueueConsume).toHaveBeenCalledWith([item.qid])
    expect(JSON.stringify(requests[0]!.messages)).toContain('correct the total to 42')
  })
})
