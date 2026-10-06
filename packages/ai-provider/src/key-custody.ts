/**
 * Key custody: Office never keeps a provider key.
 *
 * A key reaches Office in three ways: the person pastes one in Settings, Connect Redrob
 * receives one from Console, or an older build left one in `userData/ai-settings.json`.
 * Each is handed to the engine's credential store (`connect/key`) and dropped. What Office
 * stores is the model it names, nothing else (redrob-office/AGENTS.md, 2026-09-22).
 */
import { EngineIntegrationClient, type EngineTarget, type FetchLike } from './engine-integration'
import { REDROB_ENGINE_ID } from './providers'
import type { AiProviderId, AiSettings } from './types'

/** The engine integration a legacy settings slot's key belongs to. */
export function integrationForSlot(slot: AiProviderId | string): string | null {
  if (slot === REDROB_ENGINE_ID || slot === 'redrob') return 'redrob'
  if (slot === 'custom') return null // a custom endpoint was a base URL, which is never honoured
  if (slot === 'gemini') return 'google'
  return slot
}

/** The same settings with every key blanked. */
export function withoutKeys(settings: AiSettings): AiSettings {
  const providers = Object.fromEntries(
    Object.entries(settings.providers ?? {}).map(([id, cfg]) => {
      const { baseUrl: _drop, ...rest } = cfg ?? { apiKey: '', model: '' }
      return [id, { ...rest, apiKey: '' }]
    }),
  ) as AiSettings['providers']
  return { ...settings, providers }
}

/** True when some slot still carries a key. */
export function holdsKeys(settings: AiSettings): boolean {
  return Object.values(settings.providers ?? {}).some((cfg) => typeof cfg?.apiKey === 'string' && cfg.apiKey.trim() !== '')
}

export type CustodyResult = {
  settings: AiSettings
  /** Integrations a key was stored for. */
  stored: string[]
  /** Slots whose key had nowhere to go (a custom endpoint); dropped, not kept. */
  dropped: string[]
}

/**
 * Move every key in `settings` into the engine and return the settings without them.
 * Throws when the engine refuses a key, so the caller can keep the old file and retry
 * rather than lose a key the person typed.
 */
export async function custodyKeys(settings: AiSettings, target: EngineTarget, fetchImpl?: FetchLike): Promise<CustodyResult> {
  const client = new EngineIntegrationClient(target, fetchImpl)
  const stored: string[] = []
  const dropped: string[] = []
  for (const [slot, cfg] of Object.entries(settings.providers ?? {})) {
    const key = cfg?.apiKey?.trim()
    if (!key) continue
    const integration = integrationForSlot(slot)
    if (!integration) {
      dropped.push(slot)
      continue
    }
    await client.connectKey(integration, key, 'Redrob Office')
    stored.push(integration)
  }
  return { settings: withoutKeys(settings), stored, dropped }
}
