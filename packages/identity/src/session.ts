/**
 * A signed-in session: who it is and the token that proves it to the sync
 * service. The token stays in the main process; renderers only ever see
 * `publicIdentity`.
 */

export type ProviderKind = 'console' | 'dev'

export interface Session {
  provider: ProviderKind
  /** the account id the token names (its `sub`) */
  sub: string
  name: string
  email?: string
  /** bearer token for the sync service */
  token: string
  /** ms since epoch; the session is treated as signed out after it */
  expiresAt: number
  /** for console sessions: renews the token without signing in again */
  refreshToken?: string
}

/** What a renderer may know: never a token. */
export interface PublicIdentity {
  signedIn: boolean
  provider?: ProviderKind
  name?: string
  email?: string
}

export function publicIdentity(s: Session | null, now = Date.now()): PublicIdentity {
  if (!s || s.expiresAt <= now) return { signedIn: false }
  return { signedIn: true, provider: s.provider, name: s.name, ...(s.email ? { email: s.email } : {}) }
}

/** The claims of a JWT, read without verifying it (the service verifies; this only labels the session). */
export function jwtClaims(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
    const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0))
    const v = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** A session from a token and the claims in it; null when the token names no account. */
export function sessionFromToken(
  provider: ProviderKind,
  token: string,
  opts: { refreshToken?: string | undefined; expiresIn?: number | undefined; now?: number } = {},
): Session | null {
  const c = jwtClaims(token)
  const sub = c?.sub
  if (typeof sub !== 'string' || !sub) return null
  const now = opts.now ?? Date.now()
  const exp = typeof c?.exp === 'number' ? c.exp * 1000 : opts.expiresIn ? now + opts.expiresIn * 1000 : now + 3600_000
  const name = typeof c?.name === 'string' && c.name ? c.name : sub
  return {
    provider,
    sub,
    name,
    ...(typeof c?.email === 'string' ? { email: c.email } : {}),
    token,
    expiresAt: exp,
    ...(opts.refreshToken ? { refreshToken: opts.refreshToken } : {}),
  }
}

export function normalizeSession(raw: unknown): Session | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.provider !== 'console' && r.provider !== 'dev') return null
  if (typeof r.sub !== 'string' || !r.sub || typeof r.token !== 'string' || !r.token) return null
  if (typeof r.expiresAt !== 'number' || !Number.isFinite(r.expiresAt)) return null
  return {
    provider: r.provider,
    sub: r.sub,
    name: typeof r.name === 'string' && r.name ? r.name : r.sub,
    ...(typeof r.email === 'string' ? { email: r.email } : {}),
    token: r.token,
    expiresAt: r.expiresAt,
    ...(typeof r.refreshToken === 'string' && r.refreshToken ? { refreshToken: r.refreshToken } : {}),
  }
}
