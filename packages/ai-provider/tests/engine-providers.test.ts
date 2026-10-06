import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EngineProvidersClient, EngineProvidersError } from '../src/engine-providers'
import { startFakeEngine, type FakeEngine } from './fake-engine'

let engine: FakeEngine
let client: EngineProvidersClient
beforeEach(async () => {
  engine = await startFakeEngine()
  client = new EngineProvidersClient({ baseUrl: engine.baseUrl, username: engine.username, password: engine.password })
})
afterEach(async () => {
  await engine.close()
})

describe('EngineProvidersClient', () => {
  it('lists every provider the engine can authenticate, with methods by index', async () => {
    const list = await client.list()
    expect(list.map((p) => p.id)).toEqual(['redrob', 'github-copilot', 'xai'])
    expect(list[0]).toMatchObject({ name: 'Redrob', connected: true })
    expect(list[1]!.methods[0]).toMatchObject({ index: 0, type: 'oauth', prompts: [{ key: 'deploymentType', type: 'select' }] })
    expect(list[2]).toMatchObject({ name: 'xAI', connected: false, methods: [{ index: 0, type: 'api' }] })
  })

  it('stores a Redrob key through the integration API and others through v1 auth', async () => {
    await client.setKey('redrob', 'rrk_x')
    await client.setKey('xai', 'xai-key')
    expect(engine.keys).toEqual([{ integration: 'redrob', key: 'rrk_x', label: 'Redrob Office' }])
    expect(engine.v1Auth.get('xai')).toEqual({ type: 'api', key: 'xai-key' })
    expect((await client.list()).find((p) => p.id === 'xai')!.connected).toBe(true)
  })

  it('disconnects, and treats nothing stored as already disconnected', async () => {
    await client.setKey('xai', 'k')
    await client.remove('xai')
    expect(engine.v1Auth.has('xai')).toBe(false)
    await expect(client.remove('xai')).resolves.toBeUndefined()
  })

  it('runs OAuth through the engine', async () => {
    const start = await client.startOAuth('github-copilot', 0, { deploymentType: 'github.com' })
    expect(start).toEqual({ url: 'https://example.test/device', mode: 'auto', instructions: 'Enter code ABCD' })
    expect(await client.finishOAuth('github-copilot', 0)).toBe(true)
    expect(engine.v1Auth.get('github-copilot')).toEqual({ type: 'oauth' })
  })

  it('refuses an id that could escape its path', async () => {
    await expect(client.setKey('../x', 'k')).rejects.toBeInstanceOf(EngineProvidersError)
  })

  it('exposes no method that returns a secret', () => {
    expect(Object.getOwnPropertyNames(EngineProvidersClient.prototype).sort()).toEqual([
      'call',
      'constructor',
      'finishOAuth',
      'list',
      'remove',
      'setKey',
      'startOAuth',
    ])
  })
})
