// Contract: what the pinned engine route accepts is answered by the Console, not guessed here.
//
// Redrob Office sends exactly one model id (`auto`, route `redrob/auto`), and that id appears in
// neither the per-provider VISION_BY_ID table nor the modelLacksVision regex the ported editors
// read -- so before this the answer came from a default. The Console publishes `imageInput` for that
// route, so it is read from there, and the defaults apply only when it cannot be reached.
//
// This adds no model picker and no provider selection: the tests below assert one fixed URL is read
// and one question answered.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FALLBACK_ENGINE_CAPABILITIES,
  engineCapabilities,
  loadEngineCapabilities,
  resetEngineCapabilitiesCache,
  selectEngineCapabilities,
} from '../src/console-capabilities'
import { AI_PROVIDER_ADAPTERS, modelLacksVision } from '../src/registry'
import { REDROB_CONSOLE_API_BASE, REDROB_ENGINE_MODEL, REDROB_ENGINE_ROUTE } from '../src/redrob-engine'

const catalogue = (capabilities: Record<string, unknown>) => ({
  autoModelId: 'auto',
  models: [
    { id: 'some-other-model', capabilities: { imageInput: false } },
    { id: 'auto', capabilities },
  ],
})

/** The shape the live Console publishes for `auto`, trimmed to what this app reads. */
const publishedAuto = {
  imageInput: true,
  audioInput: true,
  fileInput: true,
  videoInput: true,
  tools: true,
  structuredOutputs: true,
  maxOutputTokens: 1_800_000,
  thinkingLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
}

describe('published engine capabilities', () => {
  beforeEach(() => resetEngineCapabilitiesCache())
  afterEach(() => {
    vi.unstubAllGlobals()
    resetEngineCapabilitiesCache()
  })

  it('reads the pinned route out of the catalogue, not the first entry', () => {
    const selected = selectEngineCapabilities(catalogue(publishedAuto))
    expect(selected.vision).toBe(true)
    expect(selected.maxOutputTokens).toBe(1_800_000)
    expect(selected.thinkingLevels).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(selected.structuredOutputs).toBe(true)
  })

  it('falls back per field, so an unfamiliar catalogue does not take the rest down', () => {
    // A Console that drops a field this app reads must not turn every other answer into a guess.
    const selected = selectEngineCapabilities(catalogue({ imageInput: false }))
    expect(selected.vision).toBe(false)
    expect(selected.tools).toBe(FALLBACK_ENGINE_CAPABILITIES.tools)
    expect(selected.maxOutputTokens).toBeNull()
    expect(selected.thinkingLevels).toEqual([])
  })

  it('falls back entirely when the pinned route is absent or the payload is unrecognisable', () => {
    expect(selectEngineCapabilities({ models: [{ id: 'not-auto', capabilities: { imageInput: false } }] })).toEqual(
      FALLBACK_ENGINE_CAPABILITIES,
    )
    expect(selectEngineCapabilities(null)).toEqual(FALLBACK_ENGINE_CAPABILITIES)
    expect(selectEngineCapabilities({ models: 'nonsense' })).toEqual(FALLBACK_ENGINE_CAPABILITIES)
  })

  it('reads one fixed unauthenticated URL', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(catalogue(publishedAuto)), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await loadEngineCapabilities({ force: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${REDROB_CONSOLE_API_BASE}/pricing`)
    expect(init.method).toBe('GET')
    // No key is sent: the catalogue is public, so an editor knows what the engine accepts before a
    // key is entered.
    expect(init.headers).toBeUndefined()
  })

  it('serves the cache within the TTL and shares one in-flight request', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(catalogue(publishedAuto)), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([loadEngineCapabilities(), loadEngineCapabilities()])
    await loadEngineCapabilities()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
  })

  it('resolves to the defaults when the Console cannot be read, rather than rejecting', async () => {
    // An editor must open with no network. Nothing upstream of this could act on the error.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    await expect(loadEngineCapabilities({ force: true })).resolves.toEqual(FALLBACK_ENGINE_CAPABILITIES)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET')
      }),
    )
    await expect(loadEngineCapabilities({ force: true })).resolves.toEqual(FALLBACK_ENGINE_CAPABILITIES)
  })
})

describe('the editors see the published answer', () => {
  beforeEach(() => resetEngineCapabilitiesCache())
  afterEach(() => {
    vi.unstubAllGlobals()
    resetEngineCapabilitiesCache()
  })

  it('gates attachments on the published imageInput for the pinned route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(catalogue({ imageInput: false })), { status: 200 })))
    await loadEngineCapabilities({ force: true })

    expect(engineCapabilities().vision).toBe(false)
    // Both spellings the editors use for the one route.
    expect(modelLacksVision(REDROB_ENGINE_MODEL)).toBe(true)
    expect(modelLacksVision(REDROB_ENGINE_ROUTE)).toBe(true)
    // capabilities.vision is a plain property read in the editors; it must follow without them
    // changing at all.
    expect(AI_PROVIDER_ADAPTERS.openai.capabilities.vision).toBe(false)
  })

  it('keeps the upstream regex for any other id an editor passes', () => {
    // Only the pinned route is the Console's to answer; ported callers keep their behaviour.
    expect(modelLacksVision('deepseek-v4-pro')).toBe(true)
    expect(modelLacksVision('gpt-5')).toBe(false)
  })

  it('applies the conservative default before the catalogue has been read', () => {
    expect(engineCapabilities()).toEqual(FALLBACK_ENGINE_CAPABILITIES)
    expect(modelLacksVision(REDROB_ENGINE_MODEL)).toBe(false)
  })
})
