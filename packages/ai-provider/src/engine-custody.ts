/**
 * Who holds the Redrob key: the bundled engine, never Office.
 *
 * "Office never holds a provider key" (AGENTS.md). The shell's main process sets a custody here at
 * start-up, naming how to reach the engine it spawns. From then on:
 *
 *   - a Redrob turn goes to the engine's `/v1/chat/completions`, which calls the console with the key the
 *     engine holds (redrob-code docs/LOCAL-ENGINE-API.md);
 *   - a key that arrives (Connect Redrob, the Settings field, an old `ai-settings.json`) is handed to the
 *     engine with `connectKey` and not kept;
 *   - whether Redrob is connected is the engine's answer, since Office has nothing to look at.
 *
 * No custody (an editor run standalone in development, without the shell) keeps the direct console call
 * with a key from settings, which is how those builds worked before.
 *
 * Injected rather than imported, like `setRescueFetch`, because the engine is a shell concern and this
 * package must stay free of Electron.
 */
import { EngineIntegrationClient, type EngineTarget, type FetchLike } from './engine-integration'

/** The engine integration the Redrob Console key belongs to. */
export const REDROB_INTEGRATION_ID = 'redrob'

export interface EngineCustody {
  /** The running engine, started on first use. Rejects when it cannot be started. */
  target(): Promise<EngineTarget>
  fetch?: FetchLike
}

let custody: EngineCustody | null = null

export function setEngineCustody(next: EngineCustody | null): void {
  custody = next
}

export function engineCustody(): EngineCustody | null {
  return custody
}

async function client(held: EngineCustody): Promise<EngineIntegrationClient> {
  return new EngineIntegrationClient(await held.target(), held.fetch)
}

/** Hand a Redrob key to the engine. Throws when there is no custody, so a key is never dropped silently. */
export async function storeRedrobKey(key: string): Promise<void> {
  if (!custody) throw new Error('no engine holds keys in this process')
  await (await client(custody)).connectKey(REDROB_INTEGRATION_ID, key.trim(), 'Redrob Office')
}

/** Whether the engine holds a Redrob key. False when the engine cannot be reached: nothing confirms one. */
export async function redrobConnected(): Promise<boolean> {
  if (!custody) return false
  try {
    const integrations = await (await client(custody)).list()
    return integrations.some((entry) => entry.id === REDROB_INTEGRATION_ID && entry.connected)
  } catch {
    return false
  }
}
