// Contract: NO third-party vendor host / base-URL string is present or reachable
// in the exported adapter / endpoint surface of @genoffice/ai-provider.
//
// Redrob Office runs on ONE engine (redrob-office/AGENTS.md): no BYOK, no
// provider selection, no configurable inference server URL, and no vendor base
// URL in the code paths. GenOffice shipped a full per-vendor endpoint catalog
// (api.anthropic.com, api.openai.com, openrouter.ai, ...); this test locks that
// the adapters have been collapsed to the single Redrob engine, so a vendor host
// reintroduced into resolveEndpoint (or the registry/providers source) is caught
// here rather than shipping silently.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  AI_PROVIDER_ADAPTERS,
  REDROB_CONSOLE_API_BASE,
  getProviderAdapter,
} from '../src/index'
import type { AiProviderId } from '../src/index'

// Every third-party vendor host GenOffice's BYOK layer could reach. None may
// appear in the exported adapter/endpoint surface or be returned by any adapter.
const VENDOR_HOSTS = [
  'api.anthropic.com',
  'api.openai.com',
  'api.deepseek.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'genspark.ai',
  'api.moonshot.ai',
  'api.moonshot.cn',
  'open.bigmodel.cn',
  'dashscope.aliyuncs.com',
  'ark.cn-beijing.volces.com',
  'api.minimax.io',
  'api.x.ai',
  'api.mistral.ai',
]

// Vendor product/display names that must not appear as a catalog label.
const VENDOR_LABELS = [
  'claude',
  'gemini',
  'openai',
  'deepseek',
  'openrouter',
  'genspark',
  'anthropic',
  'kimi',
  'moonshot',
  'qwen',
  'doubao',
  'minimax',
  'grok',
  'mistral',
]

// The full historical settings union: every id a hand-edited settings file can
// carry. Every one must resolve its endpoint to the single Redrob Console base.
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

describe('no third-party vendor host in the AI adapter surface', () => {
  it('resolveEndpoint only ever returns the fixed Redrob Console base', () => {
    for (const id of EVERY_PROVIDER_ID) {
      const adapter = getProviderAdapter(id)
      // a caller-supplied baseUrl (even a vendor host) must never be honored
      const resolved = adapter.resolveEndpoint({
        apiKey: 'rk-x',
        model: 'ignored',
        baseUrl: 'https://api.anthropic.com',
      })
      expect(resolved.baseUrl).toBe(REDROB_CONSOLE_API_BASE)
      for (const host of VENDOR_HOSTS) expect(resolved.baseUrl).not.toContain(host)
    }
  })

  it('AI_PROVIDER_ADAPTERS resolves every id to the Redrob-only endpoint', () => {
    for (const id of EVERY_PROVIDER_ID) {
      const resolved = AI_PROVIDER_ADAPTERS[id].resolveEndpoint({ apiKey: 'k', model: 'm' })
      expect(resolved.baseUrl).toBe(REDROB_CONSOLE_API_BASE)
    }
  })

  it('the provider catalog carries no vendor display label', () => {
    for (const meta of AI_PROVIDERS) {
      const label = meta.label.toLowerCase()
      for (const vendor of VENDOR_LABELS) expect(label).not.toContain(vendor)
    }
  })

  it('no vendor host string is present in the exported adapter/registry source', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const sources = ['registry.ts', 'providers.ts', 'index.ts', 'chat.ts', 'stream.ts'].map((f) =>
      readFileSync(join(here, '..', 'src', f), 'utf8').toLowerCase(),
    )
    for (const src of sources) {
      for (const host of VENDOR_HOSTS) {
        expect(src.includes(host)).toBe(false)
      }
    }
  })
})
