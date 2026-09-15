/**
 * Connect Redrob: the device-authorization flow that gets a workspace key into this
 * app without anyone copying one by hand.
 *
 * The shape is RFC 8628. The app asks Console for a device code, shows the human a
 * short user code, and polls until the person approves it in Console. Console then
 * returns a workspace key exactly once, which is why the caller must persist what it
 * receives on the first successful poll: ask twice and the second answer is a
 * refusal, not the key again.
 *
 * Everything here is transport and state machine only. It never touches a settings
 * file, a keychain, or Electron: the host decides where the key lands, and the host
 * is also the only layer allowed to see it. Time and fetch are injected so the tests
 * can drive expiry, back-off and refusal without waiting or reaching the network.
 */
import { REDROB_CONSOLE_API_BASE } from './redrob-engine'

/** Console's product allowlist rejects anything else at the door. */
export type DeviceProduct = 'browser' | 'code' | 'cowork' | 'design' | 'extension' | 'office' | 'work'

export type DeviceAuthorization = {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  /** seconds */
  expiresIn: number
  /** seconds between polls, as Console asks for them */
  interval: number
}

export type DeviceKey = {
  apiKey: string
  apiKeyId?: string
  apiKeyName?: string
  accountId?: string
  accountName?: string
  product?: string
  apiBaseUrl?: string
}

/**
 * Why a connect attempt ended. `pending` and `slowDown` never surface: they are the
 * loop's own business. Everything here is terminal, and every terminal state says
 * enough for the UI to explain itself without a second lookup.
 */
export type DeviceConnectOutcome =
  | { status: 'connected'; key: DeviceKey }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'cancelled' }
  | { status: 'unreachable'; attempts: number }
  | { status: 'failed'; code: string }

type PollAnswer =
  | { kind: 'key'; key: DeviceKey }
  | { kind: 'pending' }
  | { kind: 'slow-down' }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'unreachable' }
  | { kind: 'failed'; code: string }

/** Console's own floor and ceiling, mirrored so a malformed answer cannot stall a loop. */
const MIN_INTERVAL_MS = 1_000
const MAX_INTERVAL_MS = 30_000
const DEFAULT_INTERVAL_MS = 5_000
const DEFAULT_EXPIRY_MS = 10 * 60_000
const MAX_EXPIRY_MS = 30 * 60_000
/** Consecutive network failures tolerated before the attempt is called off. */
const MAX_UNREACHABLE = 5

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export type DeviceConnectDeps = {
  fetch: FetchLike
  /** Wall clock in milliseconds; injected so expiry is testable without waiting. */
  now: () => number
  /** Resolve after the given delay. */
  sleep: (ms: number) => Promise<void>
}

function apiUrl(path: string): string {
  return `${REDROB_CONSOLE_API_BASE.replace(/\/+$/, '')}${path}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Ask Console for a device code. The product id is the only input, and Console owns
 * the display name shown on its confirm screen, so a client cannot claim to be
 * another product.
 */
export async function startDeviceAuthorization(
  product: DeviceProduct,
  deps: Pick<DeviceConnectDeps, 'fetch'>,
): Promise<DeviceAuthorization> {
  const response = await deps.fetch(apiUrl('/device/authorize'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product }),
  })
  if (!response.ok) {
    throw new Error(`Console refused the connect request (HTTP ${response.status}).`)
  }
  const raw = (await response.json()) as Record<string, unknown>
  const deviceCode = asString(raw.deviceCode)
  const userCode = asString(raw.userCode)
  if (!deviceCode || !userCode) {
    throw new Error('Console returned an incomplete device authorization.')
  }
  const expiresIn = typeof raw.expiresIn === 'number' ? raw.expiresIn : DEFAULT_EXPIRY_MS / 1000
  const interval = typeof raw.interval === 'number' ? raw.interval : DEFAULT_INTERVAL_MS / 1000
  const verificationUri = asString(raw.verificationUri) || 'https://console.redrob.ai/connect'
  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete: asString(raw.verificationUriComplete) || verificationUri,
    expiresIn,
    interval,
  }
}

/**
 * One poll. A refusal is data rather than an exception, because the loop reacts to
 * each refusal differently and a thrown error would flatten them into one.
 */
export async function pollDeviceToken(
  deviceCode: string,
  deps: Pick<DeviceConnectDeps, 'fetch'>,
): Promise<PollAnswer> {
  let response: Response
  try {
    response = await deps.fetch(apiUrl('/device/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    })
  } catch {
    return { kind: 'unreachable' }
  }

  if (response.ok) {
    const raw = (await response.json()) as Record<string, unknown>
    const apiKey = asString(raw.apiKey)
    if (!apiKey) return { kind: 'failed', code: 'missing_key' }
    return {
      kind: 'key',
      key: {
        apiKey,
        apiKeyId: asString(raw.apiKeyId) || undefined,
        apiKeyName: asString(raw.apiKeyName) || undefined,
        accountId: asString(raw.accountId) || undefined,
        accountName: asString(raw.accountName) || undefined,
        product: asString(raw.product) || undefined,
        apiBaseUrl: asString(raw.apiBaseUrl) || undefined,
      },
    }
  }

  let code = ''
  try {
    const raw = (await response.json()) as Record<string, unknown>
    code = asString(raw.error)
  } catch {
    code = ''
  }

  if (response.status === 403 || code === 'access_denied') return { kind: 'denied' }
  if (code === 'authorization_pending') return { kind: 'pending' }
  if (code === 'slow_down') return { kind: 'slow-down' }
  if (code === 'expired_token') return { kind: 'expired' }
  if (code) return { kind: 'failed', code }
  // A 5xx is the server having a bad minute rather than a verdict on this attempt.
  if (response.status >= 500) return { kind: 'unreachable' }
  return { kind: 'failed', code: `http_${response.status}` }
}

export type DeviceConnectRun = {
  authorization: DeviceAuthorization
  deps: DeviceConnectDeps
  /** Polled between waits; the host sets it when the human closes the dialog. */
  isCancelled?: () => boolean
}

/**
 * Poll until Console answers with a key or a refusal.
 *
 * Two details are deliberate. The loop waits one interval BEFORE its first poll,
 * because nobody can have approved a code that was displayed a millisecond ago and
 * an immediate poll only earns a `slow_down` on the next one. And `slow_down`
 * doubles the interval up to a cap rather than adding a constant, so a busy Console
 * sheds load quickly instead of being retried at almost the same rate.
 */
export async function runDeviceConnect(run: DeviceConnectRun): Promise<DeviceConnectOutcome> {
  const { authorization, deps } = run
  const isCancelled = run.isCancelled ?? (() => false)

  let intervalMs = clamp(authorization.interval * 1000, MIN_INTERVAL_MS, MAX_INTERVAL_MS)
  const deadline =
    deps.now() + clamp(authorization.expiresIn * 1000, MIN_INTERVAL_MS, MAX_EXPIRY_MS)
  let unreachable = 0

  while (true) {
    if (isCancelled()) return { status: 'cancelled' }
    await deps.sleep(intervalMs)
    if (isCancelled()) return { status: 'cancelled' }
    if (deps.now() >= deadline) return { status: 'expired' }

    const answer = await pollDeviceToken(authorization.deviceCode, deps)
    switch (answer.kind) {
      case 'key':
        return { status: 'connected', key: answer.key }
      case 'denied':
        return { status: 'denied' }
      case 'expired':
        return { status: 'expired' }
      case 'failed':
        return { status: 'failed', code: answer.code }
      case 'slow-down':
        unreachable = 0
        intervalMs = clamp(intervalMs * 2, MIN_INTERVAL_MS, MAX_INTERVAL_MS)
        break
      case 'unreachable':
        unreachable += 1
        if (unreachable >= MAX_UNREACHABLE) return { status: 'unreachable', attempts: unreachable }
        break
      case 'pending':
        unreachable = 0
        break
    }
  }
}

/** `ABCD-EFGH`, the grouping Console prints and its confirm page expects. */
export function formatUserCode(userCode: string): string {
  const cleaned = userCode.replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, 8)
  return cleaned.length > 4 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}` : cleaned
}
