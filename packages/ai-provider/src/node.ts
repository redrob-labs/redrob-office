/**
 * Main-process entry of @genoffice/ai-provider.
 *
 * Everything here runs a turn on the bundled engine and hosts Office's tools on a
 * loopback MCP server, so it needs `node:http` and `node:crypto`. Renderers import the
 * package root, which stays free of Node built-ins.
 */
export { chatForProvider } from './chat'
export { streamForProvider } from './stream'
export {
  DEFAULT_ENGINE_MODEL,
  ENGINE_RUN_IDLE_MS,
  EngineUnavailableError,
  activeEngineRuns,
  engineChat,
  engineErrorOf,
  engineStream,
  engineUnavailableMessage,
  setEngineTargetProvider,
  transcriptParts,
} from './engine-turn'
export type { EngineTargetProvider } from './engine-turn'
export { custodyKeys, holdsKeys, integrationForSlot, withoutKeys } from './key-custody'
export type { CustodyResult } from './key-custody'
export { currentEngineTarget } from './engine-turn'
export { readModelCapabilities } from './model-capabilities'
export {
  ENGINE_CONSOLE_RELAY,
  HostedToolUnavailableError,
  generateImage,
  hostedImageSearch,
  hostedToolSupport,
  hostedWebSearch,
  resetHostedToolSupport,
} from './hosted-tools'
export type { GenerateImageOptions, HostedImageResult, HostedTool, HostedWebResult } from './hosted-tools'
export { MEDIA_MAX_BYTES, MediaUnavailableError, analyzeMedia, loadMedia, pickMediaModel, transcribe } from './media'
export type { AnalyzeMediaOptions, MediaKind, TranscribeOptions } from './media'
export { startMcpHost } from './mcp-host'
export type { McpHost, McpToolResult } from './mcp-host'
