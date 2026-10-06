/** Office never keeps a provider key: every key is handed to the engine and dropped. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { custodyKeys, holdsKeys, integrationForSlot, withoutKeys } from '../src/key-custody'
import { defaultAiSettings } from '../src/providers'
import type { AiSettings } from '../src/types'
import { startFakeEngine, type FakeEngine } from './fake-engine'

let engine: FakeEngine
beforeEach(async () => {
  engine = await startFakeEngine()
})
afterEach(async () => {
  await engine.close()
})

function settingsWith(keys: Record<string, string>): AiSettings {
  const s = defaultAiSettings()
  for (const [slot, apiKey] of Object.entries(keys)) {
    ;(s.providers as Record<string, { apiKey: string; model: string; baseUrl?: string }>)[slot] = {
      apiKey,
      model: '',
      baseUrl: 'https://should-not-survive.test',
    }
  }
  return s
}

describe('key custody', () => {
  it('maps legacy slots to engine integrations', () => {
    expect(integrationForSlot('genspark')).toBe('redrob')
    expect(integrationForSlot('gemini')).toBe('google')
    expect(integrationForSlot('anthropic')).toBe('anthropic')
    expect(integrationForSlot('custom')).toBeNull()
  })

  it('hands every key to the engine and returns settings that hold none', async () => {
    const settings = settingsWith({ genspark: 'rrk_a_b', anthropic: 'sk-ant', custom: 'sk-custom' })
    expect(holdsKeys(settings)).toBe(true)
    const result = await custodyKeys(settings, { baseUrl: engine.baseUrl, username: engine.username, password: engine.password })
    expect(engine.keys.map((k) => k.integration).sort()).toEqual(['anthropic', 'redrob'])
    expect(result.dropped).toEqual(['custom'])
    expect(holdsKeys(result.settings)).toBe(false)
    const text = JSON.stringify(result.settings)
    expect(text).not.toContain('rrk_a_b')
    expect(text).not.toContain('sk-ant')
    // a base URL is never honoured, so it is not kept either
    expect(text).not.toContain('should-not-survive')
  })

  it('throws, keeping nothing half-done for the caller to write, when the engine refuses', async () => {
    const settings = settingsWith({ genspark: 'rrk_a_b' })
    await expect(custodyKeys(settings, { baseUrl: engine.baseUrl, username: 'wrong', password: 'creds' })).rejects.toThrow()
  })

  it('withoutKeys blanks every slot', () => {
    expect(holdsKeys(withoutKeys(settingsWith({ openai: 'sk-x' })))).toBe(false)
  })
})
