// Contract: only an authentication failure is reported as errorCode 'auth', and
// that code is what the editors gate the inline "Sign in to Redrob" button on.
//
// The button used to be decided by aiGskStatus(), which knows only the OAuth
// session. An API-key workspace is permanently `loggedIn: false` there, so every
// failure -- a 60s network timeout, exhausted credits, a tool loop -- grew a
// sign-in button that fixed nothing and hid the real cause. A user hit exactly
// that: a timeout, reported as "log in".
//
// So the classification, not the button, is the thing worth locking: a timeout
// and a server error must NOT classify as auth, and a 401/403 must.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiAuthError, AiTimeoutError, isAiAuthError, redrobEngineStream } from '../src/index'
import type { StreamCallbacks } from '../src/index'

describe('isAiAuthError', () => {
  it('is true for rejected credentials', () => {
    expect(isAiAuthError(new AiAuthError('HTTP 401 invalid_api_key', 401))).toBe(true)
    expect(isAiAuthError(new AiAuthError('HTTP 403 forbidden', 403))).toBe(true)
  })

  it('is true for a turn that never left because there is no key', () => {
    expect(isAiAuthError(new AiAuthError('no Redrob Console key'))).toBe(true)
  })

  it('is false for the failures a sign-in button cannot fix', () => {
    // The exact case the user reported: a 60s timeout that said "log in".
    expect(isAiAuthError(new AiTimeoutError(60_000))).toBe(false)
    expect(isAiAuthError(new Error('Redrob engine request failed: HTTP 500'))).toBe(false)
    expect(isAiAuthError(new Error('Redrob engine request failed: HTTP 429'))).toBe(false)
    expect(isAiAuthError(new Error('fetch failed'))).toBe(false)
    expect(isAiAuthError(undefined)).toBe(false)
  })

  it('sees through a wrapped cause', () => {
    const wrapped = new Error('turn failed', { cause: new AiAuthError('HTTP 401', 401) })
    expect(isAiAuthError(wrapped)).toBe(true)
  })

  it('does not classify by message text, which is localized', () => {
    // 19 locales translate this string; it is not a contract.
    expect(isAiAuthError(new Error('Redrob 로그인이 필요합니다'))).toBe(false)
  })
})

// The classifier above is only useful if the engine actually raises it, so drive
// the real entry point: these are what fail if the throw site regresses.
describe('redrobEngineStream auth classification', () => {
  const AUTH = { apiKey: 'rk-test-key' }
  const CB: StreamCallbacks = {
    onDelta: () => {},
    onToolCall: () => {},
    signal: new AbortController().signal,
  }
  const MESSAGES = [{ role: 'user' as const, text: 'hi' }]

  function run(): Promise<void> {
    return redrobEngineStream(AUTH, 'system', MESSAGES, [], 256, CB)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function respondWith(status: number, body: string): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, { status, headers: { 'content-type': 'application/json' } }),
      ),
    )
  }

  it('classifies a 401 from the console as auth', async () => {
    respondWith(401, '{"error":{"code":"invalid_api_key"}}')
    await expect(run()).rejects.toSatisfy(isAiAuthError)
  })

  it('classifies a 403 from the console as auth', async () => {
    respondWith(403, '{"error":{"code":"forbidden"}}')
    await expect(run()).rejects.toSatisfy(isAiAuthError)
  })

  it('does NOT classify a 500 as auth', async () => {
    respondWith(500, 'upstream exploded')
    await expect(run()).rejects.toSatisfy((e: unknown) => !isAiAuthError(e))
  })

  it('does NOT classify a 429 as auth', async () => {
    respondWith(429, 'slow down')
    await expect(run()).rejects.toSatisfy((e: unknown) => !isAiAuthError(e))
  })

  it('classifies a missing key as auth without making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      redrobEngineStream({ apiKey: '  ' }, 'system', MESSAGES, [], 256, CB),
    ).rejects.toSatisfy(isAiAuthError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
