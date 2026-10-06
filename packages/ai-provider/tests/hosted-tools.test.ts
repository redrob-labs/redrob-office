/** Image generation and hosted search against the requested Console contract. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setEngineTargetProvider } from '../src/engine-turn'
import {
  HostedToolUnavailableError,
  generateImage,
  hostedImageSearch,
  hostedToolSupport,
  hostedWebSearch,
  resetHostedToolSupport,
} from '../src/hosted-tools'
import { hasDegradedSteering } from '../src/redrob-engine'
import { startFakeEngine, type FakeEngine } from './fake-engine'

let engine: FakeEngine
beforeEach(async () => {
  resetHostedToolSupport()
  engine = await startFakeEngine()
  setEngineTargetProvider(async () => ({ baseUrl: engine.baseUrl, username: engine.username, password: engine.password }))
})
afterEach(async () => {
  setEngineTargetProvider(null)
  await engine.close()
})

describe('while Console does not serve the routes', () => {
  it('image generation reports an honest, non-degrading unavailable error and remembers it', async () => {
    const err = (await generateImage({ prompt: 'a cat' }).catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(HostedToolUnavailableError)
    expect(err.message).toMatch(/not available from Redrob yet/)
    expect(hasDegradedSteering(err.message)).toBe(false)
    expect(hostedToolSupport().images).toBe(false)
    const before = engine.requests.length
    await expect(generateImage({ prompt: 'again' })).rejects.toBeInstanceOf(HostedToolUnavailableError)
    // cached: the missing route is not asked again
    expect(engine.requests.length).toBe(before)
  })

  it('search reports unavailable, so callers fall back to the keyless chain', async () => {
    await expect(hostedWebSearch('x')).rejects.toBeInstanceOf(HostedToolUnavailableError)
  })
})

describe('once Console serves them', () => {
  it('generates an image through the engine relay', async () => {
    let sent: unknown
    engine.relayRoutes.set('/v1/images/generations', (body) => {
      sent = body
      return { data: [{ url: 'https://cdn.redrob.test/img.png' }] }
    })
    expect(await generateImage({ prompt: 'a cat', aspectRatio: '16:9' })).toEqual({ url: 'https://cdn.redrob.test/img.png' })
    expect(sent).toEqual({ model: 'auto', prompt: 'a cat', n: 1, response_format: 'url', aspect_ratio: '16:9' })
  })

  it('accepts base64 and refuses non-https URLs', async () => {
    engine.relayRoutes.set('/v1/images/generations', () => ({ data: [{ b64_json: 'AAA' }] }))
    expect((await generateImage({ prompt: 'x' })).url).toBe('data:image/png;base64,AAA')
    engine.relayRoutes.set('/v1/images/generations', () => ({ data: [{ url: 'http://insecure.test/a.png' }] }))
    await expect(generateImage({ prompt: 'x' })).rejects.toThrow(/no image/)
  })

  it('searches the web and images', async () => {
    engine.relayRoutes.set('/v1/search', (body) =>
      (body as { type: string }).type === 'web'
        ? { results: [{ title: 'A', url: 'https://a.test', snippet: 's' }, { title: 'bad', url: 'javascript:alert(1)' }], answer: 'yes' }
        : { results: [{ title: 'P', image_url: 'https://img.test/p.jpg', source_url: 'https://p.test', source: 'p.test', width: 10 }] },
    )
    expect(await hostedWebSearch('q')).toEqual({ results: [{ title: 'A', url: 'https://a.test', snippet: 's' }], answer: 'yes' })
    expect(await hostedImageSearch('q')).toEqual([
      { title: 'P', imageUrl: 'https://img.test/p.jpg', sourceUrl: 'https://p.test', source: 'p.test', width: 10 },
    ])
  })
})
