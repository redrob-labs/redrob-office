import { engineCustody } from './engine-custody'
import { redrobEngineChat, redrobEngineUnavailableMessage, type RedrobEngineAuth } from './redrob-engine'
import type { AiChatResponse, AiProviderConfig, AiProviderId } from './types'

/**
 * One-shot (non-streaming) chat, routed to the single Redrob Console engine.
 *
 * The `provider` argument is ignored: Redrob Office has one engine and no
 * provider selection or BYOK. `config.apiKey` carries the Redrob Console key the
 * app resolved from its AI settings (the only accepted key is one issued at
 * https://console.redrob.ai); an empty key yields the honest-failure notice
 * rather than a keyless request. The base URL and model are fixed by policy and
 * cannot be overridden here.
 */
export async function chatForProvider(
  _provider: AiProviderId,
  config: AiProviderConfig,
  system: string,
  user: string,
  signal?: AbortSignal,
  session?: string,
): Promise<AiChatResponse> {
  const held = engineCustody()
  let auth: RedrobEngineAuth = { apiKey: config.apiKey }
  // A key in the request is one the person just typed and is testing in Settings before saving it; it
  // is tried as typed. Every other turn carries none, and goes through the engine.
  if (held && !config.apiKey.trim()) {
    try {
      auth = { engine: await held.target(), session }
    } catch (error) {
      return { ok: false, error: redrobEngineUnavailableMessage(error instanceof Error ? error.message : String(error)) }
    }
  }
  return redrobEngineChat(auth, system, user, signal)
}
