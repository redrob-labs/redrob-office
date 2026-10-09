/**
 * Work labels in the shell: what an editor's facts become, what is kept, and what goes to the engine.
 *
 * The rule being pinned throughout: the only text that arrives is a session's first instruction, it is
 * labeled and dropped, and nothing that leaves (the outbox, the batch to the engine) contains it.
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/userData', isPackaged: false },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  utilityProcess: { fork: vi.fn() },
}))

const { SessionRecorder, externalIdOf } = await import('@redrob-labs/work-labeller')
const { handleInsightsMessage, OFFICE_LABELING, toStatus } = await import('../src/main/insights/index')
const { FileOutbox, OUTBOX_LIMIT } = await import('../src/main/insights/outbox')
const { syncToEngine } = await import('../src/main/insights/sync')
const { createLabeler } = await import('../src/main/insights/worker')
const { officeSessionId } = await import('@genoffice/ai-provider')

const SECRET = 'Refund 4,500,000 KRW to 김지원'
const ENGINE = { baseUrl: 'http://127.0.0.1:41234', username: 'redrob', password: 'spawn' }
const tmp = () => join(mkdtempSync(join(tmpdir(), 'insights-')), 'outbox.json')

function facts(sessionID: string) {
  return [
    { kind: 'user-turn', sessionID, messageID: 'm1', at: 0, attachedSource: false },
    { kind: 'busy', sessionID, at: 0, busy: true },
    { kind: 'tool', sessionID, callID: 'c1', at: 1, status: 'running', effect: 'other' },
    { kind: 'tool', sessionID, callID: 'c1', at: 2, status: 'completed', effect: 'artifact' },
    { kind: 'assistant-done', sessionID, messageID: 'a1', at: 3 },
    { kind: 'busy', sessionID, at: 3, busy: false },
    { kind: 'idle', sessionID, at: 3 },
  ]
}

describe('from an editor to a labeled session', () => {
  it('labels the session from its facts and first instruction, and keeps no text', async () => {
    const outbox = new FileOutbox(tmp())
    const recorder = new SessionRecorder(OFFICE_LABELING, (s) => outbox.add(s), 1000)
    const labels: string[] = []
    const afterRun = vi.fn()
    const deps = {
      recorder,
      afterRun,
      label: async (text: string) => {
        labels.push(text)
        return { action: 'reply', family: 'write' as const, confidence: 0.9 }
      },
    }
    await handleInsightsMessage({ type: 'facts', facts: facts('key-1') }, deps)
    await handleInsightsMessage({ type: 'first-message', sessionID: 'key-1', messageID: 'm1', text: SECRET }, deps)
    expect(labels).toEqual([SECRET])
    expect(afterRun).toHaveBeenCalledTimes(1)
    await recorder.sweep(10_000)
    const [entry] = await outbox.list()
    expect(entry?.session).toMatchObject({ toolKey: 'office', labelerId: 'office', mode: 2, producedOutput: true, actionKey: 'reply', familyKey: 'write' })
    expect(JSON.stringify(await outbox.list())).not.toContain('김지원')
  })

  it("the session's external id is the one its model requests carry", async () => {
    expect(externalIdOf(OFFICE_LABELING, 'key-1')).toBe(await officeSessionId('key-1'))
  })

  it('drops anything that is not a fact, and a first message without its ids', async () => {
    const observe = vi.fn()
    const observeFirstMessage = vi.fn(async () => false)
    const deps = { recorder: { observe, observeFirstMessage }, afterRun: vi.fn(), label: async () => null }
    await handleInsightsMessage({ type: 'facts', facts: [{ kind: 'user-turn', text: SECRET }, 'x', null] }, deps)
    await handleInsightsMessage({ type: 'first-message', text: SECRET }, deps)
    await handleInsightsMessage('nonsense', deps)
    expect(observe).not.toHaveBeenCalled()
    expect(observeFirstMessage).not.toHaveBeenCalled()
  })
})

describe('the outbox', () => {
  it('replaces a resent session and keeps only the newest past its limit', async () => {
    const path = tmp()
    const LIMIT = 5
    const outbox = new FileOutbox(path, LIMIT)
    const session = (n: number) =>
      ({ externalId: `of_${n}`, startedAt: '2026-10-09T00:00:00Z', toolKey: 'office' }) as Parameters<typeof outbox.add>[0]
    for (let n = 0; n < LIMIT + 3; n += 1) await outbox.add(session(n), n)
    await outbox.add(session(LIMIT + 2), 99_999)
    const entries = await outbox.list()
    expect(entries).toHaveLength(LIMIT)
    expect(entries[0]?.session.externalId).toBe('of_3')
    expect(entries.filter((e) => e.session.externalId === `of_${LIMIT + 2}`)).toHaveLength(1)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toHaveLength(LIMIT)
    expect(OUTBOX_LIMIT).toBe(2000)
  })
})

describe('sending through the engine', () => {
  const queued = (ids: string[]) => {
    let entries = ids.map((id) => ({ session: { externalId: id } as never, queuedAt: 0 }))
    return {
      list: async () => entries,
      remove: async (gone: readonly string[]) => {
        entries = entries.filter((e) => !gone.includes((e.session as { externalId: string }).externalId))
      },
      left: () => entries.map((e) => (e.session as { externalId: string }).externalId),
    }
  }

  it("posts to the engine's insights route with its credentials, never a console key, and clears what was answered", async () => {
    const outbox = queued(['of_1', 'of_2'])
    const fetchMock = vi.fn(async () => Response.json({ accepted: 2, updated: 0, rejected: [] }))
    expect(await syncToEngine(outbox, async () => ENGINE, fetchMock)).toEqual({ status: 'sent', accepted: 2, updated: 0, rejected: 0 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:41234/api/insights/sessions')
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('redrob:spawn').toString('base64')}`)
    expect(JSON.parse(String(init.body))).toEqual({ sessions: [{ externalId: 'of_1' }, { externalId: 'of_2' }] })
    expect(outbox.left()).toEqual([])
  })

  it('keeps the queue when the engine holds no key, cannot start, or is unreachable', async () => {
    const outbox = queued(['of_1'])
    expect(await syncToEngine(outbox, async () => ENGINE, async () => new Response('{}', { status: 404 }))).toEqual({ status: 'not-connected' })
    expect(await syncToEngine(outbox, async () => Promise.reject(new Error('no binary')), vi.fn())).toEqual({ status: 'unreachable' })
    expect(await syncToEngine(outbox, async () => ENGINE, async () => Promise.reject(new Error('ECONNREFUSED')))).toEqual({ status: 'unreachable' })
    expect(outbox.left()).toEqual(['of_1'])
  })
})

describe('the classifier process and Settings', () => {
  it('loads one classifier per model folder and answers null when it fails', async () => {
    const made: string[] = []
    const label = createLabeler((directory) => {
      made.push(directory)
      return { label: async (text: string) => (text === 'boom' ? Promise.reject(new Error('x')) : { action: 'fix', family: 'code', confidence: 0.9 }) }
    })
    expect(await label({ id: 1, directory: '/m/rev', text: 'fix it' })).toEqual({ id: 1, label: { action: 'fix', family: 'code', confidence: 0.9 } })
    expect(await label({ id: 2, directory: '/m/rev', text: 'boom' })).toEqual({ id: 2, label: null })
    expect(made).toEqual(['/m/rev'])
  })

  it('Settings sees the download state, not the folder', () => {
    expect(toStatus({ state: 'downloading', received: 50, total: 200 })).toEqual({ state: 'downloading', percent: 25 })
    expect(toStatus({ state: 'downloading', received: 50, total: null })).toEqual({ state: 'downloading', percent: null })
    expect(toStatus({ state: 'ready', directory: '/secret/path' })).toEqual({ state: 'ready' })
    expect(toStatus({ state: 'failed', reason: 'answered 404', retryAt: 1 })).toEqual({ state: 'failed', reason: 'answered 404' })
  })
})
