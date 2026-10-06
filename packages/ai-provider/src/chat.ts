import { engineModelOf } from './engine-model'
import { engineChat } from './engine-turn'
import type { AiChatResponse, AiProviderConfig, AiProviderId } from './types'

/**
 * One-shot (non-streaming) chat, run on the bundled Redrob engine.
 *
 * The engine holds the credential and makes the call; Office names the model. The
 * `provider` argument and any key or base URL in `config` are ignored. A failure is
 * returned as `{ ok: false }` with the engine's reason, never answered some other way.
 */
export async function chatForProvider(
  _provider: AiProviderId,
  config: AiProviderConfig,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  try {
    const text = await engineChat(engineModelOf(config), system, user, signal)
    return { ok: true, content: text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
