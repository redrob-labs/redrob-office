/**
 * Looking at images and listening to audio, without a separate media service.
 *
 * These used to be Genspark tools. Console reads `image_url` and `input_audio` parts on a
 * normal chat turn and routes such a request only to a model that can take them, so a
 * media question is a chat turn on the engine with the media attached. The model must
 * say it reads that kind of input; when no available model does, the caller gets a
 * plain error saying so, and nothing is sent.
 */
import type { AgentImage } from '@genoffice/agent-core'

import { capabilitiesFromEngineModel, setModelCapabilities } from './console-capabilities'
import { EngineClient, type EngineModel } from './engine-client'
import { DEFAULT_ENGINE_MODEL, engineModelOf } from './engine-model'
import { currentEngineTarget, engineStream } from './engine-turn'

export const MEDIA_MAX_BYTES = 20 * 1024 * 1024
const MEDIA_MAX_ITEMS = 8

export class MediaUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaUnavailableError'
  }
}

export type MediaKind = 'image' | 'audio'

const AUDIO_EXT: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav' }
const IMAGE_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

function kindOf(mime: string): MediaKind | null {
  if (/^image\/(png|jpe?g|gif|webp)$/i.test(mime)) return 'image'
  if (/^audio\/(mpeg|mp3|wav|x-wav|wave)$/i.test(mime)) return 'audio'
  return null
}

export type FetchMedia = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Load one media reference as base64. Only `data:` and `https:` URLs are accepted: a
 * renderer must not be able to ask the main process to read an arbitrary local file.
 */
export async function loadMedia(url: string, fetchImpl: FetchMedia = fetch): Promise<AgentImage & { kind: MediaKind }> {
  const data = /^data:([^;,]+);base64,(.+)$/s.exec(url)
  if (data) {
    const mime = data[1]!.toLowerCase()
    const kind = kindOf(mime)
    if (!kind) throw new MediaUnavailableError(`This kind of file cannot be read: ${mime}`)
    if (data[2]!.length * 0.75 > MEDIA_MAX_BYTES) throw new MediaUnavailableError('That file is too large to read.')
    return { base64: data[2]!, mime, kind }
  }
  if (!/^https:\/\//i.test(url)) throw new MediaUnavailableError('Only web (https) and attached files can be read.')
  const response = await fetchImpl(url)
  if (!response.ok) throw new MediaUnavailableError(`The file could not be downloaded (HTTP ${response.status}).`)
  const declared = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  const ext = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? ''
  const mime = kindOf(declared) ? declared : (IMAGE_EXT[ext] ?? AUDIO_EXT[ext] ?? declared)
  const kind = kindOf(mime)
  if (!kind) throw new MediaUnavailableError(`This kind of file cannot be read: ${mime || 'unknown'}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MEDIA_MAX_BYTES) throw new MediaUnavailableError('That file is too large to read.')
  return { base64: Buffer.from(bytes).toString('base64'), mime, kind }
}

/**
 * The model to use for media of `kinds`: the preferred one if it reads them, else the
 * first available model that does. Null when none can.
 */
export function pickMediaModel(models: EngineModel[], kinds: Set<MediaKind>, preferred: string): string | null {
  const reads = (m: EngineModel) => [...kinds].every((k) => m.input.includes(k))
  const pref = models.find((m) => m.id === preferred)
  if (pref && reads(pref)) return pref.id
  return models.find((m) => m.enabled && reads(m))?.id ?? null
}

async function mediaTurn(
  media: (AgentImage & { kind: MediaKind })[],
  instruction: string,
  system: string,
  preferredModel: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const kinds = new Set(media.map((m) => m.kind))
  const models = await new EngineClient(await currentEngineTarget()).models()
  for (const m of models) setModelCapabilities(m.id, capabilitiesFromEngineModel(m))
  const model = pickMediaModel(models, kinds, engineModelOf({ model: preferredModel ?? DEFAULT_ENGINE_MODEL }))
  if (!model) {
    const what = kinds.has('audio') ? (kinds.has('image') ? 'images and audio' : 'audio') : 'images'
    throw new MediaUnavailableError(`No model available to Redrob can read ${what} right now. Choose a model that reads ${what} in Settings, then try again.`)
  }
  let text = ''
  const controller = new AbortController()
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  await engineStream(model, system, [{ role: 'user', text: instruction, images: media.map(({ base64, mime }) => ({ base64, mime })) }], [], {
    signal: controller.signal,
    onDelta: (t) => {
      text += t
    },
    onToolCall: () => undefined,
  })
  return text.trim()
}

export type AnalyzeMediaOptions = { mediaUrls: string[]; requirements: string; model?: string; fetch?: FetchMedia }

/** Describe or answer questions about images (and short audio clips). */
export async function analyzeMedia(options: AnalyzeMediaOptions, signal?: AbortSignal): Promise<string> {
  const urls = options.mediaUrls.filter(Boolean).slice(0, MEDIA_MAX_ITEMS)
  if (!urls.length) throw new MediaUnavailableError('Give at least one image or audio file to read.')
  const media = await Promise.all(urls.map((u) => loadMedia(u, options.fetch)))
  const ask = options.requirements.trim() || 'Describe what you see and hear in detail.'
  return mediaTurn(media, ask, 'You read the attached media carefully and answer only from what it contains.', options.model, signal)
}

export type TranscribeOptions = { audioUrl: string; language?: string; model?: string; fetch?: FetchMedia }

/** A transcript of a short audio clip (mp3 or wav). */
export async function transcribe(options: TranscribeOptions, signal?: AbortSignal): Promise<string> {
  const media = await loadMedia(options.audioUrl, options.fetch)
  if (media.kind !== 'audio') throw new MediaUnavailableError('That file is not audio (mp3 or wav).')
  const lang = options.language?.trim() ? ` The audio is in ${options.language.trim()}.` : ''
  return mediaTurn(
    [media],
    `Transcribe this audio word for word.${lang} Return only the transcript.`,
    'You are a careful transcriber.',
    options.model,
    signal,
  )
}
