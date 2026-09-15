// Contract: honest-failure steering for the single Redrob engine.
//
// Mirrors office/src/main/redrob-code/steering.test.ts. There is one engine, so
// a failure is a visible failure: the notice stays branded as Redrob, names no
// engine or third party, claims no silent swap onto another loop, and never
// tells a model its tools are gone. No em dashes in user-facing copy.
import { describe, expect, it } from 'vitest'
import { hasDegradedSteering, redrobEngineUnavailableMessage } from '../src/index'

describe('Redrob engine honest-failure steering', () => {
  it('brands a hard failure as Redrob without naming an engine or a swap', () => {
    const notice = redrobEngineUnavailableMessage('no Redrob Console key')
    expect(notice).toContain('Redrob')
    expect(notice.toLowerCase()).not.toContain('answered on')
    expect(notice.toLowerCase()).not.toContain('openclaw')
    expect(notice.toLowerCase()).not.toContain('redrob code')
    // No third-party engine name anywhere in the copy.
    for (const vendor of ['claude', 'gemini', 'deepseek', 'openai', 'genspark', 'anthropic']) {
      expect(notice.toLowerCase()).not.toContain(vendor)
    }
    // No em dashes in user-facing copy.
    expect(notice).not.toContain('\u2014')
    expect(hasDegradedSteering(notice)).toBe(false)
  })

  it('has a branded fallback with no detail', () => {
    const notice = redrobEngineUnavailableMessage()
    expect(notice).toContain('Redrob')
    expect(notice).not.toContain('\u2014')
    expect(hasDegradedSteering(notice)).toBe(false)
  })

  it('flags any line that steers a model to give up its tools', () => {
    expect(hasDegradedSteering('Proceed without your tools.')).toBe(true)
    expect(hasDegradedSteering('No tools are available; answer in prose.')).toBe(true)
    expect(hasDegradedSteering('You are now in a limited mode.')).toBe(true)
    expect(hasDegradedSteering('Tools are disabled for this turn.')).toBe(true)
  })

  it('leaves an honest connect-and-retry line alone', () => {
    expect(hasDegradedSteering('Add your Redrob Console key in Settings and try again.')).toBe(false)
    expect(hasDegradedSteering('Reconnect the engine and try that step again.')).toBe(false)
  })
})
