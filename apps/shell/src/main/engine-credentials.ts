/**
 * Provider credentials, kept by the engine and never by Office.
 *
 * - `migrateOfficeHeldKeys` moves a key an older build left in `userData/ai-settings.json`
 *   into the engine's credential store and rewrites the file without it. It only starts
 *   the engine when there is a key to move, so a person with none pays nothing.
 * - `storeEngineKey` is how Connect Redrob hands over the key Console issued.
 * - The `engine:*` IPC lets Settings list integrations and connect or disconnect them.
 *   A key travels renderer → main once, when the person types it; nothing ever sends a
 *   key back, because the engine has no read path for one.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  EngineClient,
  EngineIntegrationClient,
  EngineProvidersClient,
  defaultAiSettings,
  resolveAiSettings,
  type AiSettings,
  type EngineIntegration,
} from '@genoffice/ai-provider'
import { custodyKeys, holdsKeys } from '@genoffice/ai-provider/node'
import { app, ipcMain, shell } from 'electron'

import { getEngineTarget } from './engine-lifecycle'

const AI_SETTINGS_PATH = () => join(app.getPath('userData'), 'ai-settings.json')

function readStored(): Partial<AiSettings> | null {
  try {
    return JSON.parse(readFileSync(AI_SETTINGS_PATH(), 'utf8')) as Partial<AiSettings>
  } catch {
    return null
  }
}

export type MigrationOutcome = { status: 'nothing' } | { status: 'moved'; integrations: string[] } | { status: 'failed'; error: string }

/**
 * One-time move of an Office-held key into the engine. If the engine cannot take it the
 * file is left exactly as it was and the move is tried again on the next launch: a key
 * the person relies on is never silently thrown away.
 */
export async function migrateOfficeHeldKeys(log: (m: string) => void = console.warn): Promise<MigrationOutcome> {
  const stored = readStored()
  if (!stored) return { status: 'nothing' }
  const settings = resolveAiSettings(stored, defaultAiSettings())
  if (!holdsKeys(settings)) return { status: 'nothing' }
  try {
    const result = await custodyKeys(settings, await getEngineTarget())
    // keep every preference the file had; only the keys (and any base URL) go
    const next: Record<string, unknown> = { ...stored, providers: result.settings.providers }
    writeFileSync(AI_SETTINGS_PATH(), JSON.stringify(next, null, 2), 'utf8')
    if (result.dropped.length) log(`[ai] dropped keys with no engine integration: ${result.dropped.join(', ')}`)
    return { status: 'moved', integrations: result.stored }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    log(`[ai] could not move the stored key into the engine yet: ${error.split('\n')[0]}`)
    return { status: 'failed', error }
  }
}

/** Hand a key to the engine. Never written anywhere by Office. */
export async function storeEngineKey(integrationId: string, key: string, label?: string): Promise<void> {
  await new EngineIntegrationClient(await getEngineTarget()).connectKey(integrationId, key, label)
}

/** What Settings may know about an integration: never a secret. */
export type IntegrationView = EngineIntegration

export type EngineCallResult<T> = { ok: true; value: T } | { ok: false; error: string }

async function attempt<T>(fn: () => Promise<T>): Promise<EngineCallResult<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.split('\n')[0]! : String(e) }
  }
}

const SAFE_ID = /^[A-Za-z0-9._-]{1,80}$/

export function registerEngineCredentialsIpc(): void {
  ipcMain.handle('engine:integrations', () =>
    attempt(async () => new EngineIntegrationClient(await getEngineTarget()).list()),
  )
  ipcMain.handle('engine:connect-key', (_e, integrationId: unknown, key: unknown, label?: unknown) =>
    attempt(async () => {
      if (typeof integrationId !== 'string' || !SAFE_ID.test(integrationId)) throw new Error('Choose a provider.')
      if (typeof key !== 'string' || !key.trim() || key.length > 4096) throw new Error('Enter a key.')
      await storeEngineKey(integrationId, key.trim(), typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : 'Redrob Office')
      return true
    }),
  )
  ipcMain.handle('engine:providers', () => attempt(async () => new EngineProvidersClient(await getEngineTarget()).list()))
  ipcMain.handle('engine:models', () =>
    attempt(async () => (await new EngineClient(await getEngineTarget()).models()).filter((m) => m.enabled)),
  )
  ipcMain.handle('engine:provider-key', (_e, providerId: unknown, key: unknown) =>
    attempt(async () => {
      if (typeof providerId !== 'string' || !SAFE_ID.test(providerId)) throw new Error('Choose a provider.')
      if (typeof key !== 'string' || !key.trim() || key.length > 4096) throw new Error('Enter a key.')
      await new EngineProvidersClient(await getEngineTarget()).setKey(providerId, key.trim())
      return true as const
    }),
  )
  ipcMain.handle('engine:provider-remove', (_e, providerId: unknown) =>
    attempt(async () => {
      if (typeof providerId !== 'string' || !SAFE_ID.test(providerId)) throw new Error('Choose a provider.')
      await new EngineProvidersClient(await getEngineTarget()).remove(providerId)
      return true as const
    }),
  )
  ipcMain.handle('engine:oauth-start', (_e, providerId: unknown, method: unknown, inputs: unknown) =>
    attempt(async () => {
      if (typeof providerId !== 'string' || !SAFE_ID.test(providerId)) throw new Error('Choose a provider.')
      if (typeof method !== 'number' || !Number.isInteger(method) || method < 0) throw new Error('Choose a method.')
      const clean: Record<string, string> = {}
      if (inputs && typeof inputs === 'object') {
        for (const [k, v] of Object.entries(inputs as Record<string, unknown>)) {
          if (SAFE_ID.test(k) && typeof v === 'string' && v.length < 512) clean[k] = v
        }
      }
      const started = await new EngineProvidersClient(await getEngineTarget()).startOAuth(providerId, method, clean)
      // only https pages are opened; anything else is shown, not followed
      if (/^https:\/\//i.test(started.url)) void shell.openExternal(started.url)
      return started
    }),
  )
  ipcMain.handle('engine:oauth-finish', (_e, providerId: unknown, method: unknown, code: unknown) =>
    attempt(async () => {
      if (typeof providerId !== 'string' || !SAFE_ID.test(providerId)) throw new Error('Choose a provider.')
      if (typeof method !== 'number' || !Number.isInteger(method) || method < 0) throw new Error('Choose a method.')
      return new EngineProvidersClient(await getEngineTarget()).finishOAuth(
        providerId,
        method,
        typeof code === 'string' && code.trim() ? code.trim().slice(0, 2048) : undefined,
      )
    }),
  )
  ipcMain.handle('engine:remove-credential', (_e, credentialId: unknown) =>
    attempt(async () => {
      if (typeof credentialId !== 'string' || !SAFE_ID.test(credentialId)) throw new Error('Unknown connection.')
      await new EngineIntegrationClient(await getEngineTarget()).removeCredential(credentialId)
      return true
    }),
  )
}
