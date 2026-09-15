import { describe, expect, it } from 'vitest'

import {
  formatUserCode,
  pollDeviceToken,
  runDeviceConnect,
  startDeviceAuthorization,
  type DeviceAuthorization,
  type DeviceConnectDeps,
} from '../src/device-connect'
import { REDROB_CONSOLE_API_BASE } from '../src/redrob-engine'

type Answer = { status: number; body: unknown } | { throws: true }

/**
 * A recording Console. Each queued answer is consumed by one request, so a test that
 * expects three polls fails loudly if the loop makes two or four.
 */
function consoleStub(answers: Answer[]) {
  const calls: { url: string; body: unknown }[] = []
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, body: JSON.parse(String(init.body)) as unknown })
    const answer = answers.shift()
    if (!answer) throw new Error(`unexpected request to ${url}`)
    if ('throws' in answer) throw new Error('network down')
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body,
    } as Response
  }
  return { calls, fetchImpl, remaining: () => answers.length }
}

function deps(fetchImpl: DeviceConnectDeps['fetch']) {
  const waits: number[] = []
  let clock = 0
  return {
    waits,
    now: () => clock,
    deps: {
      fetch: fetchImpl,
      now: () => clock,
      // Time only moves when the loop waits, so expiry is exact rather than flaky.
      sleep: async (ms: number) => {
        waits.push(ms)
        clock += ms
      },
    } satisfies DeviceConnectDeps,
  }
}

const authorization: DeviceAuthorization = {
  deviceCode: 'device-code-value',
  userCode: 'K7QM2XR9',
  verificationUri: 'https://console.redrob.ai/connect',
  verificationUriComplete: 'https://console.redrob.ai/connect?code=K7QM-2XR9',
  expiresIn: 600,
  interval: 5,
}

describe('startDeviceAuthorization', () => {
  it('posts the product to Console and returns the codes', async () => {
    const stub = consoleStub([
      {
        status: 200,
        body: {
          deviceCode: 'dc',
          userCode: 'ABCD2345',
          verificationUri: 'https://console.redrob.ai/connect',
          verificationUriComplete: 'https://console.redrob.ai/connect?code=ABCD-2345',
          expiresIn: 600,
          interval: 5,
        },
      },
    ])

    const result = await startDeviceAuthorization('office', { fetch: stub.fetchImpl })

    expect(stub.calls[0]?.url).toBe(`${REDROB_CONSOLE_API_BASE}/device/authorize`)
    expect(stub.calls[0]?.body).toEqual({ product: 'office' })
    expect(result.userCode).toBe('ABCD2345')
    expect(result.interval).toBe(5)
  })

  it('refuses an incomplete authorization instead of polling forever', async () => {
    const stub = consoleStub([{ status: 200, body: { userCode: 'ABCD2345' } }])
    await expect(startDeviceAuthorization('office', { fetch: stub.fetchImpl })).rejects.toThrow(
      /incomplete device authorization/,
    )
  })
})

describe('runDeviceConnect', () => {
  it('waits before the first poll, then returns the key', async () => {
    const stub = consoleStub([
      { status: 400, body: { error: 'authorization_pending' } },
      { status: 200, body: { apiKey: 'rrk_prefix_secret', accountName: 'Redrob' } },
    ])
    const clock = deps(stub.fetchImpl)

    const outcome = await runDeviceConnect({ authorization, deps: clock.deps })

    expect(clock.waits[0]).toBe(5000)
    expect(stub.calls).toHaveLength(2)
    expect(stub.calls[0]?.body).toEqual({ deviceCode: 'device-code-value' })
    expect(outcome).toEqual({
      status: 'connected',
      key: { apiKey: 'rrk_prefix_secret', accountName: 'Redrob' },
    })
  })

  it('doubles the interval on slow_down, up to the cap', async () => {
    const stub = consoleStub([
      { status: 400, body: { error: 'slow_down' } },
      { status: 400, body: { error: 'slow_down' } },
      { status: 400, body: { error: 'slow_down' } },
      { status: 400, body: { error: 'slow_down' } },
      { status: 200, body: { apiKey: 'rrk_prefix_secret' } },
    ])
    const clock = deps(stub.fetchImpl)

    await runDeviceConnect({ authorization, deps: clock.deps })

    expect(clock.waits).toEqual([5000, 10_000, 20_000, 30_000, 30_000])
  })

  it('stops on a denial rather than retrying it', async () => {
    const stub = consoleStub([{ status: 403, body: { error: 'access_denied' } }])
    const clock = deps(stub.fetchImpl)

    expect(await runDeviceConnect({ authorization, deps: clock.deps })).toEqual({ status: 'denied' })
    expect(stub.remaining()).toBe(0)
  })

  it('stops when Console says the code expired', async () => {
    const stub = consoleStub([{ status: 400, body: { error: 'expired_token' } }])
    const clock = deps(stub.fetchImpl)

    expect(await runDeviceConnect({ authorization, deps: clock.deps })).toEqual({
      status: 'expired',
    })
  })

  it('reports an unknown refusal by its code instead of looping', async () => {
    const stub = consoleStub([{ status: 400, body: { error: 'invalid_grant' } }])
    const clock = deps(stub.fetchImpl)

    expect(await runDeviceConnect({ authorization, deps: clock.deps })).toEqual({
      status: 'failed',
      code: 'invalid_grant',
    })
  })

  it('treats a key-less success as a failure, not a connection', async () => {
    const stub = consoleStub([{ status: 200, body: { accountName: 'Redrob' } }])
    const clock = deps(stub.fetchImpl)

    expect(await runDeviceConnect({ authorization, deps: clock.deps })).toEqual({
      status: 'failed',
      code: 'missing_key',
    })
  })

  it('gives up after five consecutive unreachable polls', async () => {
    const stub = consoleStub([
      { throws: true },
      { throws: true },
      { throws: true },
      { throws: true },
      { throws: true },
    ])
    const clock = deps(stub.fetchImpl)

    expect(await runDeviceConnect({ authorization, deps: clock.deps })).toEqual({
      status: 'unreachable',
      attempts: 5,
    })
  })

  it('keeps going when a network blip is followed by a real answer', async () => {
    const stub = consoleStub([
      { throws: true },
      { status: 400, body: { error: 'authorization_pending' } },
      { throws: true },
      { status: 200, body: { apiKey: 'rrk_prefix_secret' } },
    ])
    const clock = deps(stub.fetchImpl)

    expect(await runDeviceConnect({ authorization, deps: clock.deps })).toEqual({
      status: 'connected',
      key: { apiKey: 'rrk_prefix_secret' },
    })
  })

  it('retries a 5xx as unreachable rather than calling it a verdict', async () => {
    const stub = consoleStub([{ status: 503, body: {} }])
    const answer = await pollDeviceToken('dc', { fetch: stub.fetchImpl })
    expect(answer).toEqual({ kind: 'unreachable' })
  })

  it('expires on its own once the deadline passes', async () => {
    const answers: Answer[] = Array.from({ length: 200 }, () => ({
      status: 400 as const,
      body: { error: 'authorization_pending' },
    }))
    const stub = consoleStub(answers)
    const clock = deps(stub.fetchImpl)

    // 60s of validity against a 5s interval. The deadline is checked after each wait
    // and before the poll, so the wait that lands exactly on 60s expires instead of
    // polling: eleven polls at 5s..55s, then expiry.
    expect(
      await runDeviceConnect({
        authorization: { ...authorization, expiresIn: 60 },
        deps: clock.deps,
      }),
    ).toEqual({ status: 'expired' })
    expect(stub.calls).toHaveLength(11)
  })

  it('stops when the host cancels, without polling again', async () => {
    const stub = consoleStub([{ status: 400, body: { error: 'authorization_pending' } }])
    const clock = deps(stub.fetchImpl)
    let cancelled = false

    const outcome = await runDeviceConnect({
      authorization,
      deps: clock.deps,
      isCancelled: () => {
        const now = cancelled
        cancelled = true
        return now
      },
    })

    expect(outcome).toEqual({ status: 'cancelled' })
    expect(stub.calls).toHaveLength(0)
  })
})

describe('formatUserCode', () => {
  it('groups eight characters and drops anything else', () => {
    expect(formatUserCode('k7qm2xr9')).toBe('K7QM-2XR9')
    expect(formatUserCode('K7QM-2XR9')).toBe('K7QM-2XR9')
    expect(formatUserCode('k7q')).toBe('K7Q')
    expect(formatUserCode('K7QM2XR9EXTRA')).toBe('K7QM-2XR9')
  })
})
