/**
 * EngineClient against a fake engine shaped after the measured v0.0.12 routes
 * (docs/engine-api.md).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ENGINE_BUILTIN_TOOLS,
  EngineClient,
  EngineError,
  OFFICE_AGENT,
  officeEngineConfig,
  splitModelId,
  toEngineModel,
} from '../src/engine-client'
import { startFakeEngine, type FakeEngine } from './fake-engine'

let engine: FakeEngine
let client: EngineClient

beforeEach(async () => {
  engine = await startFakeEngine()
  client = new EngineClient({ baseUrl: engine.baseUrl, username: engine.username, password: engine.password, directory: '/docs' })
})
afterEach(async () => {
  await engine.close()
})

describe('EngineClient', () => {
  it('reads health', async () => {
    expect(await client.health()).toEqual({ healthy: true, version: '0.0.12' })
  })

  it('lists models as provider/model ids without the provider key the engine echoes', async () => {
    const models = await client.models()
    expect(models.map((m) => m.id)).toEqual(['redrob/auto', 'redrob/claude-sonnet-5'])
    expect(models[1]!.input).toContain('image')
    expect(JSON.stringify(models)).not.toContain('rrk_secret')
  })

  it('scopes v2 routes with location[directory] and v1 routes with directory', async () => {
    await client.models()
    await client.createSession()
    expect(engine.requests.find((r) => r.path.startsWith('/api/model'))!.path).toBe('/api/model?location%5Bdirectory%5D=%2Fdocs')
    expect(engine.requests.find((r) => r.path.startsWith('/session'))!.path).toBe('/session?directory=%2Fdocs')
  })

  it('rejects wrong credentials as a typed error', async () => {
    const bad = new EngineClient({ baseUrl: engine.baseUrl, username: 'x', password: 'y' })
    await expect(bad.health()).rejects.toBeInstanceOf(EngineError)
  })

  it('creates a session, prompts and returns the final message', async () => {
    engine.onPrompt(async (ctx) => {
      ctx.text('hello')
      return { info: { role: 'assistant', finish: 'stop' }, parts: [{ type: 'text', text: 'hello' }] }
    })
    const id = await client.createSession()
    const result = await client.prompt(id, {
      model: splitModelId('redrob/auto'),
      agent: OFFICE_AGENT,
      parts: [{ type: 'text', text: 'hi' }],
    })
    expect((result.info as Record<string, unknown>).finish).toBe('stop')
  })

  it('streams events and drops heartbeats', async () => {
    const ac = new AbortController()
    const seen: string[] = []
    const reading = (async () => {
      for await (const e of client.events(ac.signal)) {
        seen.push(e.type)
        if (e.type === 'session.idle') ac.abort()
      }
    })().catch(() => undefined)
    await new Promise((r) => setTimeout(r, 50))
    engine.onPrompt(async (ctx) => {
      ctx.text('abc')
      return { info: { finish: 'stop' }, parts: [] }
    })
    const id = await client.createSession()
    await client.prompt(id, { model: splitModelId('auto'), parts: [{ type: 'text', text: 'x' }] })
    await reading
    expect(seen).toContain('message.part.delta')
    expect(seen).toContain('session.idle')
    expect(seen).not.toContain('server.heartbeat')
  })

  it('aborts a session', async () => {
    const id = await client.createSession()
    await client.abort(id)
    expect(engine.aborted).toEqual([id])
  })
})

describe('officeEngineConfig', () => {
  it('turns every built-in engine tool off and denies it', () => {
    const agent = (officeEngineConfig().agent as Record<string, Record<string, Record<string, unknown>>>)[OFFICE_AGENT]!
    for (const t of ENGINE_BUILTIN_TOOLS) {
      expect(agent.tools![t]).toBe(false)
      expect(agent.permission![t]).toBe('deny')
    }
  })
})

describe('splitModelId / toEngineModel', () => {
  it('treats a bare id as a Redrob model', () => {
    expect(splitModelId('auto')).toEqual({ providerID: 'redrob', modelID: 'auto' })
    expect(splitModelId('openai/gpt-5.6')).toEqual({ providerID: 'openai', modelID: 'gpt-5.6' })
    expect(splitModelId('')).toEqual({ providerID: 'redrob', modelID: 'auto' })
  })

  it('ignores something that is not a model', () => {
    expect(toEngineModel(null)).toBeNull()
    expect(toEngineModel({ id: 'x' })).toBeNull()
  })
})
