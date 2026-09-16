export type {
  AiChatRequest,
  AiChatResponse,
  AiProviderConfig,
  AiProviderId,
  AiProviderMeta,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  GenSparkAccountStatus,
  LegacyAiSettings,
} from './types'
export {
  AI_PROVIDERS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MAX_MAX_OUTPUT_TOKENS,
  MIN_MAX_OUTPUT_TOKENS,
  REDROB_ENGINE_ID,
  activeProvider,
  clampMaxOutputTokens,
  cloudToolsEnabled,
  defaultAiSettings,
  maxOutputTokensOf,
  resolveAiSettings,
} from './providers'
export { AI_PROVIDER_ADAPTERS, getProviderAdapter, modelLacksVision } from './registry'
export {
  ENGINE_CAPABILITIES_TTL_MS,
  FALLBACK_ENGINE_CAPABILITIES,
  engineCapabilities,
  loadEngineCapabilities,
  resetEngineCapabilitiesCache,
  selectEngineCapabilities,
} from './console-capabilities'
export type { EngineCapabilities } from './console-capabilities'
export type {
  AiProtocol,
  ProviderAdapter,
  ProviderCapabilities,
  ResolvedEndpoint,
} from './registry'
export type {
  DeviceAuthorization,
  DeviceConnectDeps,
  DeviceConnectOutcome,
  DeviceKey,
  DeviceProduct,
} from './device-connect'
export {
  formatUserCode,
  pollDeviceToken,
  runDeviceConnect,
  startDeviceAuthorization,
} from './device-connect'
export { chatForProvider } from './chat'
export {
  REDROB_CONSOLE_API_BASE,
  REDROB_ENGINE_MODEL,
  REDROB_ENGINE_ROUTE,
  hasDegradedSteering,
  redrobEngineChat,
  redrobEngineStream,
  redrobEngineUnavailableMessage,
} from './redrob-engine'
export type { RedrobEngineAuth } from './redrob-engine'
export { setRescueFetch } from './fetch'
export { isAiNetworkError } from './network-error'
export { isAiOverloadedError } from './overload-error'
export { AiCreditsError, sseLines, streamForProvider } from './stream'
export type { StreamCallbacks } from './stream'
export {
  AI_CHAT_RESPONSE_TIMEOUT_MS,
  AI_CONNECT_TIMEOUT_MS,
  AI_IDLE_TIMEOUT_MS,
  AiTimeoutError,
  createStreamWatchdog,
} from './watchdog'
export type { StreamWatchdog } from './watchdog'
