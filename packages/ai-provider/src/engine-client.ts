/**
 * Loopback client for the bundled Redrob engine (`redrob-code serve`).
 *
 * What the engine actually is, as measured against v0.0.12 (docs/engine-api.md): an
 * agent server, not an OpenAI-compatible proxy. There is no `/v1/chat/completions` and
 * no `/v1/models` on it. A turn is a message posted to an engine session; the engine
 * runs the model with the credential it holds and calls tools itself. Office's editing
 * tools reach it as a Model Context Protocol server Office hosts on loopback (see
 * ./engine-turn.ts), so the engine makes the call and Office keeps executing its own
 * tools with its own rollback and edit-queue rules.
 *
 * This file is the HTTP surface only: health, models, sessions, MCP registration and
 * the event stream. No Electron import, so it runs in any main process and in tests
 * against a fake engine.
 *
 * Like engine-integration.ts it takes the base URL only from its constructor and never
 * returns a credential: `/api/model` and `/api/provider` echo the provider key inside
 * `request.body`, and `toEngineModel` drops that field before anything leaves here.
 */
import { authHeaderFor, unwrapData, withLocation, type EngineTarget, type FetchLike } from './engine-integration'

/** Built-in engine tools. Office turns disable every one of them: Office's tools are the only tools. */
export const ENGINE_BUILTIN_TOOLS = [
  'invalid',
  'question',
  'bash',
  'read',
  'glob',
  'grep',
  'edit',
  'write',
  'task',
  'webfetch',
  'todowrite',
  'websearch',
  'skill',
  'apply_patch',
] as const

/** The engine agent every Office turn runs as. */
export const OFFICE_AGENT = 'office'

/**
 * Engine configuration Office passes through `REDROB_CONFIG_CONTENT` at spawn.
 *
 * Passed inline rather than written with `PATCH /global/config`: that route rewrites the
 * person's own `~/.config/redrob/redrob.jsonc`, which Redrob Code on the same machine
 * reads too. An inline config lives and dies with the process Office owns.
 */
export function officeEngineConfig(imageModels: string[] = ['auto']): Record<string, unknown> {
  const off = Object.fromEntries(ENGINE_BUILTIN_TOOLS.map((t) => [t, false]))
  const deny = Object.fromEntries(ENGINE_BUILTIN_TOOLS.map((t) => [t, 'deny']))
  return {
    $schema: 'https://code.redrob.ai/config.json',
    share: 'disabled',
    autoupdate: false,
    ...(imageModels.length
      ? {
          // engine v0.0.12 lists every Console model as text-only and drops image parts
          // for it; Console publishes which ones read images (GET /v1/pricing), and says
          // so here so an attached image reaches the model
          provider: {
            redrob: {
              models: Object.fromEntries(
                imageModels.map((id) => [id, { modalities: { input: ['text', 'image'], output: ['text'] } }]),
              ),
            },
          },
        }
      : {}),
    agent: {
      [OFFICE_AGENT]: {
        mode: 'primary',
        description: 'Redrob Office editing agent. Uses only the tools Office provides.',
        // The per-turn system prompt comes from the editor; this is only the frame.
        prompt: 'You work inside Redrob Office. Use only the tools you are given for this document.',
        tools: off,
        permission: deny,
      },
    },
  }
}

export class EngineError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'EngineError'
    this.status = status
  }
}

/** A model as Office shows it. No request body, so no key. */
export type EngineModel = {
  /** `provider/model`, the id Office stores and sends. */
  id: string
  providerID: string
  modelID: string
  name: string
  tools: boolean
  input: string[]
  output: string[]
  contextTokens: number | null
  outputTokens: number | null
  enabled: boolean
}

export function toEngineModel(raw: unknown): EngineModel | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string' || typeof m.providerID !== 'string') return null
  const caps = (typeof m.capabilities === 'object' && m.capabilities ? m.capabilities : {}) as Record<string, unknown>
  const limit = (typeof m.limit === 'object' && m.limit ? m.limit : {}) as Record<string, unknown>
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return {
    id: `${m.providerID}/${m.id}`,
    providerID: m.providerID,
    modelID: m.id,
    name: typeof m.name === 'string' ? m.name : m.id,
    tools: caps.tools === true,
    input: strings(caps.input),
    output: strings(caps.output),
    contextTokens: typeof limit.context === 'number' ? limit.context : null,
    outputTokens: typeof limit.output === 'number' ? limit.output : null,
    enabled: m.enabled !== false && m.status !== 'disabled',
  }
}

/** Split a `provider/model` id. A bare id is taken as a Redrob model. */
export function splitModelId(id: string): { providerID: string; modelID: string } {
  const slash = id.indexOf('/')
  if (slash <= 0 || slash === id.length - 1) return { providerID: 'redrob', modelID: id || 'auto' }
  return { providerID: id.slice(0, slash), modelID: id.slice(slash + 1) }
}

/** One part of a message Office sends. */
export type EnginePromptPart =
  | { type: 'text'; text: string }
  | { type: 'file'; mime: string; url: string; filename?: string }

export type EnginePromptBody = {
  model: { providerID: string; modelID: string }
  agent?: string
  system?: string
  tools?: Record<string, boolean>
  parts: EnginePromptPart[]
}

/** One event off the engine's `/event` stream. */
export type EngineEvent = { type: string; properties: Record<string, unknown> }

export class EngineClient {
  private readonly target: EngineTarget
  private readonly fetchImpl: FetchLike

  constructor(target: EngineTarget, fetchImpl: FetchLike = fetch) {
    this.target = target
    this.fetchImpl = fetchImpl
  }

  /** The project directory this client asks about, if any. */
  get directory(): string | undefined {
    return this.target.directory
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchImpl(withLocation(this.target, path), {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization: authHeaderFor(this.target),
        'content-type': 'application/json',
      },
    })
    if (!response.ok) {
      // Never echo the body: a prompt can carry document text and a provider error can
      // quote the request. The engine's error name is safe and useful.
      let name = ''
      try {
        const parsed = JSON.parse(await response.text()) as { name?: unknown }
        if (typeof parsed.name === 'string' && /^[A-Za-z]{1,60}$/.test(parsed.name)) name = ` (${parsed.name})`
      } catch {
        /* not JSON */
      }
      const detail = response.status === 401 ? 'engine rejected our credentials' : `engine request failed${name}`
      throw new EngineError(response.status, detail)
    }
    return response
  }

  private async json(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.call(path, init)
    const text = await response.text()
    return text ? (JSON.parse(text) as unknown) : null
  }

  async health(): Promise<{ healthy: boolean; version: string | null }> {
    const body = (await this.json('/global/health')) as Record<string, unknown> | null
    return { healthy: body?.healthy === true, version: typeof body?.version === 'string' ? body.version : null }
  }

  /** Models the engine can run right now, credential-free. */
  async models(): Promise<EngineModel[]> {
    const data = unwrapData(await this.json('/api/model'))
    return (Array.isArray(data) ? data : []).map(toEngineModel).filter((m): m is EngineModel => m !== null)
  }

  async createSession(title?: string): Promise<string> {
    const body = (await this.json('/session', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    })) as Record<string, unknown> | null
    if (!body || typeof body.id !== 'string') throw new EngineError(502, 'engine returned no session')
    return body.id
  }

  /**
   * Send a message and wait for the engine to finish the turn. Text and tool activity
   * arrive on the event stream while this is pending; the resolved value is the final
   * assistant message.
   */
  async prompt(sessionId: string, body: EnginePromptBody, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const result = await this.json(`/session/${encodeURIComponent(sessionId)}/message`, {
      method: 'POST',
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    })
    return (result ?? {}) as Record<string, unknown>
  }

  async abort(sessionId: string): Promise<void> {
    await this.call(`/session/${encodeURIComponent(sessionId)}/abort`, { method: 'POST' })
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.call(`/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
  }

  /**
   * Register an MCP server Office hosts. The engine connects immediately and lists its
   * tools as `<name>_<tool>`.
   *
   * Must come after any config change: a config update re-creates the engine instance
   * and drops MCP servers added over HTTP (observed on v0.0.12).
   */
  async addMcp(name: string, url: string, headers: Record<string, string> = {}): Promise<string> {
    const body = (await this.json('/mcp', {
      method: 'POST',
      body: JSON.stringify({ name, config: { type: 'remote', url, oauth: false, headers } }),
    })) as Record<string, { status?: unknown; error?: unknown }> | null
    const entry = body?.[name]
    return typeof entry?.status === 'string' ? entry.status : 'unknown'
  }

  async disconnectMcp(name: string): Promise<void> {
    await this.call(`/mcp/${encodeURIComponent(name)}/disconnect`, { method: 'POST' })
  }

  /**
   * The engine's event stream, parsed. Ends when `signal` aborts or the engine closes
   * the stream. Heartbeats are dropped.
   */
  async *events(signal: AbortSignal): AsyncGenerator<EngineEvent> {
    const response = await this.call('/event', { signal, headers: { accept: 'text/event-stream' } })
    if (!response.body) return
    const decoder = new TextDecoder()
    let buffer = ''
    const reader = response.body.getReader()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
        let cut: number
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, cut)
          buffer = buffer.slice(cut + 2)
          const data = block
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n')
          if (!data) continue
          let event: unknown
          try {
            event = JSON.parse(data)
          } catch {
            continue
          }
          if (typeof event !== 'object' || event === null) continue
          const e = event as Record<string, unknown>
          if (typeof e.type !== 'string' || e.type === 'server.heartbeat') continue
          yield { type: e.type, properties: (e.properties ?? {}) as Record<string, unknown> }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
