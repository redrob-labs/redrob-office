/**
 * Providers a person can connect in the engine, and how.
 *
 * Measured on engine v0.0.12 (docs/engine-api.md): the v2 integration API lists only
 * Redrob, while the v1 auth API (`GET /provider/auth`) lists every provider the engine
 * has an auth plugin for (GitHub Copilot, GitLab, Poe, xAI, Azure, Cloudflare, ...),
 * with its methods by index. A key for a provider outside the v2 list is stored with
 * `PUT /auth/:id`; OAuth runs through `/provider/:id/oauth/authorize` and `/callback`.
 * Either way the credential lands in the engine's store and nothing is returned.
 *
 * Whether a connected provider brings models is the engine's catalogue to decide; the
 * pane shows the models `GET /api/model` lists, and says so when a provider has none.
 */
import { authHeaderFor, unwrapData, withLocation, type EngineTarget, type FetchLike, EngineIntegrationClient } from './engine-integration'

export type ProviderMethod =
  | { index: number; type: 'api'; label: string }
  | { index: number; type: 'oauth'; label: string; prompts: { key: string; message: string; type: 'text' | 'select'; options?: { label: string; value: string }[] }[] }

export type ProviderConnection = {
  id: string
  name: string
  connected: boolean
  methods: ProviderMethod[]
  /** connected through an environment variable, which Settings cannot remove */
  viaEnv: boolean
}

export type ProviderOAuthStart = { url: string; mode: 'auto' | 'code'; instructions: string }

/** Display names for the ids the engine reports; anything else shows its id. */
const NAMES: Record<string, string> = {
  redrob: 'Redrob',
  'github-copilot': 'GitHub Copilot',
  gitlab: 'GitLab',
  poe: 'Poe',
  'cloudflare-workers-ai': 'Cloudflare Workers AI',
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  azure: 'Azure',
  digitalocean: 'DigitalOcean',
  'snowflake-cortex': 'Snowflake Cortex',
  xai: 'xAI',
}

const SAFE_ID = /^[A-Za-z0-9._-]{1,80}$/

export class EngineProvidersError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'EngineProvidersError'
    this.status = status
  }
}

function toMethods(raw: unknown): ProviderMethod[] {
  if (!Array.isArray(raw)) return []
  const out: ProviderMethod[] = []
  raw.forEach((m, index) => {
    if (typeof m !== 'object' || m === null) return
    const r = m as Record<string, unknown>
    const label = typeof r.label === 'string' ? r.label : ''
    if (r.type === 'api') out.push({ index, type: 'api', label })
    else if (r.type === 'oauth') {
      const prompts = (Array.isArray(r.prompts) ? r.prompts : [])
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .filter((p) => typeof p.key === 'string' && typeof p.message === 'string' && (p.type === 'text' || p.type === 'select'))
        .map((p) => ({
          key: p.key as string,
          message: p.message as string,
          type: p.type as 'text' | 'select',
          ...(Array.isArray(p.options)
            ? {
                options: (p.options as Record<string, unknown>[])
                  .filter((o) => typeof o?.label === 'string' && typeof o?.value === 'string')
                  .map((o) => ({ label: o.label as string, value: o.value as string })),
              }
            : {}),
        }))
      out.push({ index, type: 'oauth', label, prompts })
    }
  })
  return out
}

export class EngineProvidersClient {
  constructor(
    private readonly target: EngineTarget,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    const r = await this.fetchImpl(withLocation(this.target, path), {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), authorization: authHeaderFor(this.target), 'content-type': 'application/json' },
    })
    // the body may quote a key: never surface it
    if (!r.ok) throw new EngineProvidersError(r.status, r.status === 401 ? 'engine rejected our credentials' : 'engine request failed')
    const text = await r.text()
    return text ? (JSON.parse(text) as unknown) : null
  }

  /** Every provider the engine can authenticate, with whether it is connected. */
  async list(): Promise<ProviderConnection[]> {
    const [auth, providers, integrations] = await Promise.all([
      this.call('/provider/auth') as Promise<Record<string, unknown> | null>,
      this.call('/provider') as Promise<{ connected?: unknown } | null>,
      new EngineIntegrationClient(this.target, this.fetchImpl).list().catch(() => []),
    ])
    const connected = new Set(Array.isArray(providers?.connected) ? providers.connected.filter((x): x is string => typeof x === 'string') : [])
    const env = new Set(integrations.filter((i) => i.connections.some((c) => c.type === 'env')).map((i) => i.id))
    for (const i of integrations) if (i.connected) connected.add(i.id)
    return Object.entries(auth ?? {})
      .filter(([id]) => SAFE_ID.test(id))
      .map(([id, methods]) => ({
        id,
        name: NAMES[id] ?? id,
        connected: connected.has(id),
        methods: toMethods(methods),
        viaEnv: env.has(id),
      }))
  }

  /** Store a key. Redrob goes through the v2 integration API; others through v1 auth. */
  async setKey(providerId: string, key: string, label = 'Redrob Office'): Promise<void> {
    if (!SAFE_ID.test(providerId)) throw new EngineProvidersError(400, 'unknown provider')
    if (providerId === 'redrob') {
      await new EngineIntegrationClient(this.target, this.fetchImpl).connectKey('redrob', key, label)
      return
    }
    await this.call(`/auth/${encodeURIComponent(providerId)}`, { method: 'PUT', body: JSON.stringify({ type: 'api', key }) })
  }

  /** Disconnect: remove every stored credential the engine holds for the provider. */
  async remove(providerId: string): Promise<void> {
    if (!SAFE_ID.test(providerId)) throw new EngineProvidersError(400, 'unknown provider')
    const integrations = await new EngineIntegrationClient(this.target, this.fetchImpl).list().catch(() => [])
    const mine = integrations.find((i) => i.id === providerId)
    for (const c of mine?.connections ?? []) {
      if (c.type === 'credential') await new EngineIntegrationClient(this.target, this.fetchImpl).removeCredential(c.id)
    }
    await this.call(`/auth/${encodeURIComponent(providerId)}`, { method: 'DELETE' }).catch((e: unknown) => {
      // nothing stored through v1 is not an error
      if (!(e instanceof EngineProvidersError && e.status === 404)) throw e
    })
  }

  async startOAuth(providerId: string, method: number, inputs: Record<string, string> = {}): Promise<ProviderOAuthStart> {
    if (!SAFE_ID.test(providerId)) throw new EngineProvidersError(400, 'unknown provider')
    const body = unwrapData(
      await this.call(`/provider/${encodeURIComponent(providerId)}/oauth/authorize`, { method: 'POST', body: JSON.stringify({ method, inputs }) }),
    ) as Record<string, unknown> | null
    if (!body || typeof body.url !== 'string') throw new EngineProvidersError(502, 'engine returned no sign-in address')
    return { url: body.url, mode: body.method === 'code' ? 'code' : 'auto', instructions: typeof body.instructions === 'string' ? body.instructions : '' }
  }

  /** Finish OAuth. In `auto` mode this waits for the browser step; in `code` mode it takes the code. */
  async finishOAuth(providerId: string, method: number, code?: string): Promise<boolean> {
    if (!SAFE_ID.test(providerId)) throw new EngineProvidersError(400, 'unknown provider')
    const ok = await this.call(`/provider/${encodeURIComponent(providerId)}/oauth/callback`, {
      method: 'POST',
      body: JSON.stringify(code ? { method, code } : { method }),
    })
    return ok === true
  }
}
