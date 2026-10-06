/**
 * Redrob-hosted image generation and search, against a contract Console does not serve yet.
 *
 * Console's API (verified 2026-10-06) has chat, models, translate and embeddings, but no
 * image or search route. These two tools are written against the routes Office asks
 * Console for in docs/console-requests/office-ai-routes.md:
 *
 *   POST /v1/images/generations   { model, prompt, n, size?, aspect_ratio?, reference_images?, response_format }
 *   POST /v1/search               { query, type: "web" | "images", max_results }
 *
 * Office holds no Console key (the engine does), so the request goes through the engine's
 * credentialed relay to Console, `ENGINE_CONSOLE_RELAY` below, which is part of the same
 * handoff. Until both exist, every call reports `HostedToolUnavailableError` with a plain
 * sentence, and support is cached briefly so a missing route is not asked about on every
 * tool call. Nothing here falls back to another provider.
 */
import { authHeaderFor, type EngineTarget, type FetchLike } from './engine-integration'
import { currentEngineTarget } from './engine-turn'

/** Engine route that forwards to Console with the engine's Redrob credential (requested). */
export const ENGINE_CONSOLE_RELAY = '/api/console/relay'

export const HOSTED_SUPPORT_TTL_MS = 10 * 60_000

export class HostedToolUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HostedToolUnavailableError'
  }
}

export type HostedTool = 'images' | 'search'

const UNAVAILABLE: Record<HostedTool, string> = {
  images: 'Image generation is not available from Redrob yet. Use image search or a picture from the document instead.',
  search: 'Redrob web search is not available yet.',
}

const ROUTE: Record<HostedTool, string> = { images: '/v1/images/generations', search: '/v1/search' }

let support: { at: number; value: Record<HostedTool, boolean | null> } = { at: 0, value: { images: null, search: null } }

/** Test seam. */
export function resetHostedToolSupport(): void {
  support = { at: 0, value: { images: null, search: null } }
}

function remember(tool: HostedTool, ok: boolean, now = Date.now()) {
  if (now - support.at > HOSTED_SUPPORT_TTL_MS) support = { at: now, value: { images: null, search: null } }
  support.value[tool] = ok
  support.at = now
}

/** What is known about each hosted tool: true, false, or null when not asked yet. */
export function hostedToolSupport(now = Date.now()): Record<HostedTool, boolean | null> {
  if (now - support.at > HOSTED_SUPPORT_TTL_MS) return { images: null, search: null }
  return { ...support.value }
}

type Deps = { target?: EngineTarget; fetch?: FetchLike }

async function relay(tool: HostedTool, body: unknown, deps: Deps, signal?: AbortSignal): Promise<unknown> {
  if (hostedToolSupport()[tool] === false) throw new HostedToolUnavailableError(UNAVAILABLE[tool])
  const target = deps.target ?? (await currentEngineTarget())
  const fetchImpl = deps.fetch ?? fetch
  const response = await fetchImpl(`${target.baseUrl}${ENGINE_CONSOLE_RELAY}${ROUTE[tool]}`, {
    method: 'POST',
    headers: { authorization: authHeaderFor(target), 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
  // a route that does not exist yet, on the engine or on Console
  if (response.status === 404 || response.status === 405 || response.status === 501) {
    remember(tool, false)
    throw new HostedToolUnavailableError(UNAVAILABLE[tool])
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const err = ((await response.json()) as { error?: { message?: unknown } }).error
      if (typeof err?.message === 'string') message = err.message.slice(0, 300)
    } catch {
      /* not JSON */
    }
    throw new Error(`Redrob could not complete this (${message}).`)
  }
  remember(tool, true)
  return response.json()
}

export type GenerateImageOptions = {
  prompt: string
  aspectRatio?: string | undefined
  size?: string | undefined
  referenceImageUrls?: string[] | undefined
}

/** One generated image, as a URL Console hosts or a data URL. */
export async function generateImage(options: GenerateImageOptions, deps: Deps = {}, signal?: AbortSignal): Promise<{ url: string }> {
  const prompt = options.prompt.trim()
  if (!prompt) throw new Error('prompt must not be empty')
  const body = {
    model: 'auto',
    prompt,
    n: 1,
    response_format: 'url',
    ...(options.size ? { size: options.size } : {}),
    ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
    ...(options.referenceImageUrls?.length ? { reference_images: options.referenceImageUrls.slice(0, 4) } : {}),
  }
  const data = (await relay('images', body, deps, signal)) as { data?: { url?: unknown; b64_json?: unknown }[] }
  const first = data.data?.[0]
  if (typeof first?.url === 'string' && /^https:\/\//i.test(first.url)) return { url: first.url }
  if (typeof first?.b64_json === 'string') return { url: `data:image/png;base64,${first.b64_json}` }
  throw new Error('Redrob returned no image.')
}

export type HostedWebResult = { title: string; url: string; snippet: string }
export type HostedImageResult = { title: string; imageUrl: string; sourceUrl: string; source: string; width?: number; height?: number }

export async function hostedWebSearch(query: string, maxResults = 6, deps: Deps = {}): Promise<{ results: HostedWebResult[]; answer?: string }> {
  const data = (await relay('search', { query, type: 'web', max_results: maxResults }, deps)) as {
    results?: { title?: unknown; url?: unknown; snippet?: unknown }[]
    answer?: unknown
  }
  const results = (data.results ?? [])
    .filter((r) => typeof r.url === 'string' && /^https?:\/\//i.test(r.url))
    .slice(0, maxResults)
    .map((r) => ({ title: String(r.title ?? ''), url: String(r.url), snippet: String(r.snippet ?? '') }))
  return typeof data.answer === 'string' && data.answer ? { results, answer: data.answer } : { results }
}

export async function hostedImageSearch(query: string, maxResults = 8, deps: Deps = {}): Promise<HostedImageResult[]> {
  const data = (await relay('search', { query, type: 'images', max_results: maxResults }, deps)) as {
    results?: { title?: unknown; image_url?: unknown; source_url?: unknown; source?: unknown; width?: unknown; height?: unknown }[]
  }
  return (data.results ?? [])
    .filter((r) => typeof r.image_url === 'string' && /^https:\/\//i.test(r.image_url))
    .slice(0, maxResults)
    .map((r) => ({
      title: String(r.title ?? ''),
      imageUrl: String(r.image_url),
      sourceUrl: String(r.source_url ?? ''),
      source: String(r.source ?? ''),
      ...(typeof r.width === 'number' ? { width: r.width } : {}),
      ...(typeof r.height === 'number' ? { height: r.height } : {}),
    }))
}
