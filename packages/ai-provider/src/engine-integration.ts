/**
 * Client for the Redrob engine's integration routes.
 *
 * This is how Office stops keeping its own credential store. The engine already owns
 * the whole BYOK surface — `GET /api/integration` lists every integration with its
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
 * a fake server — the same split `device-connect.ts` already uses, where the loop
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

/** One authentication method an integration offers. */
export type IntegrationMethod =
  | { type: 'oauth'; id: string; label?: string }
  | { type: 'key'; id: string; label?: string }
  | { type: 'env'; id: string; label?: string }

/** An integration as the engine reports it, reduced to what a settings pane needs. */
export type EngineIntegration = {
  id: string
  name: string
  /** Which ways this integration can be connected. */
  methods: IntegrationMethod[]
  /** True when the engine already holds a credential for it. */
  connected: boolean
}

export type EngineTarget = {
  /** Loopback base URL of the engine, e.g. http://127.0.0.1:41234 */
  baseUrl: string
  username: string
  password: string
  /**
   * Project directory the engine should resolve providers against. The integration
   * routes are location-scoped, so omitting this asks about the engine's default
   * location rather than the user's project — which is a different answer, not a
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

function authHeader(target: EngineTarget): string {
  // btoa is not available in every Electron main context; Buffer is.
  const raw = `${target.username}:${target.password}`
  const encoded =
    typeof Buffer !== 'undefined' ? Buffer.from(raw, 'utf8').toString('base64') : btoa(raw)
  return `Basic ${encoded}`
}

function withDirectory(target: EngineTarget, path: string): string {
  const url = new URL(path, target.baseUrl)
  if (target.directory) url.searchParams.set('directory', target.directory)
  return url.toString()
}

/**
 * Normalize the engine's `Integration.Info` into the shape a settings pane renders.
 *
 * Exported so the mapping is testable on its own. It is intentionally lenient about
 * unknown method types: a new authentication method added to the engine must not make
 * an older Office build throw while rendering a list — it should render the methods it
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
    const methodId = typeof method.id === 'string' ? method.id : undefined
    if (type !== 'oauth' && type !== 'key' && type !== 'env') continue
    if (!methodId) continue
    methods.push({
      type,
      id: methodId,
      ...(typeof method.label === 'string' ? { label: method.label } : {}),
    })
  }

  const connections = Array.isArray(record.connections) ? record.connections : []
  return {
    id,
    name: typeof record.name === 'string' ? record.name : id,
    methods,
    connected: connections.length > 0,
  }
}

export class EngineIntegrationClient {
  private readonly target: EngineTarget
  private readonly fetchImpl: FetchLike

  constructor(target: EngineTarget, fetchImpl: FetchLike = fetch) {
    this.target = target
    this.fetchImpl = fetchImpl
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchImpl(withDirectory(this.target, path), {
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

  /** Every integration the engine can use, with its methods and connected state. */
  async list(): Promise<EngineIntegration[]> {
    const response = await this.call('/api/integration')
    const body = (await response.json()) as unknown
    // Location-scoped routes wrap their payload; accept both shapes rather than
    // assuming one, because the wrapper is an engine detail Office should not track.
    const items =
      Array.isArray(body) ? body
      : typeof body === 'object' && body !== null && Array.isArray((body as Record<string, unknown>).data)
        ? ((body as Record<string, unknown>).data as unknown[])
        : []
    return items.map(toEngineIntegration).filter((entry): entry is EngineIntegration => entry !== null)
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

  /** Disconnect a stored credential. */
  async removeCredential(credentialId: string): Promise<void> {
    await this.call(`/api/credential/${encodeURIComponent(credentialId)}`, { method: 'DELETE' })
  }
}
