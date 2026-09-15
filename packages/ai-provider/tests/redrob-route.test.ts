// Contract: the AI layer targets ONLY the single Redrob Console engine.
//
// Redrob Office has one engine (redrob-office/AGENTS.md): no BYOK, no provider
// selection, no configurable inference server URL, and no third-party engine
// name in the routing path. These tests lock that the chat/stream entry points
// always call the fixed Redrob base with the fixed model, regardless of the
// `provider` argument the ported editor apps pass in.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  REDROB_CONSOLE_API_BASE,
  REDROB_ENGINE_MODEL,
  chatForProvider,
  streamForProvider,
} from '../src/index'
import type { AiProviderConfig, AiProviderId } from '../src/index'

const KEY: AiProviderConfig = { apiKey: 'rk-test-key', model: 'ignored-model' }

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function sseResponse(events: string[]): Response {
  const text = events.map((e) => `data: ${e}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(text, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Every provider id the ported apps' settings union can carry. None may change the route. */
const EVERY_PROVIDER_ID: AiProviderId[] = [
  'genspark',
  'anthropic',
  'gemini',
  'deepseek',
  'openai',
  'kimi',
  'glm',
  'qwen',
  'doubao',
  'minimax',
  'xai',
  'mistral',
  'openrouter',
  'custom',
]

describe('single Redrob route', () => {
  it('sends one-shot chat only to the fixed Redrob Console base with the fixed model', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    const result = await chatForProvider('anthropic', KEY, 'system', 'hi')
    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${REDROB_CONSOLE_API_BASE}/chat/completions`)
    expect(url.startsWith('https://console.redrob.ai/api/backend/v1')).toBe(true)
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe(REDROB_ENGINE_MODEL)
  })

  it('ignores the provider argument: no vendor id ever changes the base URL', async () => {
    for (const provider of EVERY_PROVIDER_ID) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
      await chatForProvider(provider, KEY, 'system', 'hi')
    }
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe(`${REDROB_CONSOLE_API_BASE}/chat/completions`)
    }
  })

  it('never targets a third-party vendor host', async () => {
    const vendorHosts = [
      'api.anthropic.com',
      'generativelanguage.googleapis.com',
      'api.openai.com',
      'api.deepseek.com',
      'openrouter.ai',
      'genspark.ai',
    ]
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    await chatForProvider('custom', { apiKey: 'rk-x', model: 'm', baseUrl: 'https://evil.example/v1' }, 's', 'u')
    const url = fetchMock.mock.calls[0]![0] as string
    for (const host of vendorHosts) expect(url).not.toContain(host)
    // a caller-supplied baseUrl must not be honored: the engine base is fixed
    expect(url).not.toContain('evil.example')
  })

  it('streams tool calls to the fixed Redrob base and parses the SSE', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }),
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, id: 'c1', function: { name: 'edit', arguments: '{"x":1}' } }],
              },
            },
          ],
        }),
        JSON.stringify({ choices: [{ finish_reason: 'stop' }] }),
      ]),
    )
    const deltas: string[] = []
    const tools: string[] = []
    let stop: string | undefined
    await streamForProvider('openai', KEY, 'system', [{ role: 'user', text: 'hi' }], [], 4096, {
      signal: new AbortController().signal,
      onDelta: (t) => deltas.push(t),
      onToolCall: (c) => tools.push(`${c.name}:${JSON.stringify(c.input)}`),
      onStopReason: (r) => {
        stop = r
      },
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${REDROB_CONSOLE_API_BASE}/chat/completions`)
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe(REDROB_ENGINE_MODEL)
    expect(body.stream).toBe(true)
    expect(deltas.join('')).toBe('Hello')
    expect(tools).toEqual(['edit:{"x":1}'])
    expect(stop).toBe('stop')
  })

  it('refuses a keyless turn with the honest-failure notice, and makes no request', async () => {
    const result = await chatForProvider('genspark', { apiKey: '', model: '' }, 's', 'u')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Redrob')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keyless stream throws a Redrob-branded error without touching the network', async () => {
    await expect(
      streamForProvider('genspark', { apiKey: '', model: '' }, 's', [], [], 4096, {
        signal: new AbortController().signal,
        onDelta: () => {},
        onToolCall: () => {},
      }),
    ).rejects.toThrow(/Redrob/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
