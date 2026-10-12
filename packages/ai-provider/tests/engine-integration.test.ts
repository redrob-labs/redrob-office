/**
 * Tests for the engine integration client.
 *
 * No server and no Electron: the client takes a fetch-shaped function, so every case
 * below is a real assertion about the request we send or the response we tolerate.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  EngineIntegrationClient,
  EngineIntegrationError,
  toEngineIntegration,
  type EngineTarget,
} from '../src/engine-integration'

const target: EngineTarget = {
  baseUrl: 'http://127.0.0.1:41234',
  username: 'user',
  password: 'pass',
  directory: '/home/someone/project',
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('toEngineIntegration', () => {
  it('reports connected when the engine already holds a credential', () => {
    const entry = toEngineIntegration({
      id: 'anthropic',
      name: 'Anthropic',
      methods: [{ type: 'key', id: 'api-key' }],
      connections: [{ id: 'cred_1' }],
    })
    expect(entry).toEqual({
      id: 'anthropic',
      name: 'Anthropic',
      methods: [{ type: 'key', id: 'api-key' }],
      connected: true,
    })
  })

  it('reports not connected on an empty connections array', () => {
    const entry = toEngineIntegration({ id: 'openai', methods: [], connections: [] })
    expect(entry?.connected).toBe(false)
  })

  it('falls back to the id when the engine sends no name', () => {
    expect(toEngineIntegration({ id: 'openai', methods: [], connections: [] })?.name).toBe('openai')
  })

  it('keeps known methods and ignores an unfamiliar one', () => {
    // A method type added to the engine later must not make an older Office build
    // throw while rendering the list. Dropping the whole integration would hide a
    // provider the user has already connected.
    const entry = toEngineIntegration({
      id: 'x',
      methods: [
        { type: 'key', id: 'api-key' },
        { type: 'passkey', id: 'whatever' },
        { type: 'oauth', id: 'web' },
      ],
      connections: [],
    })
    expect(entry?.methods).toEqual([
      { type: 'key', id: 'api-key' },
      { type: 'oauth', id: 'web' },
    ])
  })

  it('drops a method with no id rather than emitting a half-built one', () => {
    const entry = toEngineIntegration({ id: 'x', methods: [{ type: 'key' }], connections: [] })
    expect(entry?.methods).toEqual([])
  })

  it('returns null for something that is not an integration', () => {
    expect(toEngineIntegration(null)).toBeNull()
    expect(toEngineIntegration({ name: 'no id' })).toBeNull()
  })
})

describe('EngineIntegrationClient.list', () => {
  it('sends Basic auth and the project directory', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([]))
    await new EngineIntegrationClient(target, fetchImpl).list()

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:41234/api/integration?directory=%2Fhome%2Fsomeone%2Fproject')
    // The integration routes are location-scoped; omitting directory asks about the
    // engine's default location, which is a different answer rather than a simpler one.
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('user:pass').toString('base64')}`,
    )
  })

  it('omits the directory param when none is configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([]))
    await new EngineIntegrationClient({ ...target, directory: undefined }, fetchImpl).list()
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://127.0.0.1:41234/api/integration')
  })

  it('accepts both a bare array and a location-wrapped payload', async () => {
    // The wrapper is an engine detail Office should not have to track.
    const bare = vi.fn().mockResolvedValue(ok([{ id: 'a', methods: [], connections: [] }]))
    const wrapped = vi.fn().mockResolvedValue(ok({ data: [{ id: 'a', methods: [], connections: [] }] }))

    expect(await new EngineIntegrationClient(target, bare).list()).toHaveLength(1)
    expect(await new EngineIntegrationClient(target, wrapped).list()).toHaveLength(1)
  })

  it('returns an empty list rather than throwing on an unexpected body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ unexpected: true }))
    expect(await new EngineIntegrationClient(target, fetchImpl).list()).toEqual([])
  })

  it('raises a typed error carrying the status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }))
    await expect(new EngineIntegrationClient(target, fetchImpl).list()).rejects.toBeInstanceOf(
      EngineIntegrationError,
    )
  })

  it('does not surface the engine response body in the error message', async () => {
    // An engine error can quote the request, and a request to these routes can carry a
    // key. The status is useful to a caller; the body is not worth the risk.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('failed storing key sk-secret-value', { status: 500 }))
    await expect(new EngineIntegrationClient(target, fetchImpl).list()).rejects.toThrow(
      /engine request failed/,
    )
    await expect(new EngineIntegrationClient(target, fetchImpl).list()).rejects.not.toThrow(
      /sk-secret-value/,
    )
  })
})

describe('EngineIntegrationClient.connectKey', () => {
  it('posts the key to the engine and returns nothing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const result = await new EngineIntegrationClient(target, fetchImpl).connectKey(
      'anthropic',
      'sk-ant-test',
      'my key',
    )

    // No return value by design: there is no read path for a stored key, so a caller
    // cannot log, sync or leak one.
    expect(result).toBeUndefined()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toContain('/api/integration/anthropic/connect/key')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ key: 'sk-ant-test', label: 'my key' })
  })

  it('omits label when not given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await new EngineIntegrationClient(target, fetchImpl).connectKey('openai', 'sk-test')
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body as string)).toEqual({ key: 'sk-test' })
  })

  it('percent-encodes an integration id so it cannot escape its path segment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await new EngineIntegrationClient(target, fetchImpl).connectKey('weird/../id', 'k')
    expect(fetchImpl.mock.calls[0]![0]).toContain('/api/integration/weird%2F..%2Fid/connect/key')
  })
})

describe('EngineIntegrationClient.removeCredential', () => {
  it('deletes by credential id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await new EngineIntegrationClient(target, fetchImpl).removeCredential('cred_1')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toContain('/api/credential/cred_1')
    expect(init.method).toBe('DELETE')
  })
})

describe('no read path for secrets', () => {
  it('the client exposes no method that could return a key', () => {
    // A guard, not a tautology: this fails the moment someone adds a convenience
    // getter, which is exactly how a credential store stops being write-only.
    const methods = Object.getOwnPropertyNames(EngineIntegrationClient.prototype)
    expect(methods.sort()).toEqual(['call', 'connectKey', 'constructor', 'list', 'removeCredential'])
  })
})
