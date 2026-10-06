/**
 * Connect Redrob, main-process side.
 *
 * The renderer drives this flow but never holds either secret in it. The device code
 * stays here and the renderer gets an opaque attempt id; the workspace key goes
 * straight into the engine's credential store and is never written by Office or sent
 * across the IPC boundary. A renderer that is compromised can therefore start a
 * connect and learn whether it succeeded, which is all it needs.
 *
 * The loop itself lives in @genoffice/ai-provider so it can be tested without
 * Electron; this module is the host: it owns custody, the settings file, and the
 * lifetime of an attempt.
 */
import { randomUUID } from 'node:crypto'

import { ipcMain, net, shell } from 'electron'
import {
  runDeviceConnect,
  startDeviceAuthorization,
  type DeviceAuthorization,
  type DeviceConnectOutcome,
} from '@genoffice/ai-provider'

import { storeEngineKey } from './engine-credentials'

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
      if (outcome.status === 'connected') {
        // The key goes straight into the engine's credential store; Office keeps nothing.
        // If the engine cannot take it the connect fails visibly rather than parking the
        // key in a file.
        try {
          await storeEngineKey('redrob', outcome.key.apiKey, outcome.key.apiKeyName || 'Redrob Office')
        } catch {
          return { status: 'failed', code: 'engine_unavailable' }
        }
      }
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
