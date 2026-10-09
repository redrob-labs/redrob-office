/**
 * The bundled engine holds the Redrob key, so Office holds none (AGENTS.md).
 *
 * `installEngineCustody` points `@genoffice/ai-provider` at the engine this shell spawns: Redrob turns
 * go to its `/v1/chat/completions`, and a key that arrives is stored with it. The engine still starts on
 * first use, not at launch (engine-lifecycle.ts).
 *
 * Before this, Office kept the key in `userData/ai-settings.json`. The first time the engine is up, a key
 * still in that file is moved into the engine and then removed from the file. If the engine refuses it,
 * the file is left alone and the move is tried again next time, so a key is never lost on the way.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

import {
  EngineIntegrationClient,
  REDROB_ENGINE_ID,
  REDROB_INTEGRATION_ID,
  setEngineCustody,
  type EngineTarget,
} from '@genoffice/ai-provider'

import { ensureEngine } from './engine-lifecycle'

const settingsPath = () => join(app.getPath('userData'), 'ai-settings.json')

type StoredSettings = { providers?: Record<string, { apiKey?: string } & Record<string, unknown>> } & Record<string, unknown>

/** Moves a key still in the settings file into the engine. Exported for tests. */
export async function moveStoredKey(
  target: EngineTarget,
  path: string,
  client: (target: EngineTarget) => Pick<EngineIntegrationClient, 'connectKey'> = (t) => new EngineIntegrationClient(t),
): Promise<boolean> {
  let stored: StoredSettings
  try {
    stored = JSON.parse(readFileSync(path, 'utf8')) as StoredSettings
  } catch {
    return false
  }
  const slot = stored.providers?.[REDROB_ENGINE_ID]
  const key = slot?.apiKey?.trim()
  if (!slot || !key) return false
  await client(target).connectKey(REDROB_INTEGRATION_ID, key, 'Redrob Office')
  slot.apiKey = ''
  writeFileSync(path, JSON.stringify(stored, null, 2), 'utf8')
  return true
}

export function installEngineCustody(): void {
  let moved: Promise<unknown> | null = null
  setEngineCustody({
    target: async () => {
      const engine = await ensureEngine(app.getPath('userData'))
      const target: EngineTarget = { baseUrl: engine.baseUrl, username: engine.username, password: engine.password }
      // Once per launch; a failed move is retried on the next launch rather than on every turn.
      moved ??= moveStoredKey(target, settingsPath()).catch((error: unknown) => {
        console.warn('[engine-custody] could not move the stored Redrob key into the engine:', error instanceof Error ? error.message : String(error))
      })
      await moved
      return target
    },
  })
}
