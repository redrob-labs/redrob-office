import { redrobEngineChat } from './redrob-engine'
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
): Promise<AiChatResponse> {
  return redrobEngineChat({ apiKey: config.apiKey }, system, user, signal)
}
