/**
 * The engine's capabilities, as the Console publishes them.
 *
 * Redrob Office runs on ONE engine and pins the route to `redrob/auto` (see
 * redrob-office/AGENTS.md and ./redrob-engine). What that route can accept is therefore not this
 * app's decision to make -- it is the Console's, and the Console publishes it: GET
 * `${REDROB_CONSOLE_API_BASE}/pricing` returns per model a `capabilities` block with
 * `imageInput`, `audioInput`, `fileInput`, `videoInput`, `tools`, `structuredOutputs`,
 * `maxOutputTokens` and `thinkingLevels`.
 *
 * Before this, the editors read `capabilities.vision` out of a per-provider-id table inherited from
 * the upstream fork (`genspark: true, glm: false, ...`) plus a `modelLacksVision` regex over model
 * ids. Neither could ever be right here: this app sends exactly one model id, and that id is not in
 * either table, so the answer came from a default rather than from the engine. The published value
 * for `auto` is `imageInput: true`, which the fallback `vision: true` happened to agree with -- but
 * agreeing by luck is not the same as knowing, and the day the route's backing models change, only
 * the published value moves.
 *
 * This module adds NO model picker, NO provider selection and NO configurable base URL. It reads one
 * fixed URL and answers one question about the pinned route.
 *
 * Failure is not an error state here. With no network, no key, or a Console that changed shape, the
 * conservative defaults below apply and the editors behave exactly as they did before. An editor
 * that cannot reach the Console must still open.
 */

import { aiFetch } from './fetch'
import { REDROB_CONSOLE_API_BASE, REDROB_ENGINE_MODEL } from './redrob-engine'

/** What the editors ask about the engine. */
export interface EngineCapabilities {
  /** image input, from the published `imageInput` */
  vision: boolean
  tools: boolean
  structuredOutputs: boolean
  /** published reply cap, or null when the Console publishes none */
  maxOutputTokens: number | null
  /** published thinking levels, empty when the route offers no thinking control */
  thinkingLevels: readonly string[]
}

/**
 * Applied when the Console cannot be read.
 *
 * `vision: true` matches what the per-id table defaulted to for this route, so a failed fetch does
 * not change behaviour that already shipped. The rest are the safe answers: claiming a capability
 * the engine lacks turns a missing button into a failed request.
 */
export const FALLBACK_ENGINE_CAPABILITIES: EngineCapabilities = {
  vision: true,
  tools: true,
  structuredOutputs: false,
  maxOutputTokens: null,
  thinkingLevels: [],
}

interface PublishedCapabilities {
  imageInput?: unknown
  tools?: unknown
  structuredOutputs?: unknown
  maxOutputTokens?: unknown
  thinkingLevels?: unknown
}

interface PublishedModel {
  id?: unknown
  capabilities?: PublishedCapabilities
}

const boolOr = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

/**
 * The capabilities of one model out of a published catalogue.
 *
 * Every field falls back independently: a Console that adds a field this app has not heard of, or
 * drops one it has, must not take the others down with it.
 */
export function selectEngineCapabilities(payload: unknown, modelId = REDROB_ENGINE_MODEL): EngineCapabilities {
  const models = (payload as { models?: unknown })?.models
  const list: PublishedModel[] = Array.isArray(models)
    ? (models as PublishedModel[])
    : Array.isArray(payload)
      ? (payload as PublishedModel[])
      : []
  const model = list.find((candidate) => candidate?.id === modelId)
  const published = model?.capabilities
  if (!published) return FALLBACK_ENGINE_CAPABILITIES

  const levels = Array.isArray(published.thinkingLevels)
    ? published.thinkingLevels.filter((level): level is string => typeof level === 'string')
    : FALLBACK_ENGINE_CAPABILITIES.thinkingLevels

  return {
    vision: boolOr(published.imageInput, FALLBACK_ENGINE_CAPABILITIES.vision),
    tools: boolOr(published.tools, FALLBACK_ENGINE_CAPABILITIES.tools),
    structuredOutputs: boolOr(published.structuredOutputs, FALLBACK_ENGINE_CAPABILITIES.structuredOutputs),
    maxOutputTokens:
      typeof published.maxOutputTokens === 'number' && Number.isFinite(published.maxOutputTokens)
        ? published.maxOutputTokens
        : FALLBACK_ENGINE_CAPABILITIES.maxOutputTokens,
    thinkingLevels: levels,
  }
}

/** Cache lifetime. The catalogue changes on the Console's release cadence, not per request. */
export const ENGINE_CAPABILITIES_TTL_MS = 60 * 60 * 1000

let cached: { value: EngineCapabilities; at: number } | null = null
let inFlight: Promise<EngineCapabilities> | null = null

/**
 * Capabilities the engine reported per `provider/model` id (`GET /api/model`). Filled by
 * `setModelCapabilities`: in a main process from the engine, in a renderer from what its
 * main process answered over `ai:capabilities`.
 */
const perModel = new Map<string, EngineCapabilities>()

export function setModelCapabilities(model: string, value: EngineCapabilities): void {
  perModel.set(model, value)
}

/** What the engine said about `model`, or null when it has not been asked. */
export function modelCapabilities(model: string): EngineCapabilities | null {
  return perModel.get(model) ?? null
}

/**
 * The capabilities for `model` (default route when omitted): the engine's per-model
 * answer when known, else the Console catalogue for the default route, else the
 * conservative defaults.
 */
export function engineCapabilities(model?: string): EngineCapabilities {
  if (model) {
    const known = perModel.get(model)
    if (known) return known
  }
  return perModel.get('redrob/auto') ?? cached?.value ?? FALLBACK_ENGINE_CAPABILITIES
}

/** Engine model -> the capabilities Office asks about. */
export function capabilitiesFromEngineModel(model: {
  input: string[]
  tools: boolean
  outputTokens: number | null
}): EngineCapabilities {
  return {
    vision: model.input.includes('image'),
    tools: model.tools,
    structuredOutputs: false,
    maxOutputTokens: model.outputTokens,
    thinkingLevels: [],
  }
}

/**
 * Console model ids that read images, from the public catalogue (`GET /v1/pricing`).
 *
 * Engine v0.0.12 lists every Console model as text-only and strips image parts for it,
 * so Office tells the engine which ones read images (docs/engine-api.md). An unreachable
 * catalogue yields `fallback`.
 */
export function imageModelsFromCatalogue(payload: unknown): string[] {
  const models = (payload as { models?: unknown })?.models
  if (!Array.isArray(models)) return []
  return models
    .filter((m): m is PublishedModel => typeof m === 'object' && m !== null)
    .filter((m) => typeof m.id === 'string' && m.capabilities?.imageInput === true)
    .map((m) => m.id as string)
}

export async function fetchConsoleImageModels(options: { timeoutMs?: number; fallback?: string[] } = {}): Promise<string[]> {
  const fallback = options.fallback ?? [REDROB_ENGINE_MODEL]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000)
  try {
    const response = await aiFetch(`${REDROB_CONSOLE_API_BASE}/pricing`, { method: 'GET', signal: controller.signal })
    if (!response.ok) return fallback
    const ids = imageModelsFromCatalogue(await response.json())
    return ids.length ? ids : fallback
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Refresh the cache, returning what the editors should use either way.
 *
 * Concurrent callers share one request, and a failure resolves to the defaults rather than
 * rejecting: no caller of this is in a position to do anything useful with the error, and an editor
 * must not fail to open because a catalogue was unreachable.
 */
export async function loadEngineCapabilities(options: { force?: boolean; now?: number } = {}): Promise<EngineCapabilities> {
  const now = options.now ?? Date.now()
  if (!options.force && cached && now - cached.at < ENGINE_CAPABILITIES_TTL_MS) return cached.value
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      // Unauthenticated: the catalogue is public, so an editor can know what the engine accepts
      // before a key is entered.
      const response = await aiFetch(`${REDROB_CONSOLE_API_BASE}/pricing`, { method: 'GET' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const value = selectEngineCapabilities(await response.json())
      cached = { value, at: now }
      return value
    } catch (error) {
      console.warn('[ai-provider] the engine catalogue could not be read, using conservative defaults:', String(error))
      return FALLBACK_ENGINE_CAPABILITIES
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Test seam: drops the cache so a case cannot inherit another's fetch. */
export function resetEngineCapabilitiesCache(): void {
  cached = null
  inFlight = null
  perModel.clear()
}
