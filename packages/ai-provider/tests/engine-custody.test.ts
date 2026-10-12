// Contract: with the engine holding the Redrob key, Office sends no key at all. A turn goes to the
// engine's /v1/chat/completions with the engine's Basic credentials, a key that arrives is handed to
// the engine, and "connected" is the engine's answer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  REDROB_ENGINE_ID,
  chatForProvider,
  redrobConnected,
  setEngineCustody,
  storeRedrobKey,
  streamForProvider,
} from '../src/index'
import type { AiProviderConfig, EngineTarget } from '../src/index'

const ENGINE: EngineTarget = { baseUrl: 'http://127.0.0.1:41234', username: 'redrob', password: 'spawn-secret' }
const BASIC = `Basic ${Buffer.from('redrob:spawn-secret').toString('base64')}`
/** What an old settings file still carries. It must not be sent anywhere once the engine holds keys. */
const STALE: AiProviderConfig = { apiKey: 'rk-stale-key', model: '' }
/** What the main process hands a renderer once the engine holds keys. */
const NONE: AiProviderConfig = { apiKey: '', model: '' }

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  setEngineCustody({ target: async () => ENGINE })
})

afterEach(() => {
  setEngineCustody(null)
  vi.unstubAllGlobals()
})

const headersOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>

describe('turns go through the engine', () => {
  it('streams from the engine with its credentials and the session id, and sends no key', async () => {
    fetchMock.mockResolvedValue(
      new Response('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    const deltas: string[] = []
    await streamForProvider(REDROB_ENGINE_ID, STALE, 'sys', [{ role: 'user', text: 'hello' }], [], 100, { signal: new AbortController().signal, onDelta: (t) => void deltas.push(t), onToolCall: () => {} }, 'of_0123abcd')
    expect(deltas).toEqual(['hi'])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:41234/v1/chat/completions')
    expect(headersOf(fetchMock.mock.calls[0]!)).toEqual({ 'Content-Type': 'application/json', Authorization: BASIC, 'x-redrob-session': 'of_0123abcd' })
    expect(JSON.parse(String((init as RequestInit).body)).model).toBe('redrob/auto')
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('rk-stale-key')
  })

  it('drops a session id that is not an id, and the one-shot chat takes the same route', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })))
    const result = await chatForProvider(REDROB_ENGINE_ID, NONE, 'sys', 'hello', undefined, 'Refund Kim 4,500,000')
    expect(result).toEqual({ ok: true, content: 'ok' })
    expect(fetchMock.mock.calls[0]![0]).toBe('http://127.0.0.1:41234/v1/chat/completions')
    expect(headersOf(fetchMock.mock.calls[0]!)['x-redrob-session']).toBeUndefined()
  })

  it("an engine that will not start fails the turn visibly, and the stale key is not used instead", async () => {
    setEngineCustody({ target: async () => Promise.reject(new Error('engine binary is missing')) })
    await expect(
      streamForProvider(REDROB_ENGINE_ID, STALE, 'sys', [{ role: 'user', text: 'hello' }], [], 100, { signal: new AbortController().signal, onDelta: () => {}, onToolCall: () => {} }),
    ).rejects.toThrow('engine binary is missing')
    const chat = await chatForProvider(REDROB_ENGINE_ID, NONE, 'sys', 'hello')
    expect(chat.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("the engine's 401 is an auth failure, the only one that offers sign-in", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'no key', type: 'authentication_error', code: 'engine_not_authenticated' } }), { status: 401 }),
    )
    await expect(
      streamForProvider(REDROB_ENGINE_ID, STALE, 'sys', [{ role: 'user', text: 'hello' }], [], 100, { signal: new AbortController().signal, onDelta: () => {}, onToolCall: () => {} }),
    ).rejects.toMatchObject({ name: 'AiAuthError' })
  })
})

it('a key typed into Settings is tested as typed, before it is saved', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })))
  await chatForProvider(REDROB_ENGINE_ID, { apiKey: 'rrk_draft', model: '' }, 'sys', 'ping')
  expect(fetchMock.mock.calls[0]![0]).toBe('https://console.redrob.ai/api/backend/v1/chat/completions')
  expect(headersOf(fetchMock.mock.calls[0]!).Authorization).toBe('Bearer rrk_draft')
})

describe('the key goes to the engine', () => {
  it('stores a key with the engine, never anywhere else', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await storeRedrobKey('  rrk_new_key  ')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:41234/api/integration/redrob/connect/key')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ key: 'rrk_new_key', label: 'Redrob Office' })
    expect(headersOf(fetchMock.mock.calls[0]!).authorization).toBe(BASIC)
  })

  it("connected is the engine's answer, and false when it cannot be asked", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'redrob', name: 'Redrob', methods: [], connections: [{ id: 'cred_1' }] }] })),
    )
    expect(await redrobConnected()).toBe(true)
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'redrob', methods: [], connections: [] }] })))
    expect(await redrobConnected()).toBe(false)
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    expect(await redrobConnected()).toBe(false)
  })

  it('without custody there is nowhere to put a key, so storing one throws', async () => {
    setEngineCustody(null)
    await expect(storeRedrobKey('rrk_x')).rejects.toThrow('no engine holds keys')
  })
})
