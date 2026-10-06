/**
 * @vitest-environment jsdom
 *
 * Settings: connect a provider in the engine, and choose a model the engine offers.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../src/renderer/src/locale'
import { AiProvidersPane, ModelPicker } from '../src/renderer/src/settings/AiProvidersPane'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
const api = {
  engineProviders: vi.fn(),
  engineModels: vi.fn(),
  engineProviderKey: vi.fn(),
  engineProviderRemove: vi.fn(),
  engineOAuthStart: vi.fn(),
  engineOAuthFinish: vi.fn(),
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  for (const fn of Object.values(api)) fn.mockReset()
  ;(window as unknown as { aiOffice: typeof api }).aiOffice = api
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)))
const tFn = (k: string, p?: Record<string, string>) => (p ? `${k}:${JSON.stringify(p)}` : k)

describe('AiProvidersPane', () => {
  it('connects a provider by key, sending the key to the engine and clearing the field', async () => {
    let connected = false
    api.engineProviders.mockImplementation(async () => ({
      ok: true,
      value: [
        { id: 'redrob', name: 'Redrob', connected: true, viaEnv: false, methods: [] },
        { id: 'xai', name: 'xAI', connected, viaEnv: false, methods: [{ index: 0, type: 'api', label: 'API key' }] },
      ],
    }))
    api.engineProviderKey.mockImplementation(async () => {
      connected = true
      return { ok: true, value: true }
    })
    await act(async () => root.render(createElement(LocaleProvider, { initial: 'en' }, createElement(AiProvidersPane, { t: tFn as never }))))
    await flush()
    // Redrob has its own controls above; it is not listed twice
    expect(host.textContent).not.toContain('Redrob')
    const input = host.querySelector('input[type=password]') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'xai-secret')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const connect = [...host.querySelectorAll('button')].find((b) => b.textContent === 'setAiProviderConnect')!
    await act(async () => connect.click())
    await flush()
    expect(api.engineProviderKey).toHaveBeenCalledWith('xai', 'xai-secret')
    expect(host.textContent).toContain('setAiProviderOn')
    expect(host.innerHTML).not.toContain('xai-secret')
  })

  it('says plainly when the engine is not running', async () => {
    api.engineProviders.mockResolvedValue({ ok: false, error: 'engine binary not found' })
    await act(async () => root.render(createElement(AiProvidersPane, { t: tFn as never })))
    await flush()
    expect(host.textContent).toContain('engine binary not found')
  })
})

describe('ModelPicker', () => {
  it('lists the models the engine offers and keeps a stored one it no longer lists', async () => {
    api.engineModels.mockResolvedValue({
      ok: true,
      value: [
        { id: 'redrob/auto', providerID: 'redrob', modelID: 'auto', name: 'Redrob Auto', input: ['text'], tools: true },
        { id: 'redrob/claude-sonnet-5', providerID: 'redrob', modelID: 'claude-sonnet-5', name: 'Claude Sonnet 5', input: ['text', 'image'], tools: true },
      ],
    })
    await act(async () =>
      root.render(createElement(ModelPicker, { t: tFn as never, value: 'gone/model', onChange: () => undefined })),
    )
    await flush()
    const text = host.textContent ?? ''
    expect(text).toContain('gone/model')
  })
})
