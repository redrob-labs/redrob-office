export type {
  AiChatRequest,
  AiChatResponse,
  AiProviderConfig,
  AiProviderId,
  AiProviderMeta,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  AiTurnUsage,
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
  capabilitiesFromEngineModel,
  engineCapabilities,
  fetchConsoleImageModels,
  imageModelsFromCatalogue,
  loadEngineCapabilities,
  modelCapabilities,
  resetEngineCapabilitiesCache,
  selectEngineCapabilities,
  setModelCapabilities,
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
export {
  REDROB_CONSOLE_API_BASE,
  REDROB_ENGINE_MODEL,
  REDROB_ENGINE_ROUTE,
  hasDegradedSteering,
  redrobEngineUnavailableMessage,
} from './redrob-engine'
export { setRescueFetch } from './fetch'
export { AiAuthError, isAiAuthError } from './auth-error'
export { isAiNetworkError } from './network-error'
export { isAiOverloadedError } from './overload-error'
// Running a turn needs Node built-ins: main processes import it from '@genoffice/ai-provider/node'.
export { AiCreditsError, sseLines } from './protocols/shared'
export type { StreamCallbacks } from './protocols/shared'
export { DEFAULT_ENGINE_MODEL, engineModelOf } from './engine-model'
export {
  AI_CHAT_RESPONSE_TIMEOUT_MS,
  AI_CONNECT_TIMEOUT_MS,
  AI_IDLE_TIMEOUT_MS,
  AiTimeoutError,
  createStreamWatchdog,
} from './watchdog'
export type { StreamWatchdog } from './watchdog'
export {
  EngineIntegrationClient,
  EngineIntegrationError,
  toEngineIntegration,
} from './engine-integration'
export type {
  EngineIntegration,
  EngineTarget,
  IntegrationConnection,
  IntegrationMethod,
  IntegrationPrompt,
  OAuthAttempt,
  OAuthAttemptStatus,
} from './engine-integration'
export {
  ENGINE_BUILTIN_TOOLS,
  EngineClient,
  EngineError,
  OFFICE_AGENT,
  officeEngineConfig,
  splitModelId,
  toEngineModel,
} from './engine-client'
export type { EngineEvent, EngineModel, EnginePromptBody, EnginePromptPart } from './engine-client'
export { EngineProvidersClient, EngineProvidersError } from './engine-providers'
export type { ProviderConnection, ProviderMethod, ProviderOAuthStart } from './engine-providers'
