/**
 * Redrob Launcher's shared sign-in, read as a fallback for this app's own key.
 *
 * The launcher signs a computer in once and writes the key to ONE file every Redrob
 * app may read (contract: redrob-launcher docs/shared-account.md). This module is the
 * office suite's reader. The rules it keeps are non-negotiable:
 *
 *   1. read only: nothing here writes, moves or deletes the shared file;
 *   2. read at the moment the key is needed, because the person may sign in or out in
 *      the launcher while this app is running (a one-second cache covers a burst of
 *      reads inside one AI turn without hiding a sign-out for longer than that);
 *   3. the app's OWN stored key wins, the shared key is the fallback only;
 *   4. the key is never logged, printed or shown — the UI learns `viaLauncher` and the
 *      account name, nothing else;
 *   5. the app's own "disconnect" clears the app's own key only (see `stripLauncherKey`,
 *      which keeps a launcher key from ever landing in the app's own file).
 *
 * Node-only (filesystem + os). It is exported under `@genoffice/ai-provider/shared-account`
 * rather than from the package index so the renderer bundles never pull `node:fs`.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { REDROB_ENGINE_ID } from './providers'
import type { AiSettings } from './types'

/** Env override: replaces the directory, the file name stays `account.json`. */
export const REDROB_SHARED_DIR_ENV = 'REDROB_SHARED_DIR'
const SHARED_ACCOUNT_FILE = 'account.json'

/** What the launcher writes. All strings; a missing or empty apiKey is "not signed in". */
export type SharedAccount = {
  apiKey: string
  apiKeyName?: string | undefined
  accountName?: string | undefined
  apiBaseUrl?: string | undefined
}

export type SharedAccountEnv = {
  env?: Record<string, string | undefined>
  platform?: NodeJS.Platform
  home?: string
}

/**
 * Where the launcher keeps the shared account on this platform:
 *   Linux   $XDG_CONFIG_HOME/redrob-shared/account.json (default ~/.config/redrob-shared)
 *   macOS   ~/Library/Application Support/ai.redrob.shared/account.json
 *   Windows %APPDATA%\Redrob\Shared\account.json
 * `REDROB_SHARED_DIR` replaces the directory on every platform (tests point it at a temp dir).
 */
export function sharedAccountPath(opts: SharedAccountEnv = {}): string {
  const env = opts.env ?? process.env
  const platform = opts.platform ?? process.platform
  const home = opts.home ?? homedir()

  const override = env[REDROB_SHARED_DIR_ENV]
  if (override && override.trim()) return join(override, SHARED_ACCOUNT_FILE)

  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'ai.redrob.shared', SHARED_ACCOUNT_FILE)
  }
  if (platform === 'win32') {
    const appData =
      env.APPDATA && env.APPDATA.trim() ? env.APPDATA : join(home, 'AppData', 'Roaming')
    return join(appData, 'Redrob', 'Shared', SHARED_ACCOUNT_FILE)
  }
  const configHome =
    env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() ? env.XDG_CONFIG_HOME : join(home, '.config')
  return join(configHome, 'redrob-shared', SHARED_ACCOUNT_FILE)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Parse the launcher's JSON. Anything short of a non-empty string apiKey is "not signed in". */
export function parseSharedAccount(raw: string): SharedAccount | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as Record<string, unknown>
  const apiKey = asString(record.apiKey).trim()
  if (!apiKey) return null
  return {
    apiKey,
    apiKeyName: asString(record.apiKeyName) || undefined,
    accountName: asString(record.accountName) || undefined,
    apiBaseUrl: asString(record.apiBaseUrl) || undefined,
  }
}

/**
 * Bounded cache so one AI turn that asks for the key several times reads the file
 * once, while a launcher sign-out still lands within a second. Keyed by path so a test
 * that moves `REDROB_SHARED_DIR` never sees the previous directory's answer.
 */
const CACHE_TTL_MS = 1_000
let cache: { path: string; at: number; account: SharedAccount | null } | null = null

/** Read the shared account now (read only; a missing or unreadable file is "not signed in"). */
export function readSharedAccount(opts: SharedAccountEnv = {}): SharedAccount | null {
  const path = sharedAccountPath(opts)
  const now = Date.now()
  if (cache && cache.path === path && now - cache.at < CACHE_TTL_MS) return cache.account
  let account: SharedAccount | null = null
  try {
    account = parseSharedAccount(readFileSync(path, 'utf8'))
  } catch {
    account = null
  }
  cache = { path, at: now, account }
  return account
}

/** Drop the read cache; tests call it between steps that rewrite the shared file. */
export function resetSharedAccountCache(): void {
  cache = null
}

/** The key the Redrob engine should use right now, and where it came from. */
export type ResolvedRedrobKey =
  | { apiKey: ''; source: 'none' }
  | { apiKey: string; source: 'own' }
  | {
      apiKey: string
      source: 'launcher'
      accountName?: string | undefined
      apiKeyName?: string | undefined
    }

/**
 * Own key first, the launcher's shared key second, read at use time. The `source` is
 * what lets the UI say "Signed in with Redrob Launcher" without ever seeing the key.
 */
export function resolveRedrobKey(
  ownApiKey: string | undefined,
  opts: SharedAccountEnv = {},
): ResolvedRedrobKey {
  const own = (ownApiKey ?? '').trim()
  if (own) return { apiKey: own, source: 'own' }
  const shared = readSharedAccount(opts)
  if (shared) {
    return {
      apiKey: shared.apiKey,
      source: 'launcher',
      accountName: shared.accountName,
      apiKeyName: shared.apiKeyName,
    }
  }
  return { apiKey: '', source: 'none' }
}

/**
 * Settings as the editors should see them: when the app has no key of its own in the
 * Redrob engine slot, the launcher's key is filled in and the settings are flagged
 * `redrobKeySource: 'launcher'` so the settings pane can show where it came from and
 * refuse to persist it. Settings with an own key are returned flagged `'own'`.
 */
export function withSharedAccountFallback(
  settings: AiSettings,
  opts: SharedAccountEnv = {},
): AiSettings {
  const existing = settings.providers?.[REDROB_ENGINE_ID] ?? { apiKey: '', model: '' }
  const resolved = resolveRedrobKey(existing.apiKey, opts)
  const next: AiSettings = { ...settings, redrobKeySource: resolved.source }
  delete next.launcherAccountName
  if (resolved.source === 'launcher') {
    next.providers = {
      ...settings.providers,
      [REDROB_ENGINE_ID]: { ...existing, apiKey: resolved.apiKey },
    }
    if (resolved.accountName) next.launcherAccountName = resolved.accountName
  }
  return next
}

/**
 * Settings as they may be WRITTEN to the app's own file. The launcher's key must never
 * become this app's own key by round-tripping through the settings pane: a key flagged
 * as the launcher's, or equal to the shared key on disk right now, is stored as empty.
 * The derived flags are dropped too; a reader recomputes them. Never touches the shared file.
 */
export function stripLauncherKey(settings: AiSettings, opts: SharedAccountEnv = {}): AiSettings {
  const { redrobKeySource, launcherAccountName: _name, ...rest } = settings
  const next: AiSettings = { ...rest }
  const slot = next.providers?.[REDROB_ENGINE_ID]
  if (!slot) return next
  const key = (slot.apiKey ?? '').trim()
  if (!key) return next
  const shared = redrobKeySource === 'launcher' ? null : readSharedAccount(opts)
  if (redrobKeySource === 'launcher' || (shared && shared.apiKey === key)) {
    next.providers = { ...next.providers, [REDROB_ENGINE_ID]: { ...slot, apiKey: '' } }
  }
  return next
}
