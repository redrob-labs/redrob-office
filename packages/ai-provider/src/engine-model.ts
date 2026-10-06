import type { AiProviderConfig } from './types'

/** The default route: Console `auto`, as the engine names it. */
export const DEFAULT_ENGINE_MODEL = 'redrob/auto'

/**
 * The engine model a settings slot names. A bare legacy id (or the old `auto` default) is
 * the Redrob route; anything else must already be `provider/model`.
 */
export function engineModelOf(config: Pick<AiProviderConfig, 'model'> | undefined): string {
  const model = config?.model?.trim()
  if (!model || model === 'auto' || model === 'redrob-ai') return DEFAULT_ENGINE_MODEL
  return model.includes('/') ? model : `redrob/${model}`
}
