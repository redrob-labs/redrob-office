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
 * Single source of truth for local inference knobs.
 * Call sites must not set backend / model / context independently.
 *
 * One model family (Qwen3.5) and one runtime (llama-server). The size is the
 * local model grade — flash is 4B, pro is 9B — and VRAM only
 * decides whether that choice will be comfortable, not whether it is allowed.
 * There is no CPU backend and no second text family to switch to.
 */

import { access } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";

import type { MemTier } from "../bench/types.js";
import { dedicatedVramMib, detectNvidiaDgpu, detectOtherGpu } from "../gpu-detect.js";
import {
  GRADE_VRAM_MIB,
  LOCAL_GRADE_MODELS,
  localModelIdForGrade,
  readModelGradeFromEnv,
  vramMeetsGrade,
  type ModelGrade,
} from "../grades.js";
import { MODEL_ARTIFACTS, type ModelArtifact } from "../models.js";
import { defaultModelsDir } from "../paths.js";
import {
  backendDescriptor,
  backendsForHost,
  type BackendId,
  type BackendEngine,
} from "../runtime/backend-matrix.js";
import { resolveServerBinary } from "./llama-server.js";
import type { Tier } from "../types.js";
import { mmprojPathForArtifact, modelPathForArtifact } from "../weights/resolve.js";

/** Engine the plan runs on. GPU only — there is no CPU inference path. */
export type InferenceBackend = BackendEngine;

export type ExecutionPlan = {
  backend: InferenceBackend;
  backendId: BackendId;
  modelId: string;
  modelPath: string;
  /** Null when the backend build cannot load a projector (OpenVINO). */
  mmprojPath: string | null;
  supportsVision: boolean;
  gpuLayers: number;
  threads: number;
  contextSize: number;
  batchSize: number;
  /** Why this backend/model was chosen. */
  reason: string;
  /** True when preferred weights were missing and a smaller on-disk model is used. */
  usingFallbackModel: boolean;
  /** Hint that preferred weights should be downloaded. */
  downloadSuggestedModelId: string | null;
};

export interface ResolveExecutionPlanOptions {
  memTier?: Tier | MemTier;
  modelsDir?: string;
  /** Which local model to load (also via REDROB_MODEL_GRADE). */
  grade?: ModelGrade;
  /** Force a backend (also via REDROB_BACKEND). */
  backendOverride?: BackendId | "auto";
  /** Skip probing the installed binary; OS/driver heuristics only. */
  skipBackendProbe?: boolean;
}

let cachedPlan: ExecutionPlan | null = null;
let cachedPlanKey = "";

/**
 * The smallest text model the Office will run: the flash-grade local weights.
 *
 * 2B is in the catalog and loads fine, but it cannot hold a tool schema, a
 * staff scope and a typed output contract in one turn: it answers in prose and
 * every turn lands as "Unusable output: no typed message". A floor is the
 * honest way to say that, rather than shipping a size that produces work
 * nobody can use.
 */
const TEXT_MODEL_FLOOR = LOCAL_GRADE_MODELS.flash;

function envBackendOverride(): BackendId | "auto" | undefined {
  const raw = process.env.REDROB_BACKEND?.trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "auto") return "auto";
  const match = backendsForHost().find(
    (backend) => backend.id === raw || backend.engine === raw,
  );
  return match?.id;
}

function packTier(): Tier {
  const fromEnv = process.env.REDROB_PACK_TIER as Tier | undefined;
  if (fromEnv === "T4" || fromEnv === "T8" || fromEnv === "T16") return fromEnv;
  return "T4";
}

/**
 * The text model behind a grade. Vision uses the same artifact — one LM is
 * loaded for both, so there is nothing separate to size.
 */
export function textModelIdForGrade(grade: ModelGrade): string {
  return localModelIdForGrade(grade);
}

/** Kept for callers that still reason in memory tiers (pack sizing, telemetry). */
export function textModelIdFor(_memTier: Tier | MemTier): string {
  return TEXT_MODEL_FLOOR;
}

/** True when this machine has the VRAM the floor model wants. */
export function vramMeetsTextFloor(vramMib: number | null): boolean {
  return vramMeetsGrade(vramMib, "flash");
}

/** Vision shares the text LM; the projector comes from the same repo. */
export function visionModelIdFor(memTier: Tier | MemTier): string {
  return textModelIdFor(memTier);
}

/**
 * Substitutes allowed when the preferred weights are missing, smallest first.
 *
 * Nothing below the floor belongs here. Falling back to 2B is what turned a
 * missing download into turns that ran and produced unusable answers, which is
 * worse than saying the weights are not there. Pro falling back to Flash is
 * fine: it is smaller, but it still clears the contract.
 */
const TEXT_SIZE_ORDER = [LOCAL_GRADE_MODELS.flash, LOCAL_GRADE_MODELS.pro] as const;

async function artifactPresent(
  artifact: ModelArtifact,
  modelsDir: string,
  backend: InferenceBackend,
): Promise<boolean> {
  try {
    await access(weightsPathFor(artifact, modelsDir, backend), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * OpenVINO reads a different quantization (Q4_0) from every other backend, so the
 * weights path depends on the engine, not just the artifact.
 */
export function weightsPathFor(
  artifact: ModelArtifact,
  modelsDir: string,
  backend: InferenceBackend,
): string {
  if (backend === "openvino" && artifact.openvinoFile) {
    return modelPathForArtifact({ ...artifact, hfFile: artifact.openvinoFile }, modelsDir);
  }
  return modelPathForArtifact(artifact, modelsDir);
}

async function resolveTextModelOnDisk(
  preferredId: string,
  modelsDir: string,
  backend: InferenceBackend,
): Promise<{
  modelId: string;
  modelPath: string;
  usingFallback: boolean;
  downloadSuggested: string | null;
}> {
  const preferred = MODEL_ARTIFACTS[preferredId];
  if (preferred && (await artifactPresent(preferred, modelsDir, backend))) {
    return {
      modelId: preferredId,
      modelPath: weightsPathFor(preferred, modelsDir, backend),
      usingFallback: false,
      downloadSuggested: null,
    };
  }

  // Prefer a smaller on-disk model over inventing a path that is not there.
  for (const id of TEXT_SIZE_ORDER) {
    if (id === preferredId) continue;
    const artifact = MODEL_ARTIFACTS[id];
    if (!artifact) continue;
    if (await artifactPresent(artifact, modelsDir, backend)) {
      return {
        modelId: id,
        modelPath: weightsPathFor(artifact, modelsDir, backend),
        usingFallback: true,
        downloadSuggested: preferredId,
      };
    }
  }

  // Nothing on disk — return the preferred path so setup can offer the download.
  const fallback = preferred ?? MODEL_ARTIFACTS[TEXT_MODEL_FLOOR]!;
  return {
    modelId: fallback.id,
    modelPath: weightsPathFor(fallback, modelsDir, backend),
    usingFallback: false,
    downloadSuggested: preferredId,
  };
}

/**
 * Thread budget for llama-server. Prefer node:os — systeminformation's
 * `si.cpu()` talks to WMI on Windows and has hung the Settings save path
 * (and Windows CI) for tens of seconds with no timeout.
 */
async function physicalCoreCount(): Promise<number> {
  const logical = os.cpus().length;
  if (logical > 0) return Math.max(2, Math.floor(logical / 2));
  return 4;
}

export class NoSupportedBackendError extends Error {
  constructor(reason: string) {
    super(
      `ERR_NO_GPU_BACKEND: Redrob Office requires a supported GPU backend. ${reason}`,
    );
    this.name = "NoSupportedBackendError";
  }
}

export interface BackendRecommendation {
  /** The backend to run on, or the one to install when `installed` is false. */
  backendId: BackendId;
  /** The detection chain that led here, for logs and setup copy. */
  reasonParts: string[];
  /** Whether a llama-server binary for `backendId` is already on disk. */
  installed: boolean;
}

/**
 * Which backend this machine should run, from hardware then from what is
 * actually installed.
 *
 * There is no probe-and-fall-back-to-CPU chain: llama-server is a separate
 * process, so the real question is whether its binary is present for the
 * hardware's choice. When nothing is installed this still names a backend -
 * the one the hardware wants - because setup needs something to offer.
 *
 * OpenVINO is never auto-selected. Distinguishing a VPU 4.0 NPU or an Xe-LPG
 * iGPU from older Intel silicon is not something we can do reliably from Node,
 * and picking it wrongly is worse than not picking it, so it requires an
 * explicit choice in setup or REDROB_BACKEND.
 */
export async function recommendBackendForHost(): Promise<BackendRecommendation> {
  const reasonParts: string[] = [];
  const available = backendsForHost();
  if (available.length === 0) {
    throw new NoSupportedBackendError(
      `No backend is published for ${process.platform}/${process.arch}.`,
    );
  }

  // Walked in hardware preference order and stopped at the first backend that
  // is actually installed, so the chain reads as the decision that was made
  // rather than as every probe that ran.
  let firstMatch: BackendId | null = null;
  const consider = (engine: BackendEngine, label: string): BackendId | null => {
    const backend = available.find((candidate) => candidate.engine === engine);
    if (!backend) return null;
    reasonParts.push(label);
    if (resolveServerBinary(backend.id) !== null) return backend.id;
    firstMatch ??= backend.id;
    reasonParts.push(`${backend.id} not installed`);
    return null;
  };

  if (process.platform === "darwin") {
    const hit = consider("metal", "macOS arm64 → Metal");
    if (hit) return { backendId: hit, reasonParts, installed: true };
  }

  if (await detectNvidiaDgpu()) {
    const hit = consider("cuda", "NVIDIA dGPU detected → CUDA");
    if (hit) return { backendId: hit, reasonParts, installed: true };
  } else {
    reasonParts.push("no NVIDIA dGPU");
  }

  if (await detectOtherGpu()) {
    const hit = consider("vulkan", "Intel/AMD GPU present → Vulkan");
    if (hit) return { backendId: hit, reasonParts, installed: true };
  } else {
    reasonParts.push("no Vulkan-candidate GPU");
  }

  // Nothing installed. Offer what the hardware asked for, falling back to the
  // most broadly useful build when the hardware matched nothing at all.
  const fallback =
    firstMatch ??
    (
      available.find((backend) => backend.engine === "cuda") ??
      available.find((backend) => backend.engine === "vulkan") ??
      available[0]!
    ).id;
  return { backendId: fallback, reasonParts, installed: false };
}

async function pickBackend(
  override: BackendId | "auto" | undefined,
  skipBackendProbe: boolean,
): Promise<{ backendId: BackendId; reasonParts: string[] }> {
  if (override && override !== "auto") {
    return { backendId: override, reasonParts: [`REDROB_BACKEND=${override}`] };
  }

  const { backendId, reasonParts, installed } = await recommendBackendForHost();
  if (installed) return { backendId, reasonParts };
  if (skipBackendProbe) {
    return { backendId, reasonParts: [...reasonParts, `${backendId} assumed (probe skipped)`] };
  }
  throw new NoSupportedBackendError(
    `${reasonParts.join(" → ")}. Install the ${backendId} backend from setup.`,
  );
}

function planKey(options: ResolveExecutionPlanOptions): string {
  return [
    options.memTier ?? packTier(),
    options.modelsDir ?? defaultModelsDir(),
    options.grade ?? readModelGradeFromEnv(),
    options.backendOverride ?? envBackendOverride() ?? "",
    process.env.REDROB_BACKEND ?? "",
    options.skipBackendProbe ? "skip-probe" : "probe",
  ].join("|");
}

/** Resolve backend + model + runtime knobs. Throws when no GPU backend fits. */
export async function resolveExecutionPlan(
  options: ResolveExecutionPlanOptions = {},
): Promise<ExecutionPlan> {
  const key = planKey(options);
  if (cachedPlan && cachedPlanKey === key) return cachedPlan;

  const modelsDir = options.modelsDir ?? process.env.REDROB_MODELS_DIR ?? defaultModelsDir();
  const override = options.backendOverride ?? envBackendOverride();
  const { backendId, reasonParts } = await pickBackend(
    override,
    options.skipBackendProbe === true,
  );
  const descriptor = backendDescriptor(backendId);
  const backend = descriptor.engine;

  const vram = await dedicatedVramMib();
  const grade = options.grade ?? readModelGradeFromEnv();
  const preferredId = textModelIdForGrade(grade);
  reasonParts.push(
    vram === null
      ? `VRAM unknown → ${preferredId}`
      : vramMeetsGrade(vram, grade)
        ? `VRAM ${vram}MiB → ${preferredId}`
        : `VRAM ${vram}MiB is under the ${GRADE_VRAM_MIB[grade]}MiB ${preferredId} wants; running it anyway`,
  );

  const resolved = await resolveTextModelOnDisk(preferredId, modelsDir, backend);
  if (resolved.usingFallback) {
    reasonParts.push(`preferred ${preferredId} missing; using ${resolved.modelId}`);
  }
  if (resolved.downloadSuggested) {
    reasonParts.push(`download suggested: ${resolved.downloadSuggested}`);
  }

  const artifact = MODEL_ARTIFACTS[resolved.modelId];
  const supportsVision = descriptor.supportsVision && Boolean(artifact?.mmprojFile);
  const mmprojPath =
    supportsVision && artifact ? mmprojPathForArtifact(artifact, modelsDir) : null;
  if (!descriptor.supportsVision) {
    reasonParts.push("backend has no projector support → vision disabled");
  }

  const plan: ExecutionPlan = {
    backend,
    backendId,
    modelId: resolved.modelId,
    modelPath: resolved.modelPath,
    mmprojPath,
    supportsVision,
    gpuLayers: 99,
    threads: Math.min(8, await physicalCoreCount()),
    contextSize: 16_384,
    batchSize: 512,
    reason: reasonParts.join(" → "),
    usingFallbackModel: resolved.usingFallback,
    downloadSuggestedModelId: resolved.downloadSuggested,
  };

  cachedPlan = plan;
  cachedPlanKey = key;
  return plan;
}

export function peekExecutionPlan(): ExecutionPlan | null {
  return cachedPlan;
}

export function invalidateExecutionPlanCache(): void {
  cachedPlan = null;
  cachedPlanKey = "";
}

export function formatExecutionPlanLog(plan: ExecutionPlan): string {
  return (
    `[inference] backend=${plan.backendId} model=${plan.modelId} vision=${plan.supportsVision ? 1 : 0} ` +
    `ngl=${plan.gpuLayers} ctx=${plan.contextSize} — ${plan.reason}`
  );
}
