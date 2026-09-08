// Contract: fresh / normalized AI settings may leave model empty.
//
// The Redrob engine always wires `auto` and ignores settings.model, so
// defaultAiSettings and resolveAiSettings must keep an empty model rather than
// inventing a legacy id, and an empty model must not be treated as misconfigured
// at the settings layer.
import { describe, expect, it } from 'vitest'
import {
  REDROB_ENGINE_ID,
  REDROB_ENGINE_MODEL,
  defaultAiSettings,
  resolveAiSettings,
} from '../src/index'

describe('AI settings normalize with empty model', () => {
  it('fresh defaults leave the Redrob slot model empty', () => {
    const settings = defaultAiSettings()
    expect(settings.provider).toBe(REDROB_ENGINE_ID)
    expect(settings.providers[REDROB_ENGINE_ID].model).toBe('')
    expect(REDROB_ENGINE_MODEL).toBe('auto')
  })

  it('resolveAiSettings keeps an empty model from disk / defaults', () => {
    const settings = resolveAiSettings({}, defaultAiSettings())
    expect(settings.provider).toBe(REDROB_ENGINE_ID)
    expect(settings.providers[REDROB_ENGINE_ID].model).toBe('')
  })

  it('resolveAiSettings does not invent a legacy redrob-ai model id', () => {
    const settings = resolveAiSettings(
      {
        providers: {
          ...defaultAiSettings().providers,
          genspark: { apiKey: 'rk-x', model: '' },
        },
      },
      defaultAiSettings(),
    )
    expect(settings.providers.genspark.model).toBe('')
    expect(settings.providers.genspark.model).not.toBe('redrob-ai')
  })
})
