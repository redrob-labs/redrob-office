import { AI_PROVIDERS } from './providers'
import { engineCapabilities } from './console-capabilities'
import { REDROB_CONSOLE_API_BASE, REDROB_ENGINE_MODEL, REDROB_ENGINE_ROUTE } from './redrob-engine'
import type { AiProviderConfig, AiProviderId, AiProviderMeta } from './types'

// Redrob Office runs on ONE engine (see redrob-office/AGENTS.md). This module
// used to hold GenOffice's per-vendor endpoint adapters with their vendor base
// URLs; those are gone. NO third-party vendor host / base-URL string remains
// here, and no adapter names a vendor. Every adapter's `resolveEndpoint` returns
// the single fixed Redrob Console base and ignores any caller-supplied base URL,
// so wiring it back into a fetch could not reach a third-party host.
//
// The per-id capability metadata (auth kind, `capabilities.vision`) and the
// model-family heuristics below are kept because the ported editors and their
// verbatim tests read them (e.g. apps/slides slide-qc.ts gates screenshots on
// capabilities.vision and modelLacksVision). They are declarative metadata /
// model-id heuristics, not routing: runtime routing is hard-pinned in
// ./redrob-engine.

/** The single wire protocol. The Console speaks an OpenAI-compatible surface. */
export type AiProtocol = 'openai-compatible'

export interface ProviderCapabilities {
  /** the single engine authenticates with a Redrob Console API key */
  auth: 'api-key'
  /** whether image input is accepted (declarative metadata the editors read) */
  vision: boolean
}

export interface ResolvedEndpoint {
  protocol: AiProtocol
  baseUrl: string
  /** the endpoint fixes its sampling and rejects a temperature field */
  omitTemperature?: boolean
  /** the endpoint wants the output cap as OpenAI's renamed `max_completion_tokens` */
  useMaxCompletionTokens?: boolean
  /** extra request fields merged into the chat-completions body */
  bodyExtras?: Record<string, unknown>
}

export interface ProviderAdapter {
  meta: AiProviderMeta
  capabilities: ProviderCapabilities
  /** always the fixed Redrob Console endpoint; the config (incl. any baseUrl) is ignored */
  resolveEndpoint(config: AiProviderConfig): ResolvedEndpoint
}

function metaOf(id: AiProviderId): AiProviderMeta {
  return AI_PROVIDERS.find((m) => m.id === id) ?? AI_PROVIDERS[0]!
}

/**
 * Model families that fix sampling and reject a temperature field. Kept as a
 * verbatim model-id heuristic the ported editors import; it names no vendor
 * endpoint. With one engine nothing forces this, but the shape is preserved.
 */
export function modelHasFixedSampling(model: string): boolean {
  return /(^|\/)(kimi-k3|gpt-5|gemini-3)/.test(model)
}

/**
 * Model ids that reject image input even under a vision-capable slot. Kept as a
 * verbatim model-id heuristic the ported editors import (apps/slides slide-qc.ts
 * gates screenshots on it); it names no vendor endpoint.
 *
 * The pinned engine route is answered by the Console instead of by this regex: it
 * publishes `imageInput` for the model this app actually sends, and a guess here
 * could only ever contradict it. The regex still answers for any OTHER id an
 * editor passes, so ported callers keep their upstream behaviour.
 */
export function modelLacksVision(model: string): boolean {
  if (model === REDROB_ENGINE_MODEL || model === REDROB_ENGINE_ROUTE) return !engineCapabilities().vision
  return /(^|\/)deep-?seek-v4-(?:pro(?:$|-)|flash(?!-vision))/.test(model)
}

/**
 * Interleaved-thinking model-id heuristic kept for the ported editors that
 * import it; declarative only, names no vendor endpoint.
 */
export function modelEchoesReasoning(model: string): boolean {
  return /(^|\/)(minimax-m|deep-?seek-v4)/i.test(model)
}

/** The single fixed Redrob Console endpoint. Never reads a caller base URL. */
function redrobEndpoint(): ResolvedEndpoint {
  return { protocol: 'openai-compatible', baseUrl: REDROB_CONSOLE_API_BASE }
}

/**
 * Per-id capability metadata.
 *
 * `vision` is no longer read out of this table for the running engine: every adapter
 * resolves to the one pinned Console route, so the honest answer is the one the
 * Console publishes for that route (`imageInput`), and this table is the fallback
 * for when the catalogue has not been read yet or could not be reached. It is a
 * getter rather than a value so a refresh is picked up without the editors -- which
 * read `capabilities.vision` as a plain property -- changing at all.
 *
 * The table itself is preserved because it still records what the upstream fork
 * declared per slot (`vision: false` for the text-only glm/qwen/minimax/mistral
 * ones), and dropping it would lose that history for no gain.
 */
const VISION_BY_ID: Record<AiProviderId, boolean> = {
  genspark: true,
  anthropic: true,
  gemini: true,
  deepseek: true,
  openai: true,
  kimi: true,
  glm: false,
  qwen: false,
  doubao: true,
  minimax: false,
  xai: true,
  mistral: false,
  openrouter: true,
  custom: true,
}

function adapterFor(id: AiProviderId): ProviderAdapter {
  const declared = VISION_BY_ID[id] ?? true
  return {
    meta: metaOf(id),
    capabilities: {
      auth: 'api-key',
      // The published value wins; `declared` is what applies until the catalogue is
      // read, and if it never is.
      get vision(): boolean {
        return engineCapabilities().vision && declared
      },
    },
    resolveEndpoint: redrobEndpoint,
  }
}

export const AI_PROVIDER_ADAPTERS: Record<AiProviderId, ProviderAdapter> = Object.fromEntries(
  (Object.keys(VISION_BY_ID) as AiProviderId[]).map((id) => [id, adapterFor(id)]),
) as Record<AiProviderId, ProviderAdapter>

/** Throws on ids not in the registry: settings files are user data and can carry anything. */
export function getProviderAdapter(provider: AiProviderId): ProviderAdapter {
  const adapter = AI_PROVIDER_ADAPTERS[provider]
  if (!adapter) throw new Error(`Unknown provider: ${provider}`)
  return adapter
}
