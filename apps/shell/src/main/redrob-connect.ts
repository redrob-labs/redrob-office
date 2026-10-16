/**
 * Connect Redrob, main-process side.
 *
 * The renderer drives this flow but never holds either secret in it. The device code
 * stays here and the renderer gets an opaque attempt id; the workspace key is written
 * straight into userData/ai-settings.json, the same slot the settings pane fills by
 * hand, and never crosses the IPC boundary. A renderer that is compromised can
 * therefore start a connect and learn whether it succeeded, which is all it needs.
 *
 * The loop itself lives in @genoffice/ai-provider so it can be tested without
 * Electron; this module is the host: it owns custody, the settings file, and the
 * lifetime of an attempt.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { dirname, join } from 'node:path'

import { app, ipcMain, net, shell } from 'electron'
import {
  REDROB_ENGINE_ID,
  defaultAiSettings,
  resolveAiSettings,
  runDeviceConnect,
  startDeviceAuthorization,
  type AiSettings,
  type DeviceAuthorization,
  type DeviceConnectOutcome,
} from '@genoffice/ai-provider'
import { readSharedAccount, sharedAccountPath } from '@genoffice/ai-provider/shared-account'

import type { KeySignIn, KeySignInDeps } from './identity-service'

/** What the renderer is allowed to know about an attempt in progress. */
export type ConnectAttempt = {
  id: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
}

/** What the renderer is allowed to know about how it ended: never the key itself. */
export type ConnectResult =
  | { status: 'connected'; accountName?: string; apiKeyName?: string }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'cancelled' }
  | { status: 'unreachable' }
  | { status: 'failed'; code: string }

type LiveAttempt = {
  authorization: DeviceAuthorization
  cancelled: boolean
}

const attempts = new Map<string, LiveAttempt>()

const AI_SETTINGS_PATH = () => join(app.getPath('userData'), 'ai-settings.json')

function readAiSettings(): AiSettings {
  let stored: unknown = {}
  try {
    stored = JSON.parse(readFileSync(AI_SETTINGS_PATH(), 'utf8'))
  } catch {
    // No settings yet, or a corrupt file: a connect is exactly how the first key arrives.
    stored = {}
  }
  return resolveAiSettings((stored ?? {}) as Partial<AiSettings>, defaultAiSettings())
}

/**
 * Store the key in the one slot the editors read. Written with the rest of the
 * settings intact so a connect cannot quietly reset a preference the user chose.
 */
function storeApiKey(apiKey: string): void {
  const settings = readAiSettings()
  const existing = settings.providers?.[REDROB_ENGINE_ID] ?? { apiKey: '', model: '' }
  const next: AiSettings = {
    ...settings,
    providers: { ...settings.providers, [REDROB_ENGINE_ID]: { ...existing, apiKey } },
  }
  writeFileSync(AI_SETTINGS_PATH(), JSON.stringify(next, null, 2), 'utf8')
}

/** Console is reached through Chromium's stack, which honours the system proxy. */
const consoleFetch = (url: string, init: RequestInit): Promise<Response> => net.fetch(url, init)

function publicResult(outcome: DeviceConnectOutcome): ConnectResult {
  switch (outcome.status) {
    case 'connected':
      return {
        status: 'connected',
        accountName: outcome.key.accountName,
        apiKeyName: outcome.key.apiKeyName,
      }
    case 'unreachable':
      return { status: 'unreachable' }
    case 'failed':
      return { status: 'failed', code: outcome.code }
    default:
      return { status: outcome.status }
  }
}

export function registerRedrobConnectIpc(): void {
  ipcMain.handle('redrob:connect-start', async (): Promise<ConnectAttempt> => {
    const authorization = await startDeviceAuthorization('office', { fetch: consoleFetch })
    const id = randomUUID()
    attempts.set(id, { authorization, cancelled: false })
    // Best effort: the code is shown in the app either way, so a browser that will not
    // open is an inconvenience rather than a dead end.
    void shell.openExternal(authorization.verificationUriComplete)
    return {
      id,
      userCode: authorization.userCode,
      verificationUri: authorization.verificationUri,
      verificationUriComplete: authorization.verificationUriComplete,
      expiresIn: authorization.expiresIn,
    }
  })

  ipcMain.handle('redrob:connect-await', async (_event, id: unknown): Promise<ConnectResult> => {
    const attempt = typeof id === 'string' ? attempts.get(id) : undefined
    if (!attempt) return { status: 'failed', code: 'unknown_attempt' }

    try {
      const outcome = await runDeviceConnect({
        authorization: attempt.authorization,
        isCancelled: () => attempt.cancelled,
        deps: {
          fetch: consoleFetch,
          now: () => Date.now(),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        },
      })
      if (outcome.status === 'connected') storeApiKey(outcome.key.apiKey)
      return publicResult(outcome)
    } finally {
      // One attempt, one device code: a retry starts a new authorization rather than
      // re-polling a code Console may already have burned.
      attempts.delete(id as string)
    }
  })

  ipcMain.handle('redrob:connect-cancel', (_event, id: unknown) => {
    const attempt = typeof id === 'string' ? attempts.get(id) : undefined
    if (attempt) attempt.cancelled = true
  })
}

/**
 * The shared account contract, as the shell's identity sees it: a Console key
 * from either source means "signed in". When BOTH the app's own settings and the
 * launcher's shared file hold a key, the one written more recently wins -- a
 * person who just signed in to the launcher expects that account, and one who
 * just pasted a key in Settings expects that one.
 */
export function currentKeySignIn(): KeySignIn | null {
  const own = (readAiSettings().providers?.[REDROB_ENGINE_ID]?.apiKey ?? '').trim()
  const shared = readSharedAccount()
  const ownName = app.getName()
  if (own && shared) {
    const newer = (p: string) => {
      try {
        return statSync(p).mtimeMs
      } catch {
        return 0
      }
    }
    return newer(sharedAccountPath()) > newer(AI_SETTINGS_PATH())
      ? { source: 'launcher', name: shared.accountName ?? shared.apiKeyName ?? 'Redrob' }
      : { source: 'own', name: ownName }
  }
  if (own) return { source: 'own', name: ownName }
  if (shared) return { source: 'launcher', name: shared.accountName ?? shared.apiKeyName ?? 'Redrob' }
  return null
}

/**
 * The identity service's key path: Console's device connect under this app's
 * product id. The key lands in the app's own settings, exactly as Connect Redrob
 * in Settings does, so one sign-in serves the AI panel and the identity pane.
 */
export function keySignInDeps(): KeySignInDeps {
  return {
    current: currentKeySignIn,
    start: async () => {
      const a = await startDeviceAuthorization('office', { fetch: consoleFetch })
      return {
        userCode: a.userCode,
        verificationUri: a.verificationUri,
        verificationUriComplete: a.verificationUriComplete,
        expiresIn: a.expiresIn,
        deviceCode: a.deviceCode,
        interval: a.interval,
      }
    },
    finish: async (start, isCancelled) => {
      const outcome = await runDeviceConnect({
        authorization: {
          deviceCode: start.deviceCode,
          userCode: start.userCode,
          verificationUri: start.verificationUri,
          verificationUriComplete: start.verificationUriComplete,
          expiresIn: start.expiresIn,
          interval: start.interval,
        },
        isCancelled,
        deps: {
          fetch: consoleFetch,
          now: () => Date.now(),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        },
      })
      if (outcome.status === 'connected') {
        storeApiKey(outcome.key.apiKey)
        const k = currentKeySignIn()
        return k
          ? { status: 'signed-in', identity: { signedIn: true, provider: 'console', name: k.name } }
          : { status: 'failed', code: 'key_not_stored' }
      }
      if (outcome.status === 'unreachable') return { status: 'unreachable' }
      if (outcome.status === 'failed') return { status: 'failed', code: outcome.code }
      return { status: outcome.status }
    },
  }
}

/**
 * Watch both key sources and call back when either may have changed: the shared
 * directory (the launcher renames a temp file over account.json, so the file
 * itself is a moving target) and the app's own settings file. fs.watch is not
 * reliable on every platform and the directory may not exist yet, so a slow poll
 * backs it up. Returns a stop function.
 */
export function watchKeySources(onChange: () => void, pollMs = 30_000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const fire = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      onChange()
    }, 250)
  }
  const watchers: FSWatcher[] = []
  const tryWatch = (dir: string) => {
    try {
      const w = watch(dir, { persistent: false }, fire)
      w.on('error', () => undefined)
      watchers.push(w)
    } catch {
      // the directory does not exist yet (no launcher sign-in ever); the poll covers it
    }
  }
  tryWatch(dirname(sharedAccountPath()))
  tryWatch(dirname(AI_SETTINGS_PATH()))
  const poll = setInterval(fire, pollMs)
  return () => {
    clearInterval(poll)
    if (timer) clearTimeout(timer)
    for (const w of watchers) w.close()
  }
}
