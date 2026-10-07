import { describe, expect, it, vi } from 'vitest'
import {
  SessionStore,
  consoleProvider,
  devIssuerProvider,
  isLoopbackUrl,
  jwtClaims,
  normalizeSession,
  publicIdentity,
  sessionFromToken,
  type SecretCipher,
  type SessionFile,
} from '../src'

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (claims: Record<string, unknown>) => `${b64({ alg: 'ES256' })}.${b64(claims)}.sig`

function memFile(): SessionFile & { data: Uint8Array | null } {
  const f = {
    data: null as Uint8Array | null,
    read: async () => f.data,
    write: async (d: Uint8Array) => {
      f.data = d
    },
    remove: async () => {
      f.data = null
    },
  }
  return f
}

// a stand-in for safeStorage: reversible, and visibly not the plain text
const cipher = (on: boolean): SecretCipher => ({
  available: () => on,
  encrypt: (s) => new TextEncoder().encode([...s].reverse().join('')),
  decrypt: (d) => [...new TextDecoder().decode(d)].reverse().join(''),
})

describe('sessions', () => {
  it('reads who a token names, and never shows the token', () => {
    const token = jwt({ sub: 'felix', name: 'Felix Kim', email: 'felix@redrob.ai', exp: 2_000_000_000 })
    expect(jwtClaims(token)).toMatchObject({ sub: 'felix' })
    const s = sessionFromToken('console', token, { refreshToken: 'r1' })!
    expect(s).toMatchObject({ provider: 'console', sub: 'felix', name: 'Felix Kim', email: 'felix@redrob.ai', expiresAt: 2_000_000_000_000, refreshToken: 'r1' })
    const pub = publicIdentity(s, 1_000)
    expect(pub).toEqual({ signedIn: true, provider: 'console', name: 'Felix Kim', email: 'felix@redrob.ai' })
    expect(JSON.stringify(pub)).not.toContain(token)
    expect(publicIdentity(s, 3_000_000_000_000)).toEqual({ signedIn: false })
    expect(sessionFromToken('dev', jwt({ name: 'nobody' }))).toBeNull()
    expect(normalizeSession({ provider: 'evil', sub: 'x', token: 't', expiresAt: 1 })).toBeNull()
  })
})

describe('SessionStore', () => {
  it('persists only encrypted, and keeps it in memory when the OS cannot encrypt', async () => {
    const s = sessionFromToken('dev', jwt({ sub: 'felix', exp: 2_000_000_000 }))!
    const file = memFile()
    const store = new SessionStore(cipher(true), file)
    await store.set(s)
    expect(new TextDecoder().decode(file.data!)).not.toContain(s.token)
    expect(await new SessionStore(cipher(true), file).get()).toEqual(s)

    const plainFile = memFile()
    const memOnly = new SessionStore(cipher(false), plainFile)
    await memOnly.set(s)
    expect(plainFile.data).toBeNull()
    expect(await memOnly.get()).toEqual(s)
    expect(memOnly.persistent()).toBe(false)
  })

  it('starts signed out when the stored session cannot be read', async () => {
    const file = memFile()
    file.data = new Uint8Array([1, 2, 3])
    expect(await new SessionStore(cipher(true), file).get()).toBeNull()
  })
})

describe('development issuer', () => {
  it('is only for a sync service on this computer', () => {
    expect(isLoopbackUrl('http://127.0.0.1:8787')).toBe(true)
    expect(isLoopbackUrl('http://localhost:8787')).toBe(true)
    expect(isLoopbackUrl('https://sync.redrob.ai')).toBe(false)
    expect(() => devIssuerProvider({ syncUrl: 'https://sync.example', who: () => ({ sub: 'x', name: 'X' }), fetch: vi.fn() })).toThrow()
  })

  it('mints a session from the local stack', async () => {
    const token = jwt({ sub: 'felix', name: 'Felix Kim', exp: 2_000_000_000 })
    const fetch = vi.fn(async () => new Response(JSON.stringify({ token }), { status: 200 }))
    const p = devIssuerProvider({ syncUrl: 'http://127.0.0.1:8787/', who: () => ({ sub: 'felix', name: 'Felix Kim' }), fetch })
    expect(await p.start()).toBeNull()
    const out = await p.finish(null, () => false)
    expect(out).toMatchObject({ status: 'signed-in', session: { provider: 'dev', sub: 'felix' } })
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8787/dev/token', expect.objectContaining({ method: 'POST' }))
    const down = devIssuerProvider({ syncUrl: 'http://127.0.0.1:1', who: () => ({ sub: 'a', name: 'A' }), fetch: async () => Promise.reject(new Error('down')) })
    expect(await down.finish(null, () => false)).toEqual({ status: 'unreachable' })
  })
})

describe('Console device sign-in', () => {
  const ISSUER = 'https://console.example'
  const discovery = {
    device_authorization_endpoint: `${ISSUER}/oauth/device`,
    token_endpoint: `${ISSUER}/oauth/token`,
  }

  function fake(tokenReplies: Array<{ status: number; body: unknown }>) {
    return vi.fn(async (url: string) => {
      if (url.endsWith('/.well-known/openid-configuration')) return new Response(JSON.stringify(discovery))
      if (url === discovery.device_authorization_endpoint) {
        return new Response(JSON.stringify({ device_code: 'dc', user_code: 'ABCD-EFGH', verification_uri: `${ISSUER}/activate`, expires_in: 600, interval: 1 }))
      }
      const next = tokenReplies.shift()!
      return new Response(JSON.stringify(next.body), { status: next.status })
    })
  }

  it('polls through pending and slow_down, then signs in', async () => {
    const token = jwt({ sub: 'felix', name: 'Felix Kim', exp: 2_000_000_000, aud: 'aud' })
    const idToken = jwt({ sub: 'felix', name: 'Felix Kim', exp: 2_000_000_000, aud: 'redrob-office' })
    const fetch = fake([
      { status: 400, body: { error: 'authorization_pending' } },
      { status: 400, body: { error: 'slow_down' } },
      { status: 200, body: { id_token: idToken, access_token: token, refresh_token: 'r1', expires_in: 3600 } },
    ])
    const sleeps: number[] = []
    const p = consoleProvider({ issuer: ISSUER, clientId: 'redrob-office', audience: 'aud', fetch, sleep: async (ms) => void sleeps.push(ms) })
    const start = (await p.start())!
    expect(start.userCode).toBe('ABCD-EFGH')
    const out = await p.finish(start, () => false)
    // the session keeps the token issued for the sync service, not the id token
    expect(out).toMatchObject({ status: 'signed-in', session: { sub: 'felix', refreshToken: 'r1', token } })
    expect(sleeps).toEqual([1000, 1000, 6000])
  })

  it('refuses a reply with no token for the sync audience', async () => {
    const idToken = jwt({ sub: 'felix', exp: 2_000_000_000, aud: 'redrob-office' })
    const opaque = 'not-a-jwt'
    const p = consoleProvider({
      issuer: ISSUER,
      clientId: 'redrob-office',
      audience: 'redrob-office-sync',
      fetch: fake([{ status: 200, body: { id_token: idToken, access_token: opaque } }]),
      sleep: async () => {},
    })
    expect(await p.finish((await p.start())!, () => false)).toEqual({ status: 'failed', code: 'wrong_audience' })
    const both = consoleProvider({
      issuer: ISSUER,
      clientId: 'redrob-office',
      audience: 'redrob-office-sync',
      fetch: fake([{ status: 200, body: { id_token: jwt({ sub: 'felix', exp: 2_000_000_000, aud: ['redrob-office', 'redrob-office-sync'] }) } }]),
      sleep: async () => {},
    })
    expect(await both.finish((await both.start())!, () => false)).toMatchObject({ status: 'signed-in' })
  })

  it('says when the person declined, and stops when cancelled', async () => {
    const p = consoleProvider({ issuer: ISSUER, clientId: 'c', audience: 'a', fetch: fake([{ status: 400, body: { error: 'access_denied' } }]), sleep: async () => {} })
    expect(await p.finish((await p.start())!, () => false)).toEqual({ status: 'denied' })
    const q = consoleProvider({ issuer: ISSUER, clientId: 'c', audience: 'a', fetch: fake([]), sleep: async () => {} })
    expect(await q.finish((await q.start())!, () => true)).toEqual({ status: 'cancelled' })
  })

  it('refuses endpoints outside Console', async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ device_authorization_endpoint: 'https://evil.example/device', token_endpoint: `${ISSUER}/oauth/token` })),
    )
    const p = consoleProvider({ issuer: ISSUER, clientId: 'c', audience: 'a', fetch })
    await expect(p.start()).rejects.toThrow('discovery_foreign_endpoint')
  })
})
