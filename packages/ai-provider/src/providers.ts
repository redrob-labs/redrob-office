import type { AiProviderId, AiProviderMeta, AiSettings, LegacyAiSettings } from './types'

// Redrob Office runs on ONE engine: the Redrob Console (see redrob-office/AGENTS.md).
// There is no BYOK, no provider selection, no configurable inference server URL,
// and no third-party vendor display name or vendor base URL in the exported
// surface. GenOffice's per-vendor catalog (Claude/Gemini/OpenAI/DeepSeek/... with
// their base URLs and product labels) is gone: every catalog entry is labeled as
// the single Redrob engine, and the endpoint routing (in ./registry and, at
// runtime, ./redrob-engine) is hard-pinned to the Console base.
//
// The ported GenOffice editors still pass a `provider` id and per-provider config
// through this package exactly as upstream did, and their verbatim tests still
// index `providers.<id>` and read per-id capability metadata, so the id keys are
// preserved for source/behavior compatibility. The ids are internal enum keys,
// not user-facing labels, and none of them carries a routable vendor endpoint.

/** The single engine slot the settings UI persists the Redrob Console key under. */
export const REDROB_ENGINE_ID: AiProviderId = 'genspark'

/**
 * The provider catalog. Every entry is the single Redrob engine: no vendor
 * display name (all labeled 'Redrob') and no vendor base URL anywhere. The id
 * keys and their `defaultModel`/`models` metadata are kept so the ported editors
 * and their verbatim tests, which index `providers.<id>` and gate on model-family
 * heuristics, keep working; routing ignores all of it and targets the fixed
 * Console base (see ./redrob-engine). Fresh defaults intentionally leave
 * `defaultModel` empty for the Redrob slot: the wire model is always
 * `REDROB_ENGINE_MODEL` (`auto`), so an empty settings model must not fail
 * preflight in the editor apps.
 */
export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: 'genspark',
    label: 'Redrob',
    models: [],
    defaultModel: '',
    keyPlaceholder: 'Redrob Console API key',
  },
  { id: 'anthropic', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  { id: 'gemini', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  {
    // The default model id is kept verbatim so modelLacksVision still flags it
    // text-only, matching the ported editors' behavior and their verbatim tests.
    // It is a model identifier in copied editor code, not a routable endpoint.
    id: 'deepseek',
    label: 'Redrob',
    models: [],
    defaultModel: 'deepseek-v4-pro',
    keyPlaceholder: '',
  },
  { id: 'openai', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  { id: 'kimi', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  { id: 'glm', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  { id: 'qwen', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  { id: 'doubao', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  { id: 'minimax', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  { id: 'xai', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  { id: 'mistral', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  { id: 'openrouter', label: 'Redrob', models: [], defaultModel: '', keyPlaceholder: '' },
  {
    id: 'custom',
    label: 'Redrob',
    models: [],
    defaultModel: '',
    keyPlaceholder: '',
    needsBaseUrl: true,
  },
]

/**
 * Fresh settings for the single Redrob engine with an empty key. `defaultApiKeys`
 * lets a host preconfigure the Console key; this package has no hardcoded keys.
 * All id slots are populated (as upstream did) so the ported editors that index
 * `providers.<id>` keep working; only the Redrob engine slot is ever routed.
 */
export function defaultAiSettings(
  defaultApiKeys?: Partial<Record<AiProviderId, string>>,
): AiSettings {
  const providers = {} as AiSettings['providers']
  for (const meta of AI_PROVIDERS) {
    providers[meta.id] = {
      apiKey: defaultApiKeys?.[meta.id] ?? '',
      model: meta.defaultModel,
      baseUrl: meta.needsBaseUrl ? '' : undefined,
    }
  }
  return { provider: REDROB_ENGINE_ID, providers, gskToolsEnabled: true }
}

/** false only on an explicit opt-out; absent (pre-toggle settings files) means on */
export function cloudToolsEnabled(settings: Pick<AiSettings, 'gskToolsEnabled'>): boolean {
  return settings.gskToolsEnabled !== false
}

/**
 * There is one engine, so the stored provider selection always normalizes to the
 * single Redrob engine slot. A hand-edited settings file can carry any id from
 * the historical union (or an unknown one); all resolve here to the one engine,
 * and routing is fixed regardless (see ./redrob-engine).
 */
export function activeProvider(_settings: AiSettings): AiProviderId {
  return REDROB_ENGINE_ID
}

/**
 * Per-turn output cap applied when the settings carry none. Reasoning turns bill
 * their thinking against this same budget, so a heavy edit turn can consume all
 * of it and close with finish_reason=length and no prose (see
 * AiSettings.maxOutputTokens).
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192
/** bounds accepted for AiSettings.maxOutputTokens: below the first a short answer cannot even finish, above the second one turn risks the whole context window */
export const MIN_MAX_OUTPUT_TOKENS = 1024
export const MAX_MAX_OUTPUT_TOKENS = 131072

/** Out-of-range or non-finite input falls back to a bound / the default (a mistyped settings field must not kill AI features) */
export function clampMaxOutputTokens(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : Number.NaN
  if (!Number.isFinite(n)) return DEFAULT_MAX_OUTPUT_TOKENS
  return Math.min(MAX_MAX_OUTPUT_TOKENS, Math.max(MIN_MAX_OUTPUT_TOKENS, n))
}

/** The effective per-turn output cap of a settings object (clamped; absent → default) */
export function maxOutputTokensOf(
  settings: Pick<AiSettings, 'maxOutputTokens'> | null | undefined,
): number {
  return settings?.maxOutputTokens === undefined
    ? DEFAULT_MAX_OUTPUT_TOKENS
    : clampMaxOutputTokens(settings.maxOutputTokens)
}

/** pasted keys/URLs often carry stray whitespace, which turns into a 401 with a valid key */
function trimConfigs(providers: AiSettings['providers']): AiSettings['providers'] {
  const trimmed = { ...providers }
  for (const [id, config] of Object.entries(trimmed)) {
    trimmed[id as AiProviderId] = {
      ...config,
      apiKey: config.apiKey?.trim() ?? '',
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl.trim() } : {}),
    }
  }
  return trimmed
}

/**
 * Merge on-disk settings over freshly computed defaults. `stored` is whatever the
 * caller read from its settings file (already JSON-parsed); this function does no
 * file I/O. There is one engine, so the resolved provider is always normalized to
 * the single Redrob engine slot.
 */
export function resolveAiSettings(
  stored: Partial<AiSettings> & LegacyAiSettings,
  defaults: AiSettings,
): AiSettings {
  if (!stored.providers) {
    if (stored.apiKey) {
      defaults.providers.custom = {
        apiKey: stored.apiKey.trim(),
        model: stored.model ?? '',
        baseUrl: (stored.baseUrl ?? '').trim(),
      }
    }
    return { ...defaults, provider: REDROB_ENGINE_ID }
  }
  return {
    provider: REDROB_ENGINE_ID,
    providers: trimConfigs({ ...defaults.providers, ...stored.providers }),
    gskToolsEnabled: stored.gskToolsEnabled ?? defaults.gskToolsEnabled ?? true,
    // clamped on read: a hand-edited settings file with an absurd cap must not be
    // forwarded to the endpoint verbatim
    ...(stored.maxOutputTokens !== undefined || defaults.maxOutputTokens !== undefined
      ? {
          maxOutputTokens: clampMaxOutputTokens(stored.maxOutputTokens ?? defaults.maxOutputTokens),
        }
      : {}),
  }
}
