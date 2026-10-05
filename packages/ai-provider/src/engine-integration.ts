/**
 * Client for the Redrob engine's integration routes.
 *
 * This is how Office stops keeping its own credential store. The engine already owns
 * the whole BYOK surface â€” `GET /api/integration` lists every integration with its
 * authentication `methods` and its existing `connections`, `connect/key` stores a
 * user-supplied key, and `DELETE /api/credential/:id` disconnects. Office does not
 * need routes of its own; it needs to call those.
 *
 * Why that matters beyond tidiness: today Office keeps keys in
 * `userData/ai-settings.json`, Design in the macOS keychain, the extension in
 * `chrome.storage.local`, Query and Recall in separate keyring services. Five stores
 * that never read each other is the entire reason a user signs in again in every
 * Redrob app. One store fixes that once.
 *
 * Deliberately a plain HTTP client with no Electron import, so it is testable against
 * a fake server â€” the same split `device-connect.ts` already uses, where the loop
 * lives here and the custody lives in the main process.
 *
 * TWO THINGS THIS DOES NOT DO, both on purpose:
 *
 *   - It never returns a secret. `list()` reports that a connection EXISTS; there is
 *     no read path for the key itself. A caller that cannot read a key cannot log it,
 *     sync it, or leak it, and it keeps this client from becoming an exfiltration
 *     path for anything else on the machine that reaches the loopback port.
 *   - It does not accept a base URL from anywhere but its own constructor. The engine
 *     is on loopback with credentials minted at spawn; treating the URL as caller
 *     input is how an engine credential ends up posted to an arbitrary host.
 */

/** A question an OAuth method asks before it starts (deployment type, host name, ...). */
export type IntegrationPrompt =
  | { type: 'text'; key: string; message: string; placeholder?: string }
  | { type: 'select'; key: string; message: string; options: { label: string; value: string; hint?: string }[] }

/**
 * One authentication method an integration offers.
 *
 * The engine (v0.0.12, see docs/engine-api.md) gives an id only to OAuth methods; a key
 * method and an env method are unique per integration, so their type stands in as the id.
 */
export type IntegrationMethod =
  | { type: 'oauth'; id: string; label?: string; prompts?: IntegrationPrompt[] }
  | { type: 'key'; id: string; label?: string }
  | { type: 'env'; id: string; label?: string; names?: string[] }

/** How an integration is connected today. Never carries the secret, only its handle. */
export type IntegrationConnection =
  | { type: 'credential'; id: string; label: string }
  | { type: 'env'; name: string }

/** An integration as the engine reports it, reduced to what a settings pane needs. */
export type EngineIntegration = {
  id: string
  name: string
  /** Which ways this integration can be connected. */
  methods: IntegrationMethod[]
  /** True when the engine already holds a credential for it. */
  connected: boolean
  /** Stored credentials (removable) and environment variables (not removable from here). */
  connections: IntegrationConnection[]
}

/** An OAuth connection the engine started; the person finishes it in a browser. */
export type OAuthAttempt = {
  attemptID: string
  url: string
  instructions: string
  /** `auto`: the engine notices completion itself. `code`: the person pastes a code back. */
  mode: 'auto' | 'code'
  expiresAt: number | null
}

export type OAuthAttemptStatus = 'pending' | 'complete' | 'failed' | 'expired' | 'cancelled' | 'unknown'

export type EngineTarget = {
  /** Loopback base URL of the engine, e.g. http://127.0.0.1:41234 */
  baseUrl: string
  username: string
  password: string
  /**
   * Project directory the engine should resolve providers against. The integration
   * routes are location-scoped, so omitting this asks about the engine's default
   * location rather than the user's project â€” which is a different answer, not a
   * simpler one.
   */
  directory?: string
}

export class EngineIntegrationError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'EngineIntegrationError'
    this.status = status
  }
}

/** Fetch-shaped injection point, so tests need no server and no network. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** Basic auth for the per-spawn engine credentials. */
export function authHeaderFor(target: Pick<EngineTarget, 'username' | 'password'>): string {
  return authHeader(target as EngineTarget)
}

function authHeader(target: EngineTarget): string {
  // btoa is not available in every Electron main context; Buffer is.
  const raw = `${target.username}:${target.password}`
  const encoded =
    typeof Buffer !== 'undefined' ? Buffer.from(raw, 'utf8').toString('base64') : btoa(raw)
  return `Basic ${encoded}`
}

/**
 * The v2 `/api/*` routes take the location as a deepObject query (`location[directory]`);
 * the older routes take a plain `directory`. Using the wrong one is not an error, it is
 * silently answered for the engine's own cwd, which is a different answer.
 */
export function withLocation(target: Pick<EngineTarget, 'baseUrl' | 'directory'>, path: string): string {
  const url = new URL(path, target.baseUrl)
  if (target.directory) {
    url.searchParams.set(url.pathname.startsWith('/api/') ? 'location[directory]' : 'directory', target.directory)
  }
  return url.toString()
}

/** Unwrap a v2 `{ location, data }` payload; accept a bare value too. */
export function unwrapData(body: unknown): unknown {
  if (typeof body === 'object' && body !== null && !Array.isArray(body) && 'data' in body) {
    return (body as Record<string, unknown>).data
  }
  return body
}

function toPrompt(raw: unknown): IntegrationPrompt | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  if (typeof p.key !== 'string' || typeof p.message !== 'string') return null
  if (p.type === 'text') {
    return { type: 'text', key: p.key, message: p.message, ...(typeof p.placeholder === 'string' ? { placeholder: p.placeholder } : {}) }
  }
  if (p.type === 'select' && Array.isArray(p.options)) {
    const options = p.options
      .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
      .filter((o) => typeof o.label === 'string' && typeof o.value === 'string')
      .map((o) => ({ label: o.label as string, value: o.value as string, ...(typeof o.hint === 'string' ? { hint: o.hint } : {}) }))
    return { type: 'select', key: p.key, message: p.message, options }
  }
  return null
}

/**
 * Normalize the engine's `Integration.Info` into the shape a settings pane renders.
 *
 * Exported so the mapping is testable on its own. It is intentionally lenient about
 * unknown method types: a new authentication method added to the engine must not make
 * an older Office build throw while rendering a list â€” it should render the methods it
 * understands and ignore the rest. Dropping the whole integration because one method
 * is unfamiliar would hide a provider the user has already connected.
 */
export function toEngineIntegration(raw: unknown): EngineIntegration | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const id = record.id
  if (typeof id !== 'string') return null


  const methodsRaw = Array.isArray(record.methods) ? record.methods : []
  const methods: IntegrationMethod[] = []
  for (const entry of methodsRaw) {
    if (typeof entry !== 'object' || entry === null) continue
    const method = entry as Record<string, unknown>
    const type = method.type
    const label = typeof method.label === 'string' ? { label: method.label } : {}
    if (type === 'oauth') {
      // an OAuth method is chosen by id when connecting, so one without an id is unusable
      if (typeof method.id !== 'string' || !method.id) continue
      const prompts = Array.isArray(method.prompts)
        ? method.prompts.map(toPrompt).filter((p): p is IntegrationPrompt => p !== null)
        : []
      methods.push({ type, id: method.id, ...label, ...(prompts.length ? { prompts } : {}) })
    } else if (type === 'key') {
      methods.push({ type, id: typeof method.id === 'string' && method.id ? method.id : 'key', ...label })
    } else if (type === 'env') {
      const names = Array.isArray(method.names) ? method.names.filter((n): n is string => typeof n === 'string') : []
      methods.push({ type, id: typeof method.id === 'string' && method.id ? method.id : 'env', ...label, ...(names.length ? { names } : {}) })
    }
    // an unfamiliar method type is skipped, never fatal
  }

  const connectionsRaw = Array.isArray(record.connections) ? record.connections : []
  const connections: IntegrationConnection[] = []
  for (const entry of connectionsRaw) {
    if (typeof entry !== 'object' || entry === null) continue
    const c = entry as Record<string, unknown>
    if (c.type === 'env' && typeof c.name === 'string') connections.push({ type: 'env', name: c.name })
    else if (typeof c.id === 'string') {
      connections.push({ type: 'credential', id: c.id, label: typeof c.label === 'string' ? c.label : c.id })
    }
  }
  return {
    id,
    name: typeof record.name === 'string' ? record.name : id,
    methods,
    connected: connectionsRaw.length > 0,
    connections,
  }
}

function toAttemptStatus(raw: unknown): OAuthAttemptStatus {
  const status = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).status : undefined
  return status === 'pending' || status === 'complete' || status === 'failed' || status === 'expired' || status === 'cancelled'
    ? status
    : 'unknown'
}

export class EngineIntegrationClient {
  private readonly target: EngineTarget
  private readonly fetchImpl: FetchLike

  constructor(target: EngineTarget, fetchImpl: FetchLike = fetch) {
    this.target = target
    this.fetchImpl = fetchImpl
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchImpl(withLocation(this.target, path), {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization: authHeader(this.target),
        'content-type': 'application/json',
      },
    })
    if (!response.ok) {
      // The body is read for the message but never surfaced verbatim to a renderer:
      // an engine error can quote a request, and a request to these routes can carry
      // a key.
      const detail = response.status === 401 ? 'engine rejected our credentials' : 'engine request failed'
      throw new EngineIntegrationError(response.status, detail)
    }
    return response
  }

  /**
   * Every integration the engine can use, with its methods and connected state.
   *
   * The first request after a spawn can answer an empty list while the engine loads its
   * catalog (observed on v0.0.12), so an empty answer is retried once after a short wait.
   */
  async list(): Promise<EngineIntegration[]> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.call('/api/integration')
      const items = unwrapData((await response.json()) as unknown)
      const list = (Array.isArray(items) ? items : [])
        .map(toEngineIntegration)
        .filter((entry): entry is EngineIntegration => entry !== null)
      if (list.length || attempt >= 1) return list
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }

  /**
   * Store a user-supplied API key for one integration.
   *
   * The key goes out and never comes back: there is deliberately no getter. This is
   * the BYOK path Anthropic and Google both name as the supported one for a
   * third-party tool.
   */
  async connectKey(integrationId: string, key: string, label?: string): Promise<void> {
    await this.call(`/api/integration/${encodeURIComponent(integrationId)}/connect/key`, {
      method: 'POST',
      body: JSON.stringify({ key, ...(label ? { label } : {}) }),
    })
  }

  /** Begin an OAuth connection. The returned URL is opened in the person's browser. */
  async connectOAuth(integrationId: string, methodId: string, inputs: Record<string, string> = {}): Promise<OAuthAttempt> {
    const response = await this.call(`/api/integration/${encodeURIComponent(integrationId)}/connect/oauth`, {
      method: 'POST',
      body: JSON.stringify({ methodID: methodId, inputs }),
    })
    const data = unwrapData((await response.json()) as unknown) as Record<string, unknown> | null
    if (!data || typeof data.attemptID !== 'string' || typeof data.url !== 'string') {
      throw new EngineIntegrationError(502, 'engine returned no OAuth attempt')
    }
    const expires = (data.time as Record<string, unknown> | undefined)?.expires
    return {
      attemptID: data.attemptID,
      url: data.url,
      instructions: typeof data.instructions === 'string' ? data.instructions : '',
      mode: data.mode === 'code' ? 'code' : 'auto',
      expiresAt: typeof expires === 'number' && Number.isFinite(expires) ? expires : null,
    }
  }

  /** Where an OAuth attempt stands. */
  async attemptStatus(attemptId: string): Promise<OAuthAttemptStatus> {
    const response = await this.call(`/api/integration/attempt/${encodeURIComponent(attemptId)}`)
    return toAttemptStatus(unwrapData((await response.json()) as unknown))
  }

  /** Finish a `code`-mode attempt with the code the person pasted. */
  async completeAttempt(attemptId: string, code?: string): Promise<void> {
    await this.call(`/api/integration/attempt/${encodeURIComponent(attemptId)}/complete`, {
      method: 'POST',
      body: JSON.stringify(code ? { code } : {}),
    })
  }

  /** Abandon an attempt so the engine stops waiting for it. */
  async cancelAttempt(attemptId: string): Promise<void> {
    await this.call(`/api/integration/attempt/${encodeURIComponent(attemptId)}`, { method: 'DELETE' })
  }

  /** Disconnect a stored credential. */
  async removeCredential(credentialId: string): Promise<void> {
    await this.call(`/api/credential/${encodeURIComponent(credentialId)}`, { method: 'DELETE' })
  }
}
