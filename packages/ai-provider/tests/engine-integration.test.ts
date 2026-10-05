/**
 * Tests for the engine integration client.
 *
 * No server and no Electron: the client takes a fetch-shaped function, so every case
 * below is a real assertion about the request we send or the response we tolerate.
 * Shapes follow the engine v0.0.12 routes recorded in docs/engine-api.md.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  EngineIntegrationClient,
  EngineIntegrationError,
  toEngineIntegration,
  withLocation,
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

const oneIntegration = { data: [{ id: 'a', name: 'A', methods: [], connections: [] }] }

describe('toEngineIntegration', () => {
  it('reports connected when the engine already holds a credential', () => {
    const entry = toEngineIntegration({
      id: 'anthropic',
      name: 'Anthropic',
      methods: [{ type: 'key', id: 'api-key' }],
      connections: [{ type: 'credential', id: 'cred_1', label: 'work' }],
    })
    expect(entry).toEqual({
      id: 'anthropic',
      name: 'Anthropic',
      methods: [{ type: 'key', id: 'api-key' }],
      connected: true,
      connections: [{ type: 'credential', id: 'cred_1', label: 'work' }],
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
    // throw while rendering the list.
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

  it('drops an OAuth method with no id, which could never be chosen', () => {
    const entry = toEngineIntegration({ id: 'x', methods: [{ type: 'oauth', label: 'web' }], connections: [] })
    expect(entry?.methods).toEqual([])
  })

  it('reads the engine v0.0.12 shape, where key and env methods carry no id', () => {
    const entry = toEngineIntegration({
      id: 'redrob',
      name: 'Redrob Code',
      methods: [{ type: 'key', label: 'Redrob API key' }, { type: 'env', names: ['REDROB_API_KEY'] }],
      connections: [{ type: 'env', name: 'REDROB_API_KEY' }],
    })
    expect(entry?.methods).toEqual([
      { type: 'key', id: 'key', label: 'Redrob API key' },
      { type: 'env', id: 'env', names: ['REDROB_API_KEY'] },
    ])
    expect(entry?.connections).toEqual([{ type: 'env', name: 'REDROB_API_KEY' }])
  })

  it('keeps OAuth prompts', () => {
    const entry = toEngineIntegration({
      id: 'github-copilot',
      methods: [
        {
          type: 'oauth',
          id: 'device',
          label: 'Login',
          prompts: [{ type: 'select', key: 'deployment', message: 'Type', options: [{ label: 'GitHub.com', value: 'github.com' }] }],
        },
      ],
      connections: [],
    })
    expect(entry?.methods[0]).toMatchObject({ type: 'oauth', prompts: [{ type: 'select', key: 'deployment' }] })
  })

  it('returns null for something that is not an integration', () => {
    expect(toEngineIntegration(null)).toBeNull()
    expect(toEngineIntegration({ name: 'no id' })).toBeNull()
  })
})

describe('withLocation', () => {
  it('uses a deepObject location on v2 routes and a plain directory elsewhere', () => {
    expect(withLocation(target, '/api/model')).toBe('http://127.0.0.1:41234/api/model?location%5Bdirectory%5D=%2Fhome%2Fsomeone%2Fproject')
    expect(withLocation(target, '/session')).toBe('http://127.0.0.1:41234/session?directory=%2Fhome%2Fsomeone%2Fproject')
  })
})

describe('EngineIntegrationClient.list', () => {
  it('sends Basic auth and the project location', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok(oneIntegration))
    await new EngineIntegrationClient(target, fetchImpl).list()

    const [url, init] = fetchImpl.mock.calls[0]!
    // The v2 routes take a deepObject location; a plain directory is silently ignored and
    // the engine answers for its own cwd, which is a different answer.
    expect(url).toBe('http://127.0.0.1:41234/api/integration?location%5Bdirectory%5D=%2Fhome%2Fsomeone%2Fproject')
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('user:pass').toString('base64')}`,
    )
  })

  it('omits the location when none is configured', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok(oneIntegration))
    await new EngineIntegrationClient({ ...target, directory: undefined }, fetchImpl).list()
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://127.0.0.1:41234/api/integration')
  })

  it('accepts both a bare array and a location-wrapped payload', async () => {
    const bare = vi.fn().mockImplementation(async () => ok([{ id: 'a', methods: [], connections: [] }]))
    const wrapped = vi.fn().mockImplementation(async () => ok(oneIntegration))

    expect(await new EngineIntegrationClient(target, bare).list()).toHaveLength(1)
    expect(await new EngineIntegrationClient(target, wrapped).list()).toHaveLength(1)
  })

  it('retries once when the first answer is empty while the catalog loads', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok({ data: [] })).mockResolvedValueOnce(ok(oneIntegration))
    expect(await new EngineIntegrationClient(target, fetchImpl).list()).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns an empty list rather than throwing on an unexpected body', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok({ unexpected: true }))
    expect(await new EngineIntegrationClient(target, fetchImpl).list()).toEqual([])
  })

  it('raises a typed error carrying the status', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('nope', { status: 401 }))
    await expect(new EngineIntegrationClient(target, fetchImpl).list()).rejects.toBeInstanceOf(
      EngineIntegrationError,
    )
  })

  it('does not surface the engine response body in the error message', async () => {
    // An engine error can quote the request, and a request to these routes can carry a key.
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => new Response('failed storing key sk-secret-value', { status: 500 }))
    await expect(new EngineIntegrationClient(target, fetchImpl).list()).rejects.toThrow(/engine request failed/)
    await expect(new EngineIntegrationClient(target, fetchImpl).list()).rejects.not.toThrow(/sk-secret-value/)
  })
})

describe('EngineIntegrationClient.connectKey', () => {
  it('posts the key to the engine and returns nothing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const result = await new EngineIntegrationClient(target, fetchImpl).connectKey('anthropic', 'sk-ant-test', 'my key')

    // No return value by design: there is no read path for a stored key.
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

describe('EngineIntegrationClient OAuth', () => {
  it('starts an attempt and reads its status', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        ok({ data: { attemptID: 'att_1', url: 'https://example.test/auth', instructions: 'Approve', mode: 'auto', time: { created: 1, expires: 2 } } }),
      )
      .mockResolvedValueOnce(ok({ data: { status: 'complete', time: { created: 1, expires: 2 } } }))
    const c = new EngineIntegrationClient(target, fetchImpl)
    const attempt = await c.connectOAuth('github-copilot', 'device', { deployment: 'github.com' })
    expect(attempt).toEqual({ attemptID: 'att_1', url: 'https://example.test/auth', instructions: 'Approve', mode: 'auto', expiresAt: 2 })
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body as string)).toEqual({ methodID: 'device', inputs: { deployment: 'github.com' } })
    expect(await c.attemptStatus('att_1')).toBe('complete')
  })

  it('refuses an attempt with no URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ data: {} }))
    await expect(new EngineIntegrationClient(target, fetchImpl).connectOAuth('x', 'm')).rejects.toBeInstanceOf(
      EngineIntegrationError,
    )
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
    // Fails the moment someone adds a convenience getter, which is how a credential
    // store stops being write-only.
    const methods = Object.getOwnPropertyNames(EngineIntegrationClient.prototype)
    expect(methods.sort()).toEqual([
      'attemptStatus',
      'call',
      'cancelAttempt',
      'completeAttempt',
      'connectKey',
      'connectOAuth',
      'constructor',
      'list',
      'removeCredential',
    ])
  })
})
