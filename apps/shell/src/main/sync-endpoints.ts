/**
 * Where sharing and live documents connect.
 *
 * A packaged build reads the addresses its release baked into package.json
 * (`redrobSync`, from REDROB_SYNC_URL / REDROB_SYNC_LIVE_URL at packaging
 * time, as GENOFFICE_UPDATE_REPO bakes the update feed). It only ever talks
 * to an https API and a wss live server that are not on this computer: the
 * Console token goes wherever these point, so a packaged app refuses http,
 * ws and loopback. A build with nothing baked has no sync service, and Share
 * says it is not available yet.
 *
 * A development build uses REDROB_SYNC_URL, or the local Compose stack.
 */
import { isLoopbackUrl } from '@genoffice/identity'
import { liveUrlFor } from '@genoffice/sync-client/live-provider'

export const DEV_SYNC_URL = 'http://127.0.0.1:8787'

export interface SyncEndpoints {
  url: string
  liveUrl: string | null
}

export interface SyncEnv {
  REDROB_SYNC_URL?: string | undefined
  REDROB_SYNC_LIVE_URL?: string | undefined
}

/** An address a packaged app may send its token to: the given scheme, not loopback, no credentials, query or fragment. */
export function packagedEndpoint(value: unknown, scheme: 'https:' | 'wss:'): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  let u: URL
  try {
    u = new URL(value.trim())
  } catch {
    return null
  }
  if (u.protocol !== scheme || u.username || u.password || u.search || u.hash) return null
  if (isLoopbackUrl(u.toString().replace(/^wss:/, 'https:'))) return null
  // the rest of loopback, and private and link-local literals: a token never goes there
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (/^127\./.test(host) || host === '::1' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host)) return null
  if (/^(fe80:|f[cd][0-9a-f]{2}:)/i.test(host)) return null
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
}

/** What a release baked into package.json, checked again at run time. */
export function bakedEndpoints(pkg: unknown): SyncEndpoints | null {
  const raw = pkg && typeof pkg === 'object' ? (pkg as Record<string, unknown>).redrobSync : null
  if (!raw || typeof raw !== 'object') return null
  const { url, liveUrl } = raw as Record<string, unknown>
  const api = packagedEndpoint(url, 'https:')
  if (!api) return null
  const live = liveUrl === undefined ? liveUrlFor(api) : packagedEndpoint(liveUrl, 'wss:')
  return { url: api, liveUrl: live && packagedEndpoint(live, 'wss:') }
}

export function resolveSyncEndpoints(opts: { env: SyncEnv; packaged: boolean; pkg: unknown }): SyncEndpoints | null {
  const { env, packaged } = opts
  if (packaged) {
    // an environment override is honoured only where the baked address would be (staging)
    const override = packagedEndpoint(env.REDROB_SYNC_URL, 'https:')
    if (override) {
      const live = env.REDROB_SYNC_LIVE_URL ? packagedEndpoint(env.REDROB_SYNC_LIVE_URL, 'wss:') : packagedEndpoint(liveUrlFor(override), 'wss:')
      return { url: override, liveUrl: live }
    }
    return bakedEndpoints(opts.pkg)
  }
  const url = env.REDROB_SYNC_URL || DEV_SYNC_URL
  return { url, liveUrl: liveUrlFor(url, env.REDROB_SYNC_LIVE_URL) }
}
