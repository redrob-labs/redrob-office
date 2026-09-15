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

/**
 * Process-lifetime inference runtime: resolve a plan, then hold one llama-server
 * on it. All knobs come from resolveExecutionPlan() — do not set them elsewhere.
 */

import {
  formatExecutionPlanLog,
  invalidateExecutionPlanCache,
  peekExecutionPlan,
  resolveExecutionPlan,
  type ExecutionPlan,
  type InferenceBackend,
  type ResolveExecutionPlanOptions,
} from "./execution-plan.js";
import {
  ensureLlamaServer,
  getLlamaServerStatus,
  requireLlamaServerBaseUrl,
  stopLlamaServer,
  type LlamaServerStatus,
} from "./llama-server.js";

export type { ExecutionPlan, InferenceBackend } from "./execution-plan.js";
export {
  resolveExecutionPlan,
  peekExecutionPlan,
  invalidateExecutionPlanCache,
  formatExecutionPlanLog,
  textModelIdFor,
  textModelIdForGrade,
  vramMeetsTextFloor,
  visionModelIdFor,
  weightsPathFor,
  recommendBackendForHost,
  NoSupportedBackendError,
  type BackendRecommendation,
} from "./execution-plan.js";
export {
  assembleInferencePrompt,
  truncateDocumentForContext,
  type InferencePromptParts,
} from "./prompt-assembly.js";

let activePlan: ExecutionPlan | null = null;

export function getActiveExecutionPlan(): ExecutionPlan | null {
  return activePlan ?? peekExecutionPlan();
}

export function getRuntimeStatus(): LlamaServerStatus {
  return getLlamaServerStatus();
}

/** Base URL of the running server. Throws when it is not up. */
export function inferenceBaseUrl(): string {
  return requireLlamaServerBaseUrl();
}

function planKey(plan: ExecutionPlan): string {
  return [plan.backendId, plan.modelPath, plan.mmprojPath ?? "", plan.contextSize].join("|");
}

/**
 * Resolve a plan and make sure the server is running on it. Repeated calls with
 * an unchanged plan reuse the process; a changed plan replaces it.
 */
export async function applyExecutionPlan(
  options: ResolveExecutionPlanOptions = {},
): Promise<ExecutionPlan> {
  const plan = await resolveExecutionPlan(options);
  if (activePlan && planKey(activePlan) === planKey(plan) && getLlamaServerStatus().running) {
    return plan;
  }
  await ensureLlamaServer({
    backendId: plan.backendId,
    modelPath: plan.modelPath,
    mmprojPath: plan.mmprojPath,
    contextSize: plan.contextSize,
    gpuLayers: plan.gpuLayers,
    modelId: plan.modelId,
  });
  activePlan = plan;
  return plan;
}

/** Drop the running server and the cached plan. */
export async function clearModelCache(): Promise<void> {
  stopLlamaServer();
  activePlan = null;
  invalidateExecutionPlanCache();
}

/** Idle preload: resolve the plan and get the weights resident. */
export async function preloadInference(
  options: ResolveExecutionPlanOptions = {},
): Promise<ExecutionPlan> {
  return applyExecutionPlan(options);
}

export function logActivePlan(log: (line: string) => void = console.info): void {
  const plan = getActiveExecutionPlan();
  if (plan) log(formatExecutionPlanLog(plan));
}

/** Force a fresh backend probe on the next apply (settings changed). */
export async function reconfigureInference(
  options: ResolveExecutionPlanOptions = {},
): Promise<ExecutionPlan> {
  await clearModelCache();
  return applyExecutionPlan(options);
}

export function backendOf(plan: ExecutionPlan): InferenceBackend {
  return plan.backend;
}
