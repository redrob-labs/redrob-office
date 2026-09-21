// Contract: the 60s connect timeout gates time-to-HEADERS, never
// time-to-first-token.
//
// The stream watchdog arms a 60s connect budget and swaps to a 180s idle budget
// on the first touch(). touch() used to be called only from the SSE line reader,
// so the 60s clock kept running while the gateway was thinking before the first
// token -- and a long-context or reasoning request legitimately goes silent for
// minutes after answering with headers. The request died at exactly 60s with
// "no data received from the network", while the console had already replied and
// was still billing the generation.
//
// The response headers are the connection proving itself alive, so they must
// hand the rest of the wait to the idle budget.
//
// The mock below must honour init.signal on the BODY, not just on the request:
// that is what real fetch does, and a mock that ignores it passes whether the
// fix is present or not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_CONNECT_TIMEOUT_MS, redrobEngineStream } from '../src/index'
import type { StreamCallbacks } from '../src/index'

const AUTH = { apiKey: 'rk-test-key' }

function callbacks(onDelta: (text: string) => void): StreamCallbacks {
  return { onDelta, onToolCall: () => {}, signal: new AbortController().signal }
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/**
 * Headers immediately; the first SSE byte only after `firstByteDelayMs`. An
 * abort on the request signal errors the body mid-read, as undici does.
 */
function slowFirstToken(firstByteDelayMs: number, signal: AbortSignal | null | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        controller.enqueue(encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'))
        controller.enqueue(encode('data: [DONE]\n\n'))
        controller.close()
      }, firstByteDelayMs)
      signal?.addEventListener(
        'abort',
        () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          controller.error(new DOMException('The operation was aborted.', 'AbortError'))
        },
        { once: true },
      )
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('redrobEngineStream connect timeout', () => {
  it('waits past the connect budget for a first token once headers have arrived', async () => {
    const delay = AI_CONNECT_TIMEOUT_MS * 1.5
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(slowFirstToken(delay, init.signal)),
    )

    const text: string[] = []
    const run = redrobEngineStream(
      AUTH,
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      256,
      callbacks((chunk) => text.push(chunk)),
    )

    await vi.advanceTimersByTimeAsync(delay + 1_000)
    await expect(run).resolves.toBeUndefined()
    expect(text.join('')).toBe('hi')
  })

  it('still fails when no headers ever arrive', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true },
          )
        }),
    )

    const run = redrobEngineStream(
      AUTH,
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      256,
      callbacks(() => {}),
    )
    const assertion = expect(run).rejects.toThrow(/timed out/i)

    await vi.advanceTimersByTimeAsync(AI_CONNECT_TIMEOUT_MS + 1_000)
    await assertion
  })
})
