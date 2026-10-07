import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { bakedEndpoints, packagedEndpoint, resolveSyncEndpoints } from '../src/main/sync-endpoints'

const PKG = { redrobSync: { url: 'https://sync.office.redrob.ai', liveUrl: 'wss://live.office.redrob.ai' } }

describe('packaged sync endpoints', () => {
  it('accepts only https and wss on public hosts', () => {
    expect(packagedEndpoint('https://sync.office.redrob.ai/', 'https:')).toBe('https://sync.office.redrob.ai')
    expect(packagedEndpoint('wss://live.office.redrob.ai', 'wss:')).toBe('wss://live.office.redrob.ai')
    for (const bad of [
      'http://sync.office.redrob.ai',
      'https://127.0.0.1:8787',
      'https://127.3.4.5',
      'https://localhost',
      'https://[::1]:8787',
      'https://10.0.0.5',
      'https://192.168.1.10',
      'https://172.20.0.1',
      'https://[fe80::1]',
      'https://user:pw@sync.office.redrob.ai',
      'https://sync.office.redrob.ai?x=1',
      'https://sync.office.redrob.ai#a',
      'not a url',
      '',
    ]) {
      expect(packagedEndpoint(bad, 'https:'), bad).toBeNull()
    }
    expect(packagedEndpoint('ws://live.office.redrob.ai', 'wss:')).toBeNull()
  })

  it('reads what the release baked, and derives the live server when only the API was baked', () => {
    expect(bakedEndpoints(PKG)).toEqual({ url: 'https://sync.office.redrob.ai', liveUrl: 'wss://live.office.redrob.ai' })
    expect(bakedEndpoints({ redrobSync: { url: 'https://sync.office.redrob.ai' } })).toEqual({
      url: 'https://sync.office.redrob.ai',
      liveUrl: 'wss://sync.office.redrob.ai:8788',
    })
    expect(bakedEndpoints({ redrobSync: { url: 'http://127.0.0.1:8787' } })).toBeNull()
    expect(bakedEndpoints({ redrobSync: { url: 'https://sync.office.redrob.ai', liveUrl: 'ws://x' } })).toEqual({
      url: 'https://sync.office.redrob.ai',
      liveUrl: null,
    })
    expect(bakedEndpoints({})).toBeNull()
    expect(bakedEndpoints(null)).toBeNull()
  })

  it('a packaged build uses its baked addresses, ignores a loopback override, and has none when nothing was baked', () => {
    expect(resolveSyncEndpoints({ env: {}, packaged: true, pkg: PKG })).toEqual(bakedEndpoints(PKG))
    expect(resolveSyncEndpoints({ env: { REDROB_SYNC_URL: 'http://127.0.0.1:8787' }, packaged: true, pkg: PKG })).toEqual(bakedEndpoints(PKG))
    expect(resolveSyncEndpoints({ env: {}, packaged: true, pkg: {} })).toBeNull()
    expect(
      resolveSyncEndpoints({
        env: { REDROB_SYNC_URL: 'https://sync.staging.redrob.ai', REDROB_SYNC_LIVE_URL: 'wss://live.staging.redrob.ai' },
        packaged: true,
        pkg: PKG,
      }),
    ).toEqual({ url: 'https://sync.staging.redrob.ai', liveUrl: 'wss://live.staging.redrob.ai' })
  })

  it('a development build uses the environment, or the local Compose stack', () => {
    expect(resolveSyncEndpoints({ env: {}, packaged: false, pkg: null })).toEqual({ url: 'http://127.0.0.1:8787', liveUrl: 'ws://127.0.0.1:8788' })
    expect(resolveSyncEndpoints({ env: { REDROB_SYNC_URL: 'http://127.0.0.1:9000', REDROB_SYNC_LIVE_URL: 'ws://127.0.0.1:9001' }, packaged: false, pkg: PKG })).toEqual({
      url: 'http://127.0.0.1:9000',
      liveUrl: 'ws://127.0.0.1:9001',
    })
  })
})

describe('release workflows pass the sync service to packaging', () => {
  const read = (p: string) => require('node:fs').readFileSync(resolve(__dirname, '../../..', p), 'utf8') as string
  it.each(['.github/workflows/release-desktop.yml', '.github/workflows/release-linux.yml'])('%s', (wf) => {
    const text = read(wf)
    expect(text).toContain('REDROB_SYNC_URL: ${{ vars.REDROB_SYNC_URL }}')
    expect(text).toContain('REDROB_SYNC_LIVE_URL: ${{ vars.REDROB_SYNC_LIVE_URL }}')
  })
})

describe('packaging bakes the sync service in', () => {
  const SHELL = resolve(__dirname, '..')
  function load(env: Record<string, string | undefined>): Record<string, unknown> {
    const fs = require('node:fs') as typeof import('node:fs')
    const realExists = fs.existsSync
    const saved: Record<string, string | undefined> = {}
    for (const k of Object.keys(env)) {
      saved[k] = process.env[k]
      if (env[k] === undefined) delete process.env[k]
      else process.env[k] = env[k]
    }
    ;(fs as { existsSync: unknown }).existsSync = () => true
    try {
      const path = resolve(SHELL, 'electron-builder.cjs')
      delete require.cache[require.resolve(path)]
      return require(path) as Record<string, unknown>
    } finally {
      ;(fs as { existsSync: typeof realExists }).existsSync = realExists
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
      }
    }
  }

  it('writes redrobSync into package.json when the release passes both addresses', () => {
    const c = load({ REDROB_SYNC_URL: 'https://sync.office.redrob.ai', REDROB_SYNC_LIVE_URL: 'wss://live.office.redrob.ai' })
    expect((c.extraMetadata as Record<string, unknown>).redrobSync).toEqual(PKG.redrobSync)
  })

  it('bakes nothing when unset', () => {
    const c = load({ REDROB_SYNC_URL: undefined, REDROB_SYNC_LIVE_URL: undefined })
    expect((c.extraMetadata as Record<string, unknown> | undefined)?.redrobSync).toBeUndefined()
  })

  it('refuses http, loopback and a live address without an API address', () => {
    expect(() => load({ REDROB_SYNC_URL: 'http://sync.office.redrob.ai', REDROB_SYNC_LIVE_URL: undefined })).toThrow(/REDROB_SYNC_URL/)
    expect(() => load({ REDROB_SYNC_URL: 'https://127.0.0.1:8787', REDROB_SYNC_LIVE_URL: undefined })).toThrow(/public host/)
    expect(() => load({ REDROB_SYNC_URL: 'https://sync.office.redrob.ai', REDROB_SYNC_LIVE_URL: 'ws://live.office.redrob.ai' })).toThrow(
      /REDROB_SYNC_LIVE_URL/,
    )
    expect(() => load({ REDROB_SYNC_URL: undefined, REDROB_SYNC_LIVE_URL: 'wss://live.office.redrob.ai' })).toThrow(/needs REDROB_SYNC_URL/)
  })
})
