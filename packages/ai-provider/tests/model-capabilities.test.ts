/** Per-model capabilities from the engine, and the image-model declaration for Console models. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  engineCapabilities,
  imageModelsFromCatalogue,
  resetEngineCapabilitiesCache,
  setModelCapabilities,
} from '../src/console-capabilities'
import { officeEngineConfig } from '../src/engine-client'
import { setEngineTargetProvider } from '../src/engine-turn'
import { readModelCapabilities } from '../src/model-capabilities'
import { modelLacksVision } from '../src/registry'
import { startFakeEngine, type FakeEngine } from './fake-engine'

let engine: FakeEngine
beforeEach(async () => {
  resetEngineCapabilitiesCache()
  engine = await startFakeEngine()
  setEngineTargetProvider(async () => ({ baseUrl: engine.baseUrl, username: engine.username, password: engine.password }))
})
afterEach(async () => {
  setEngineTargetProvider(null)
  resetEngineCapabilitiesCache()
  await engine.close()
})

describe('model capabilities', () => {
  it('reads what the engine reports for the selected model', async () => {
    expect((await readModelCapabilities('redrob/claude-sonnet-5')).vision).toBe(true)
    expect((await readModelCapabilities('auto')).vision).toBe(false)
    expect(modelLacksVision('claude-sonnet-5')).toBe(false)
    expect(modelLacksVision('redrob/auto')).toBe(true)
  })

  it('a renderer primed over IPC answers the same', () => {
    setModelCapabilities('openai/gpt-x', { vision: false, tools: true, structuredOutputs: false, maxOutputTokens: null, thinkingLevels: [] })
    expect(modelLacksVision('openai/gpt-x')).toBe(true)
    expect(engineCapabilities('openai/gpt-x').vision).toBe(false)
  })

  it('falls back to defaults when the engine cannot be asked', async () => {
    setEngineTargetProvider(null)
    expect(await readModelCapabilities('redrob/auto')).toEqual(engineCapabilities())
  })
})

describe('image models for the engine', () => {
  it('lists the Console models that publish imageInput', () => {
    const ids = imageModelsFromCatalogue({
      models: [
        { id: 'auto', capabilities: { imageInput: true } },
        { id: 'text-only', capabilities: { imageInput: false } },
        { id: 'claude-sonnet-5', capabilities: { imageInput: true } },
      ],
    })
    expect(ids).toEqual(['auto', 'claude-sonnet-5'])
  })

  it('declares their image input in the inline engine config', () => {
    const cfg = officeEngineConfig(['claude-sonnet-5']) as { provider: { redrob: { models: Record<string, { modalities: { input: string[] } }> } } }
    expect(cfg.provider.redrob.models['claude-sonnet-5']!.modalities.input).toEqual(['text', 'image'])
    expect('provider' in officeEngineConfig([])).toBe(false)
  })
})
