/*
 * Copyright 2026 Redrob
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export {
  applyExecutionPlan,
  backendOf,
  clearModelCache,
  formatExecutionPlanLog,
  getActiveExecutionPlan,
  getRuntimeStatus,
  inferenceBaseUrl,
  invalidateExecutionPlanCache,
  logActivePlan,
  peekExecutionPlan,
  preloadInference,
  reconfigureInference,
  recommendBackendForHost,
  resolveExecutionPlan,
  textModelIdFor,
  textModelIdForGrade,
  vramMeetsTextFloor,
  visionModelIdFor,
  weightsPathFor,
  NoSupportedBackendError,
  assembleInferencePrompt,
  truncateDocumentForContext,
  type BackendRecommendation,
  type ExecutionPlan,
  type InferenceBackend,
  type InferencePromptParts,
} from "./runtime.js";

export {
  BACKENDS,
  BACKEND_IDS,
  LLAMA_CPP_COMMIT,
  LLAMA_CPP_RELEASE,
  backendDescriptor,
  backendDownloadBytes,
  backendSupportsVision,
  backendsForHost,
  type BackendArchive,
  type BackendDescriptor,
  type BackendEngine,
  type BackendId,
} from "../runtime/backend-matrix.js";

export {
  ensureLlamaServer,
  getLlamaServerStatus,
  llamaServerAuthHeaders,
  llamaServerApiKey,
  requireLlamaServerBaseUrl,
  resolveServerBinary,
  restartLlamaServer,
  setLlamaServerFailureHandler,
  shutdownLlamaServer,
  stopLlamaServer,
  resetLlamaServerForTests,
  ERR_CRASHED,
  ERR_HEALTH_TIMEOUT,
  ERR_NO_BINARY,
  ERR_NO_WEIGHTS,
  ERR_SUPERSEDED,
  type LlamaServerConfig,
  type LlamaServerStatus,
} from "./llama-server.js";

// Field-fill: one implementation, over llama-server /completion. The historical
// names are kept so call sites did not have to change with the transport.
export {
  generateFieldFillHttp as generateFieldFill,
  generateFieldFillHttp,
  HttpFieldFillSession as FieldFillSession,
  HttpFieldFillSession,
  resetFieldFillHttpCaches,
} from "./field-fill-http.js";

export {
  QWEN35_JINJA_NON_THINK_ASSISTANT_SUFFIX,
  assertQwen35AssistantSuffix,
  buildPreamble,
  completedLinesText,
  leafKey,
  sanitizeValueRaw,
  type FieldFillResultItem,
  type FieldFillSessionOptions,
  type GenerateFieldFillOptions,
  type GenerateFieldFillResult,
} from "./field-fill-prompt.js";

export {
  generateChatHttp,
  generateTextHttp,
  type ChatHttpOptions,
  type ChatHttpResult,
  type ChatMessage,
} from "./chat-http.js";

export {
  generateFieldFillRemote,
  type GenerateFieldFillRemoteOptions,
} from "./field-fill-remote.js";

export {
  assertFieldGrammarsCompile,
  assertGbnfCompiles,
  assertSchemaFieldsGrammarsCompile,
} from "./assert-grammars.js";

export {
  FieldFillGrammarCache,
  grammarCacheKey,
  hashDocument,
  CACHED_GRAMMAR_STOP_TRIGGERS,
} from "./grammar-cache.js";
