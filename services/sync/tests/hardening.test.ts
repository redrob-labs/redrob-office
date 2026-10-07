import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { devIssuer, jwksVerifier } from '../src/auth.ts'
import { MemoryBlobs } from '../src/blobs.ts'
import { loadConfig } from '../src/config.ts'
import { buildApp, redactUrl } from '../src/http.ts'
import { RateLimiter } from '../src/limits.ts'
import { MemoryRepo } from '../src/repo.ts'

const ENV = {
  DATABASE_URL: 'postgres://x',
  S3_ENDPOINT: 'http://s3:8333',
  S3_BUCKET: 'office',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
}
const PROD = {
  ...ENV,
  NODE_ENV: 'production',
  SYNC_JWKS_URL: 'https://console.redrob.ai/.well-known/jwks.json',
  SYNC_ISSUER: 'https://console.redrob.ai',
  SYNC_AUDIENCE: 'redrob-office-sync',
}

describe('production config', () => {
  it('refuses to start without a JWKS URL, issuer and audience', () => {
    const { SYNC_JWKS_URL: _j, ...noJwks } = PROD
    const { SYNC_ISSUER: _i, ...noIssuer } = PROD
    const { SYNC_AUDIENCE: _a, ...noAudience } = PROD
    expect(() => loadConfig(noJwks)).toThrow(/SYNC_JWKS_URL/)
    expect(() => loadConfig(noIssuer)).toThrow(/SYNC_ISSUER/)
    expect(() => loadConfig(noAudience)).toThrow(/SYNC_AUDIENCE/)
  })

  it('refuses a plain-http JWKS URL or issuer in production', () => {
    expect(() => loadConfig({ ...PROD, SYNC_JWKS_URL: 'http://console.redrob.ai/jwks' })).toThrow(/https in production/)
    expect(() => loadConfig({ ...PROD, SYNC_ISSUER: 'http://console.redrob.ai' })).toThrow(/https in production/)
    expect(() => loadConfig({ ...PROD, SYNC_JWKS_URL: 'not a url' })).toThrow(/must be a URL/)
  })

  it('accepts a complete production config, with defaults for the limits', () => {
    const c = loadConfig(PROD)
    expect(c.production).toBe(true)
    expect(c.auth).toEqual({ kind: 'jwks', jwksUrl: PROD.SYNC_JWKS_URL, issuer: PROD.SYNC_ISSUER, audience: 'redrob-office-sync' })
    expect(c.bodyLimitBytes).toBe(256 * 1024)
    expect(c.limits).toEqual({ perAddressPerMinute: 600, perAccountPerMinute: 300, linksPerHour: 30 })
    expect(c.eventRetentionDays).toBe(180)
    expect(c.logLevel).toBe('info')
  })

  it('checks the numbers it is given', () => {
    expect(loadConfig({ ...PROD, SYNC_BODY_LIMIT_BYTES: '65536', SYNC_RATE_LINKS_PER_HOUR: '5' })).toMatchObject({
      bodyLimitBytes: 65536,
      limits: { linksPerHour: 5 },
    })
    expect(() => loadConfig({ ...PROD, SYNC_BODY_LIMIT_BYTES: '-1' })).toThrow(/SYNC_BODY_LIMIT_BYTES/)
    expect(() => loadConfig({ ...PROD, SYNC_MAX_FILE_BYTES: 'lots' })).toThrow(/SYNC_MAX_FILE_BYTES/)
    expect(() => loadConfig({ ...PROD, SYNC_LOG_LEVEL: 'loud' })).toThrow(/SYNC_LOG_LEVEL/)
  })
})

describe('rate limiter', () => {
  it('allows the limit per window, then says when to retry', () => {
    let t = 0
    const r = new RateLimiter(2, 60_000, () => t)
    expect(r.take('a').ok).toBe(true)
    expect(r.take('a').ok).toBe(true)
    expect(r.take('a')).toEqual({ ok: false, retryAfter: 60 })
    expect(r.take('b').ok).toBe(true)
    t = 30_000
    expect(r.take('a')).toEqual({ ok: false, retryAfter: 30 })
    t = 60_000
    expect(r.take('a').ok).toBe(true)
  })
})

async function setup(opts: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const dev = await devIssuer({ issuer: 'http://test/dev', audience: 'redrob-office-sync' })
  const repo = new MemoryRepo()
  const blobs = new MemoryBlobs()
  const app = buildApp({ repo, blobs, verifier: dev, devIssuer: dev, maxFileBytes: 1024 * 1024, log: () => {}, ...opts })
  const felix = await dev.sign({ sub: 'felix', name: 'Felix Kim' })
  const jae = await dev.sign({ sub: 'jae', name: 'Jae Gardner' })
  const auth = (t: string) => ({ authorization: `Bearer ${t}` })
  return { repo, blobs, app, felix, jae, auth }
}

describe('limits over HTTP', () => {
  it('refuses an account past its per-minute limit with Retry-After, and counts accounts apart', async () => {
    const { app, felix, jae, auth } = await setup({ limits: { perAddressPerMinute: 100, perAccountPerMinute: 3, linksPerHour: 100 } })
    for (let i = 0; i < 3; i++) expect((await app.inject({ url: '/files', headers: auth(felix) })).statusCode).toBe(200)
    const r = await app.inject({ url: '/files', headers: auth(felix) })
    expect(r.statusCode).toBe(429)
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0)
    expect((await app.inject({ url: '/files', headers: auth(jae) })).statusCode).toBe(200)
  })

  it('limits invite-link look-ups and redemptions per account', async () => {
    const { app, jae, auth } = await setup({ limits: { perAddressPerMinute: 100, perAccountPerMinute: 100, linksPerHour: 2 } })
    const token = 'A'.repeat(43)
    expect((await app.inject({ url: `/links/${token}`, headers: auth(jae) })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: `/links/${token}/redeem`, headers: auth(jae) })).statusCode).toBe(404)
    expect((await app.inject({ url: `/links/${token}`, headers: auth(jae) })).statusCode).toBe(429)
  })

  it('limits an address before sign-in, but never health or readiness', async () => {
    const { app } = await setup({ limits: { perAddressPerMinute: 2, perAccountPerMinute: 100, linksPerHour: 100 } })
    expect((await app.inject({ url: '/files' })).statusCode).toBe(401)
    expect((await app.inject({ url: '/files' })).statusCode).toBe(401)
    expect((await app.inject({ url: '/files' })).statusCode).toBe(429)
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ url: '/health' })).statusCode).toBe(200)
      expect((await app.inject({ url: '/ready' })).statusCode).toBe(200)
    }
  })
})

describe('body limits', () => {
  it('keeps JSON small while uploads take the file limit', async () => {
    const { app, felix, auth } = await setup({ bodyLimitBytes: 1024 })
    const big = await app.inject({ method: 'POST', url: '/files', headers: auth(felix), payload: { name: 'x'.repeat(4096) } })
    expect(big.statusCode).toBe(413)
    const f = (await app.inject({ method: 'POST', url: '/files', headers: auth(felix), payload: { name: 'deck.pptx' } })).json()
    const up = await app.inject({
      method: 'PUT',
      url: `/files/${f.id}/content`,
      headers: { ...auth(felix), 'content-type': 'application/octet-stream' },
      payload: Buffer.alloc(64 * 1024, 1),
    })
    expect(up.statusCode).toBe(201)
  })
})

describe('readiness', () => {
  it('is ready when the database and the store answer', async () => {
    const { app } = await setup()
    expect((await app.inject({ url: '/ready' })).json()).toEqual({ ok: true, db: true, store: true })
  })

  it('names what is down, without the error, and fails while draining', async () => {
    const { app, repo, blobs } = await setup()
    repo.ping = async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:5432')
    }
    const r = await app.inject({ url: '/ready' })
    expect(r.statusCode).toBe(503)
    expect(r.json()).toEqual({ ok: false, db: false, store: true })
    expect(r.body).not.toContain('ECONNREFUSED')
    void blobs
    const draining = await setup({ draining: () => true })
    expect((await draining.app.inject({ url: '/ready' })).statusCode).toBe(503)
    expect((await draining.app.inject({ url: '/health' })).statusCode).toBe(200)
  })
})

describe('logs', () => {
  it('never write invite-link tokens or query strings', () => {
    expect(redactUrl('/links/abcDEF_123-xyz/redeem')).toBe('/links/[token]/redeem')
    expect(redactUrl('/activity?after=12')).toBe('/activity?[query]')
    expect(redactUrl('/files')).toBe('/files')
  })
})

describe('production mode against a JWKS', () => {
  it('serves a request with a token checked against a JWKS endpoint, the dev issuer off', async () => {
    // a stand-in for Console: one key set served over HTTP, tokens signed with its key
    const fake = await devIssuer({ issuer: 'https://console.example.test', audience: 'redrob-office-sync' })
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(req.url === '/.well-known/jwks.json' ? fake.jwks : {}))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const port = (server.address() as AddressInfo).port
    try {
      const cfg = loadConfig({ ...PROD, SYNC_ISSUER: 'https://console.example.test', SYNC_JWKS_URL: 'https://console.example.test/.well-known/jwks.json' })
      expect(cfg.auth.kind).toBe('jwks')
      // the JWKS is fetched from the local stand-in (https is checked by config, not by the fetch)
      const verifier = jwksVerifier({ ...(cfg.auth as { issuer: string; audience: string }), jwksUrl: `http://127.0.0.1:${port}/.well-known/jwks.json` })
      const app = buildApp({
        repo: new MemoryRepo(),
        blobs: new MemoryBlobs(),
        verifier,
        maxFileBytes: cfg.maxFileBytes,
        bodyLimitBytes: cfg.bodyLimitBytes,
        limits: cfg.limits,
        log: () => {},
      })
      const token = await fake.sign({ sub: 'felix', name: 'Felix Kim' })
      const me = await app.inject({ url: '/me', headers: { authorization: `Bearer ${token}` } })
      expect(me.statusCode).toBe(200)
      expect(me.json()).toMatchObject({ sub: 'felix' })
      // no development routes in production
      expect((await app.inject({ method: 'POST', url: '/dev/token', payload: { sub: 'x' } })).statusCode).toBe(404)
      const stranger = await devIssuer({ issuer: 'https://console.example.test', audience: 'redrob-office-sync' })
      const forged = await stranger.sign({ sub: 'felix', name: 'Felix Kim' })
      expect((await app.inject({ url: '/me', headers: { authorization: `Bearer ${forged}` } })).statusCode).toBe(401)
      await app.close()
    } finally {
      server.close()
    }
  })
})

describe('activity retention', () => {
  it('prunes events older than the cut-off', async () => {
    const repo = new MemoryRepo()
    await repo.addEvent({ fileId: 'f', fileName: 'a', actorSub: 'x', actorName: 'X', kind: 'version', detail: {}, audience: ['y'] })
    expect(await repo.pruneEvents(new Date(Date.now() - 86_400_000))).toBe(0)
    expect(await repo.pruneEvents(new Date(Date.now() + 1000))).toBe(1)
    expect(await repo.activity('y', { limit: 10 })).toEqual([])
  })
})
