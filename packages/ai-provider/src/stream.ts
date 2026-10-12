import type { AgentMessage, AgentToolDef } from '@genoffice/agent-core'
import type { StreamCallbacks } from './protocols/shared'
import { engineCustody } from './engine-custody'
import { redrobEngineStream, type RedrobEngineAuth } from './redrob-engine'
import type { AiProviderConfig, AiProviderId } from './types'

export { AiCreditsError, sseLines } from './protocols/shared'
export type { StreamCallbacks } from './protocols/shared'

/**
 * Streaming, tool-calling turn, routed to the single Redrob Console engine.
 *
 * The `provider` argument is ignored: there is one engine, no provider
 * selection, and no BYOK. `config.apiKey` carries the Redrob Console key; the
 * base URL and model are fixed by policy. A failure throws (the caller renders
 * the Redrob honest-failure notice); there is no silent fallback onto another
 * loop.
 */
export async function streamForProvider(
  _provider: AiProviderId,
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
  session?: string,
): Promise<void> {
  const held = engineCustody()
  // With custody the engine holds the key and makes the call; a failure to start it propagates, so the
  // turn fails visibly instead of falling back to a key Office should not have.
  const auth: RedrobEngineAuth = held ? { engine: await held.target(), session } : { apiKey: config.apiKey }
  await redrobEngineStream(auth, system, messages, tools, maxTokens, cb)
}
