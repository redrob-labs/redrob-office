/**
 * Authentication failures, told apart from every other engine failure.
 *
 * This exists because the editors offer an inline "Sign in to Redrob" button on
 * a failed turn, and they used to decide whether to show it by asking
 * `aiGskStatus()` -- which only knows about the OAuth session. A workspace using
 * an API key is permanently `loggedIn: false` there, so EVERY failure (a network
 * timeout, exhausted credits, a tool loop) got a sign-in button that would not
 * have fixed anything, and the real cause was hidden behind it.
 *
 * The honest signal is the response status, so it travels as its own error type
 * and surfaces to the renderer as errorCode 'auth'. Matching the localized error
 * text is deliberately NOT how this is decided: that string is translated into
 * 19 locales and is not a contract.
 */

export class AiAuthError extends Error {
  /** HTTP status when the console answered; absent when no request was made (no key). */
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AiAuthError'
    this.status = status
  }
}

/**
 * True for an authentication failure: 401 / 403 from the console, or a turn that
 * never left because there is no key. Walks `cause` so a wrapped error still
 * classifies.
 */
export function isAiAuthError(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; current && depth < 5; depth++) {
    if (current instanceof AiAuthError) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
