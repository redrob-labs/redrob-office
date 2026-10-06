/**
 * Office turns on the engine: the MCP tool bridge, resume across agent-core turns, and
 * fail-closed behaviour. Runs against the fake engine, which calls tools over real
 * loopback MCP exactly like the engine does.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'

import { isAiAuthError } from '../src/auth-error'
import { chatForProvider } from '../src/chat'
import {
  EngineUnavailableError,
  activeEngineRuns,
  engineStream,
  setEngineTargetProvider,
  transcriptParts,
} from '../src/engine-turn'
import { getProviderAdapter } from '../src/registry'
import { REDROB_CONSOLE_API_BASE, hasDegradedSteering } from '../src/redrob-engine'
import { engineModelOf, streamForProvider } from '../src/stream'
import { startFakeEngine, type FakeEngine } from './fake-engine'

let engine: FakeEngine

const tools: AgentToolDef[] = [
  { name: 'replace_text', description: 'Replace text', inputSchema: { type: 'object', properties: { find: { type: 'string' } } } },
]

type Turn = { text: string; calls: AgentToolCall[]; stop?: string }

async function turn(messages: AgentMessage[], signal = new AbortController().signal, t = tools): Promise<Turn> {
  const out: Turn = { text: '', calls: [] }
  await engineStream('redrob/auto', 'You edit documents.', messages, t, {
    signal,
    onDelta: (x) => (out.text += x),
    onToolCall: (c) => out.calls.push(c),
    onStopReason: (r) => (out.stop = r),
  })
  return out
}

/** Teardown is asynchronous (MCP disconnect, session delete); wait for it to land. */
async function settle(extra: () => boolean = () => true) {
  for (let i = 0; i < 100; i++) {
    if (activeEngineRuns() === 0 && engine.mcp.size === 0 && extra()) return
    await new Promise((r) => setTimeout(r, 10))
  }
}

beforeEach(async () => {
  engine = await startFakeEngine()
  setEngineTargetProvider(async () => ({ baseUrl: engine.baseUrl, username: engine.username, password: engine.password }))
})
afterEach(async () => {
  await settle()
  setEngineTargetProvider(null)
  await engine.close()
})

describe('engineStream', () => {
  it('streams a text-only answer and ends with stop', async () => {
    engine.onPrompt(async (ctx) => {
      ctx.text('Hello there')
      return { info: { role: 'assistant', finish: 'stop' }, parts: [] }
    })
    const r = await turn([{ role: 'user', text: 'hi' }], undefined, [])
    expect(r.text).toBe('Hello there')
    expect(r.stop).toBe('stop')
    const prompt = engine.requests.find((q) => q.path.includes('/message'))!.body as Record<string, unknown>
    expect(prompt.agent).toBe('office')
    expect(prompt.model).toEqual({ providerID: 'redrob', modelID: 'auto' })
    expect(prompt.tools).toEqual({ '*': false })
  })

  it('bridges a tool call into agent-core and resumes the same engine run with the result', async () => {
    let toolAnswer = ''
    engine.onPrompt(async (ctx) => {
      ctx.text('Working. ')
      toolAnswer = await ctx.callTool((await ctx.offeredTools())[0]!, { find: 'cat' })
      ctx.text(`Done: ${toolAnswer}`)
      return { info: { role: 'assistant', finish: 'stop' }, parts: [] }
    })
    const history: AgentMessage[] = [{ role: 'user', text: 'replace cat' }]
    const first = await turn(history)
    expect(first.text).toBe('Working. ')
    expect(first.stop).toBe('tool_use')
    expect(first.calls).toHaveLength(1)
    expect(first.calls[0]!.name).toBe('replace_text')
    expect(first.calls[0]!.input).toEqual({ find: 'cat' })

    history.push({ role: 'assistant', text: first.text, toolCalls: first.calls })
    history.push({ role: 'tool', results: [{ id: first.calls[0]!.id, name: 'replace_text', output: 'replaced 2' }] })
    const second = await turn(history)
    expect(toolAnswer).toBe('replaced 2')
    expect(second.text).toBe('Done: replaced 2')
    expect(second.stop).toBe('stop')
    // one engine session for the whole request
    expect(engine.requests.filter((q) => /^\/session(\?|$)/.test(q.path) && q.method === 'POST')).toHaveLength(1)
  })

  it("offers only this run's tools, never the engine's own or another run's", async () => {
    let offered: string[] = []
    engine.onPrompt(async (ctx) => {
      offered = await ctx.offeredTools()
      return { info: { finish: 'stop' }, parts: [] }
    })
    await turn([{ role: 'user', text: 'x' }])
    expect(offered).toHaveLength(1)
    expect(offered[0]).toMatch(/^o[0-9a-f]{12}_replace_text$/)
  })

  it('tears the run down: MCP server disconnected and no run left', async () => {
    engine.onPrompt(async () => ({ info: { finish: 'stop' }, parts: [] }))
    await turn([{ role: 'user', text: 'x' }])
    await settle()
    expect(activeEngineRuns()).toBe(0)
    expect(engine.mcp.size).toBe(0)
  })

  it('reports a provider sign-in failure as an auth error, so only then is sign-in offered', async () => {
    engine.onPrompt(async () => ({ info: { finish: 'stop', error: { name: 'ProviderAuthError', data: { message: 'invalid key' } } }, parts: [] }))
    const err = await turn([{ role: 'user', text: 'x' }]).catch((e: unknown) => e)
    expect(isAiAuthError(err)).toBe(true)
  })

  it('fails visibly, naming no vendor, when the engine errors', async () => {
    engine.onPrompt(async () => {
      throw new Error('boom')
    })
    const err = (await turn([{ role: 'user', text: 'x' }]).catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toMatch(/Redrob could not run this reply/)
    expect(hasDegradedSteering(err.message)).toBe(false)
  })

  it('fails closed when there is no engine in this window', async () => {
    setEngineTargetProvider(null)
    await expect(turn([{ role: 'user', text: 'x' }])).rejects.toBeInstanceOf(EngineUnavailableError)
  })

  it('fails closed when the engine will not start, with the reason', async () => {
    setEngineTargetProvider(async () => {
      throw new Error('engine binary not found at /x')
    })
    await expect(turn([{ role: 'user', text: 'x' }])).rejects.toThrow(/engine did not start: engine binary not found/)
  })

  it('aborting the waiting turn aborts the engine session', async () => {
    let started!: () => void
    const running = new Promise<void>((r) => (started = r))
    engine.onPrompt(async (ctx) => {
      started()
      await new Promise((r) => ctx.signal.addEventListener('abort', r))
      return { info: { finish: 'stop', error: { name: 'MessageAbortedError', data: {} } }, parts: [] }
    })
    const ac = new AbortController()
    const pending = turn([{ role: 'user', text: 'x' }], ac.signal)
    await running
    ac.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await settle(() => engine.aborted.length > 0)
    expect(engine.aborted).toHaveLength(1)
  })
})

describe('routing', () => {
  it('streamForProvider and chatForProvider run on the engine', async () => {
    engine.onPrompt(async (ctx) => {
      ctx.text('answer')
      return { info: { finish: 'stop' }, parts: [] }
    })
    expect(await chatForProvider('genspark', { apiKey: '', model: '' }, 'sys', 'q')).toEqual({ ok: true, content: 'answer' })
    let text = ''
    await streamForProvider('genspark', { apiKey: '', model: 'openai/gpt-5.6' }, 'sys', [{ role: 'user', text: 'q' }], [], 1000, {
      signal: new AbortController().signal,
      onDelta: (t) => (text += t),
      onToolCall: () => undefined,
    })
    expect(text).toBe('answer')
    const prompts = engine.requests.filter((q) => q.path.includes('/message')).map((q) => (q.body as { model: unknown }).model)
    expect(prompts[1]).toEqual({ providerID: 'openai', modelID: 'gpt-5.6' })
  })

  it('maps legacy model values onto the Redrob route', () => {
    expect(engineModelOf({ model: '' })).toBe('redrob/auto')
    expect(engineModelOf({ model: 'auto' })).toBe('redrob/auto')
    expect(engineModelOf({ model: 'claude-sonnet-5' })).toBe('redrob/claude-sonnet-5')
    expect(engineModelOf({ model: 'anthropic/claude-x' })).toBe('anthropic/claude-x')
  })

  it('resolveEndpoint still ignores a caller-supplied base URL', () => {
    const resolved = getProviderAdapter('custom').resolveEndpoint({ apiKey: 'k', model: 'm', baseUrl: 'http://evil.test/v1' })
    expect(resolved.baseUrl).toBe(REDROB_CONSOLE_API_BASE)
  })
})

describe('transcriptParts', () => {
  it('writes earlier turns as history and the newest user message as the request', () => {
    const parts = transcriptParts([
      { role: 'user', text: 'first' },
      { role: 'assistant', text: 'ok' },
      { role: 'user', text: 'second', images: [{ base64: 'AAA', mime: 'image/png' }] },
    ])
    expect(parts[0]).toMatchObject({ type: 'text' })
    const text = (parts[0] as { text: string }).text
    expect(text).toContain('<conversation_history>')
    expect(text).toContain('User: first')
    expect(text.trim().endsWith('second')).toBe(true)
    expect(parts[1]).toEqual({ type: 'file', mime: 'image/png', url: 'data:image/png;base64,AAA' })
  })

  it('carries progress made after the request when a run is restarted', () => {
    const text = (transcriptParts([
      { role: 'user', text: 'do it' },
      { role: 'assistant', text: '', toolCalls: [{ id: 'x', name: 'edit', input: {} }] },
      { role: 'tool', results: [{ id: 'x', name: 'edit', output: 'edited' }] },
    ])[0] as { text: string }).text
    expect(text).toContain('<progress>')
    expect(text).toContain('Result of edit: edited')
  })
})
