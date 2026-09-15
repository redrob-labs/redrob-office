import type { AgentMessage, AgentToolDef } from '@genoffice/agent-core'
import type { StreamCallbacks } from './protocols/shared'
import { redrobEngineStream } from './redrob-engine'
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
): Promise<void> {
  await redrobEngineStream({ apiKey: config.apiKey }, system, messages, tools, maxTokens, cb)
}
