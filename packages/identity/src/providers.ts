/**
 * Identity providers. Redrob Console is the real one: an OAuth 2.0 device
 * authorization grant (RFC 8628) whose endpoints come from Console's OpenID
 * discovery document. The development issuer is the local sync stack's
 * (services/sync with SYNC_DEV_ISSUER=1), for working on sync before Console
 * issues identity tokens; it is only offered when the configured sync service
 * is on this computer.
 */
import { jwtClaims, sessionFromToken, type Session } from './session'

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export interface DeviceStart {
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
  /** opaque to the renderer: kept in the main process */
  deviceCode: string
  interval: number
}

export type SignInOutcome =
  | { status: 'signed-in'; session: Session }
  | { status: 'denied' | 'expired' | 'cancelled' | 'unreachable' }
  | { status: 'failed'; code: string }

export interface IdentityProvider {
  readonly kind: Session['provider']
  /** Starts a sign-in. A provider that needs no browser step resolves `signIn` straight away. */
  start(): Promise<DeviceStart | null>
  finish(start: DeviceStart | null, isCancelled: () => boolean): Promise<SignInOutcome>
  /** A fresh session for one about to expire, or null when it cannot be renewed. */
  refresh(session: Session): Promise<Session | null>
}

/** True for a URL on this computer: the development issuer is never used anywhere else. */
export function isLoopbackUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)
  } catch {
    return false
  }
}

export function devIssuerProvider(opts: { syncUrl: string; who: () => { sub: string; name: string; email?: string }; fetch: Fetch }): IdentityProvider {
  if (!isLoopbackUrl(opts.syncUrl)) throw new Error('The development issuer is only used for a sync service on this computer.')
  const base = opts.syncUrl.replace(/\/+$/, '')
  const mint = async (): Promise<SignInOutcome> => {
    let r: Response
    try {
      r = await opts.fetch(`${base}/dev/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(opts.who()),
      })
    } catch {
      return { status: 'unreachable' }
    }
    if (!r.ok) return { status: 'failed', code: `http_${r.status}` }
    const body = (await r.json().catch(() => null)) as { token?: unknown } | null
    const session = typeof body?.token === 'string' ? sessionFromToken('dev', body.token) : null
    return session ? { status: 'signed-in', session } : { status: 'failed', code: 'bad_token' }
  }
  return {
    kind: 'dev',
    start: async () => null,
    finish: async (_s, isCancelled) => (isCancelled() ? { status: 'cancelled' } : mint()),
    refresh: async () => {
      const o = await mint()
      return o.status === 'signed-in' ? o.session : null
    },
  }
}

interface Discovery {
  device_authorization_endpoint: string
  token_endpoint: string
}

export interface ConsoleOptions {
  /** Console's issuer, e.g. https://console.redrob.ai */
  issuer: string
  clientId: string
  audience: string
  fetch: Fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString()

export function consoleProvider(opts: ConsoleOptions): IdentityProvider {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const now = opts.now ?? Date.now
  let discovery: Discovery | null = null

  const discover = async (): Promise<Discovery> => {
    if (discovery) return discovery
    const r = await opts.fetch(`${opts.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`)
    if (!r.ok) throw new Error(`discovery_${r.status}`)
    const d = (await r.json()) as Partial<Discovery>
    if (typeof d.device_authorization_endpoint !== 'string' || typeof d.token_endpoint !== 'string') {
      throw new Error('discovery_incomplete')
    }
    // Console names its own endpoints; refuse any that leave Console's origin
    const origin = new URL(opts.issuer).origin
    if (new URL(d.device_authorization_endpoint).origin !== origin || new URL(d.token_endpoint).origin !== origin) {
      throw new Error('discovery_foreign_endpoint')
    }
    discovery = { device_authorization_endpoint: d.device_authorization_endpoint, token_endpoint: d.token_endpoint }
    return discovery
  }

  const tokenRequest = async (fields: Record<string, string>) => {
    const d = await discover()
    const r = await opts.fetch(d.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ client_id: opts.clientId, ...fields }),
    })
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: r.ok, body }
  }

  // The sync service checks `aud` against its audience, so the session keeps the
  // token issued for it: normally the access token (requested with `audience`).
  // An id token is addressed to the client id and is kept only if it names the
  // audience too. A reply with neither is a Console misconfiguration, not a sign-in.
  const forAudience = (t: unknown): t is string => {
    if (typeof t !== 'string') return false
    const aud = jwtClaims(t)?.aud
    return aud === opts.audience || (Array.isArray(aud) && aud.includes(opts.audience))
  }
  const sessionFrom = (body: Record<string, unknown>): Session | null => {
    const token = [body.access_token, body.id_token].find(forAudience) ?? null
    if (!token) return null
    return sessionFromToken('console', token, {
      refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
      expiresIn: typeof body.expires_in === 'number' ? body.expires_in : undefined,
      now: now(),
    })
  }

  return {
    kind: 'console',
    async start() {
      const d = await discover()
      const r = await opts.fetch(d.device_authorization_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form({ client_id: opts.clientId, scope: 'openid profile email offline_access', audience: opts.audience }),
      })
      if (!r.ok) throw new Error(`device_${r.status}`)
      const b = (await r.json()) as Record<string, unknown>
      if (typeof b.device_code !== 'string' || typeof b.user_code !== 'string' || typeof b.verification_uri !== 'string') {
        throw new Error('device_incomplete')
      }
      return {
        deviceCode: b.device_code,
        userCode: b.user_code,
        verificationUri: b.verification_uri,
        verificationUriComplete: typeof b.verification_uri_complete === 'string' ? b.verification_uri_complete : b.verification_uri,
        expiresIn: typeof b.expires_in === 'number' ? b.expires_in : 600,
        interval: typeof b.interval === 'number' && b.interval > 0 ? b.interval : 5,
      }
    },
    async finish(start, isCancelled) {
      if (!start) return { status: 'failed', code: 'no_device_code' }
      const deadline = now() + start.expiresIn * 1000
      let interval = start.interval
      while (now() < deadline) {
        await sleep(interval * 1000)
        if (isCancelled()) return { status: 'cancelled' }
        let res: { ok: boolean; body: Record<string, unknown> }
        try {
          res = await tokenRequest({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: start.deviceCode })
        } catch {
          return { status: 'unreachable' }
        }
        if (res.ok) {
          const session = sessionFrom(res.body)
          return session ? { status: 'signed-in', session } : { status: 'failed', code: 'wrong_audience' }
        }
        const err = res.body.error
        if (err === 'authorization_pending') continue
        if (err === 'slow_down') {
          interval += 5
          continue
        }
        if (err === 'access_denied') return { status: 'denied' }
        if (err === 'expired_token') return { status: 'expired' }
        return { status: 'failed', code: typeof err === 'string' ? err : 'token_error' }
      }
      return { status: 'expired' }
    },
    async refresh(session) {
      if (!session.refreshToken) return null
      try {
        const res = await tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refreshToken })
        const next = res.ok ? sessionFrom(res.body) : null
        // a refresh that does not rotate the refresh token keeps the one it used
        return next && !next.refreshToken ? { ...next, refreshToken: session.refreshToken } : next
      } catch {
        return null
      }
    },
  }
}
