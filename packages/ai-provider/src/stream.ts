import type { AgentMessage, AgentToolDef } from '@genoffice/agent-core'
import { engineModelOf } from './engine-model'
import { engineStream } from './engine-turn'
import type { StreamCallbacks } from './protocols/shared'
import type { AiProviderConfig, AiProviderId } from './types'

export { AiCreditsError, sseLines } from './protocols/shared'
export type { StreamCallbacks } from './protocols/shared'
export { engineModelOf } from './engine-model'

/**
 * Streaming, tool-calling turn, run on the bundled Redrob engine (./engine-turn.ts).
 *
 * The engine holds every provider credential and makes the model call; Office names a
 * model (`config.model`, a `provider/model` id, default `redrob/auto`) and gets the answer.
 * The `provider` argument and any key or base URL in `config` are ignored. `maxTokens` is
 * the engine's to decide. A failure throws, and there is no fallback onto a direct call.
 */
export async function streamForProvider(
  _provider: AiProviderId,
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  _maxTokens: number,
  cb: StreamCallbacks,
): Promise<void> {
  await engineStream(engineModelOf(config), system, messages, tools, cb)
}
