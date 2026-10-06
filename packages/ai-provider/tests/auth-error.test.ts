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
import { describe, expect, it } from 'vitest'
import { engineErrorOf } from '../src/engine-turn'
import { AiAuthError, AiTimeoutError, isAiAuthError } from '../src/index'

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

// The classifier above is only useful if the engine bridge actually raises it, so drive
// the mapping from the engine's message error: these fail if the throw site regresses.
describe('engine message errors', () => {
  it('classifies a provider sign-in failure as auth', () => {
    expect(isAiAuthError(engineErrorOf({ name: 'ProviderAuthError', data: { message: 'bad key' } }))).toBe(true)
  })

  it('classifies a 401 or 403 from the provider as auth', () => {
    expect(isAiAuthError(engineErrorOf({ name: 'APIError', data: { message: 'no', statusCode: 401 } }))).toBe(true)
    expect(isAiAuthError(engineErrorOf({ name: 'APIError', data: { message: 'no', statusCode: 403 } }))).toBe(true)
  })

  it('does NOT classify a 500 or 429 as auth', () => {
    expect(isAiAuthError(engineErrorOf({ name: 'APIError', data: { message: 'boom', statusCode: 500 } }))).toBe(false)
    expect(isAiAuthError(engineErrorOf({ name: 'APIError', data: { message: 'slow', statusCode: 429 } }))).toBe(false)
  })

  it('treats an aborted message as no error', () => {
    expect(engineErrorOf({ name: 'MessageAbortedError', data: {} })).toBeNull()
    expect(engineErrorOf(undefined)).toBeNull()
  })
})
