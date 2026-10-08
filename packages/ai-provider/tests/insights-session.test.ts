// The insights session travels as x-redrob-session, so the console can join a labeled session to its
// own record of the request's cost and model. It is the only thing about the session a request carries.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REDROB_ENGINE_ID, streamForProvider } from '../src/index'

const KEY = { apiKey: 'rk-test-key', model: '' }
const sse = () =>
  new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async () => sse())
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const headersOf = () =>
  (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>
const cb = () => ({ signal: new AbortController().signal, onDelta: () => {}, onToolCall: () => {} })
const hi = [{ role: 'user' as const, text: 'hi' }]

describe('x-redrob-session', () => {
  it('is sent with the session id', async () => {
    await streamForProvider(REDROB_ENGINE_ID, KEY, 's', hi, [], 64, cb(), 'of_0123abcd')
    expect(headersOf()['x-redrob-session']).toBe('of_0123abcd')
  })

  it('is left out without one', async () => {
    await streamForProvider(REDROB_ENGINE_ID, KEY, 's', hi, [], 64, cb())
    expect(headersOf()['x-redrob-session']).toBeUndefined()
  })

  it('is left out when the id is not one the console accepts', async () => {
    await streamForProvider(REDROB_ENGINE_ID, KEY, 's', hi, [], 64, cb(), 'has spaces\n')
    expect(headersOf()['x-redrob-session']).toBeUndefined()
  })
})
