/**
 * llama-server sidecar for Qwen3.5 vision (mmproj).
 * Exists because node-llama-cpp does not expose mmproj yet.
 *
 * Loads the same Qwen3.5 pack LM as text for the active tier (T4→2B, T8/T16→4B)
 * plus the matching mmproj from that repo. One CUDA load: NLC model cache is
 * cleared before spawn so text+vision do not hold two copies of the weights.
 * Field-fill stays on NLC (not this HTTP track).
 *
 * Local vision is GPU/CUDA-only. There is no CPU fallback.
 */
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  assertLmMmprojCompatible,
  clearModelCache,
  detectNvidiaDgpu,
  MODEL_ARTIFACTS,
  mmprojPathForArtifact,
  modelPathForArtifact,
  visionModelIdFor,
} from "@redrob/kernel";
import type { Tier } from "@redrob/kernel";

const HEALTH_TIMEOUT_MS = 180_000;
const HEALTH_POLL_MS = 400;
/** Offload all layers by default — CPU (ngl=0) is not a product path. */
const DEFAULT_NGL = 99;
/** Single place for vision token ceiling (no file downscale). */
export const DEFAULT_IMAGE_MAX_TOKENS = 1024;
export const DEFAULT_CTX_SIZE = 16_384;

/** Stable reason codes for UI / i18n (also used as disabledReason prefix). */
export const VISION_DISABLED_NO_CUDA = "ERR_VISION_NO_CUDA";
export const VISION_DISABLED_NO_CUDA_BIN = "ERR_VISION_NO_CUDA_BIN";
export const VISION_DISABLED_NGL_ZERO = "ERR_VISION_NGL_ZERO";

/**
 * Bearer token for the vision sidecar, minted once per process. Loopback is not
 * a trust boundary: without a key any local process could drive the model and
 * skip the approval gates. There is no setting that turns this off.
 */
const visionApiKey = randomBytes(32).toString("hex");

/** Authorization header for every call to the vision sidecar. */
export function visionSidecarAuthHeaders(): Record<string, string> {
  return { authorization: `Bearer ${visionApiKey}` };
}

let child: ChildProcessWithoutNullStreams | null = null;
let port = 0;
let starting: Promise<number> | null = null;
/** After a healthy start, allow one automatic restart on unexpected exit. */
let restartBudget = 1;
let intentionalStop = false;
let disabled = false;
let disabledReason = "";
let onDisabled: ((reason: string) => void) | null = null;
let activeConfigKey = "";
let gpuGateChecked = false;
let lastOptions: Required<VisionSidecarOptions> = {
  imageMaxTokens: DEFAULT_IMAGE_MAX_TOKENS,
  imageMinTokens: DEFAULT_IMAGE_MAX_TOKENS,
  ctxSize: DEFAULT_CTX_SIZE,
};
let lastResolved: { modelId: string; lm: string; mmproj: string } | null = null;

export type VisionSidecarOptions = {
  /** Cap image tokens in the projector/processor — only resize lever we use. */
  imageMaxTokens?: number;
  imageMinTokens?: number;
  ctxSize?: number;
};

export type VisionSidecarStatus = {
  running: boolean;
  port: number;
  disabled: boolean;
  disabledReason: string;
  imageMaxTokens: number;
  ctxSize: number;
  modelId: string | null;
};

function localAppData(): string {
  if (process.platform === "win32") {
    return process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  return process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
}

function redrobRoot(): string {
  return join(localAppData(), "redrob");
}

function modelsDir(): string {
  return process.env.REDROB_MODELS_DIR?.trim() || join(redrobRoot(), "models");
}

function packTier(): Tier {
  const fromEnv = process.env.REDROB_PACK_TIER as Tier | undefined;
  if (fromEnv === "T4" || fromEnv === "T8" || fromEnv === "T16") return fromEnv;
  return "T4";
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}

/**
 * CUDA llama-server only — never the CPU `bin/` build.
 * Override with REDROB_LLAMA_SERVER if you point at a CUDA-capable binary.
 */
export function resolveLlamaServerBinary(): string | null {
  const configured = process.env.REDROB_LLAMA_SERVER?.trim();
  if (configured) return existsSync(configured) ? configured : null;
  const root = redrobRoot();
  return (
    firstExisting([
      join(root, "verify-tools", "bin-cuda", "llama-server.exe"),
      join(root, "verify-tools", "bin-cuda", "llama-server"),
      join(root, "models", "bin-cuda", "llama-server.exe"),
      join(root, "models", "bin-cuda", "llama-server"),
    ]) ?? null
  );
}

export type VisionWeightPaths = {
  modelId: string;
  lm: string;
  mmproj: string;
};

/**
 * Tier-matched Qwen3.5 LM + mmproj from the product pack (not verify/ hardcodes).
 * Env overrides: REDROB_VISION_LM / REDROB_VISION_MMPROJ (still dim-checked).
 */
export function resolveVisionWeights(): VisionWeightPaths | null {
  const configuredLm = process.env.REDROB_VISION_LM?.trim();
  const configuredMm = process.env.REDROB_VISION_MMPROJ?.trim();
  if (configuredLm || configuredMm) {
    if (!configuredLm || !configuredMm) return null;
    if (!existsSync(configuredLm) || !existsSync(configuredMm)) return null;
    return { modelId: "env-override", lm: configuredLm, mmproj: configuredMm };
  }

  // Vision shares the text LM, so the tier is the only selector.
  const modelId = visionModelIdFor(packTier());
  const artifact = MODEL_ARTIFACTS[modelId];
  if (!artifact?.mmprojFile) return null;
  const lm = modelPathForArtifact(artifact, modelsDir());
  const mmproj = mmprojPathForArtifact(artifact, modelsDir());
  if (!mmproj || !existsSync(lm) || !existsSync(mmproj)) return null;
  return { modelId, lm, mmproj };
}

/** @deprecated Prefer resolveVisionWeights(). Kept for call-site compatibility. */
export function resolveVisionMmprojPath(): string | null {
  return resolveVisionWeights()?.mmproj ?? null;
}

/** @deprecated Prefer resolveVisionWeights(). Kept for call-site compatibility. */
export async function resolveVisionLmPath(): Promise<string | null> {
  return resolveVisionWeights()?.lm ?? null;
}

export function getVisionSidecarStatus(): VisionSidecarStatus {
  return {
    running: Boolean(child && port > 0),
    port,
    disabled,
    disabledReason,
    imageMaxTokens: lastOptions.imageMaxTokens,
    ctxSize: lastOptions.ctxSize,
    modelId: lastResolved?.modelId ?? null,
  };
}

export function setVisionSidecarDisabledHandler(handler: ((reason: string) => void) | null): void {
  onDisabled = handler;
}

/**
 * Latch vision off. `notify` → crash dialog; GPU/env gates stay silent (UI uses reason codes).
 */
function disableVision(reason: string, notify = true): void {
  disabled = true;
  disabledReason = reason;
  stopVisionSidecar();
  if (!notify) return;
  try {
    onDisabled?.(reason);
  } catch {
    /* ignore UI notify failures */
  }
}

function nglLayers(): number {
  const raw = process.env.REDROB_VISION_NGL?.trim();
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return DEFAULT_NGL;
}

/**
 * Enforce CUDA + CUDA binary + ngl>0. No CPU path.
 * Idempotent; safe to call from assets-ready and ensure.
 */
export async function enforceVisionGpuRequirement(): Promise<boolean> {
  if (disabled) return false;
  if (gpuGateChecked) return !disabled;
  gpuGateChecked = true;

  const hasCuda = await detectNvidiaDgpu();
  if (!hasCuda) {
    disableVision(
      `${VISION_DISABLED_NO_CUDA}: Local vision requires an NVIDIA GPU with CUDA. No CPU fallback.`,
      false,
    );
    return false;
  }

  if (!resolveLlamaServerBinary()) {
    disableVision(
      `${VISION_DISABLED_NO_CUDA_BIN}: CUDA llama-server binary not found (expected verify-tools/bin-cuda).`,
      false,
    );
    return false;
  }

  if (nglLayers() <= 0) {
    disableVision(
      `${VISION_DISABLED_NGL_ZERO}: Local vision requires GPU offload (ngl>0). REDROB_VISION_NGL=0 is not supported.`,
      false,
    );
    return false;
  }

  return true;
}

export async function visionSidecarAssetsReady(): Promise<boolean> {
  if (!(await enforceVisionGpuRequirement())) return false;
  if (disabled) return false;
  const server = resolveLlamaServerBinary();
  const weights = resolveVisionWeights();
  return Boolean(server && weights);
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const chosen = address && typeof address === "object" ? address.port : 0;
      probe.close((err) => {
        if (err) reject(err);
        else resolve(chosen);
      });
    });
  });
}

async function waitHealthy(targetPort: number, timeoutMs = HEALTH_TIMEOUT_MS): Promise<void> {
  const started = performance.now();
  let lastErr = "not ready";
  while (performance.now() - started < timeoutMs) {
    if (disabled) throw new Error(`ERR_VISION_SIDECAR: disabled (${disabledReason})`);
    try {
      const res = await fetch(`http://127.0.0.1:${targetPort}/health`, {
        headers: visionSidecarAuthHeaders(),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { status?: string } | null;
        if (!body || body.status === "ok") return;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  throw new Error(`ERR_VISION_SIDECAR: health timeout (${lastErr})`);
}

function normalizeOptions(options?: VisionSidecarOptions): Required<VisionSidecarOptions> {
  const imageMaxTokens = Math.max(
    64,
    Math.floor(options?.imageMaxTokens ?? DEFAULT_IMAGE_MAX_TOKENS),
  );
  const imageMinTokens = Math.max(
    64,
    Math.min(
      imageMaxTokens,
      Math.floor(options?.imageMinTokens ?? Math.min(DEFAULT_IMAGE_MAX_TOKENS, imageMaxTokens)),
    ),
  );
  const ctxSize = Math.max(2048, Math.floor(options?.ctxSize ?? DEFAULT_CTX_SIZE));
  return { imageMaxTokens, imageMinTokens, ctxSize };
}

function configKey(opts: Required<VisionSidecarOptions>, weights: VisionWeightPaths): string {
  return `${weights.modelId}:${weights.lm}:${weights.mmproj}:${opts.imageMaxTokens}:${opts.imageMinTokens}:${opts.ctxSize}:${nglLayers()}`;
}

function attachExitHandler(proc: ChildProcessWithoutNullStreams): void {
  proc.once("exit", (code, signal) => {
    if (child !== proc) return;
    child = null;
    port = 0;
    activeConfigKey = "";
    lastResolved = null;
    if (intentionalStop) return;
    const detail = `exit code=${code ?? "null"} signal=${signal ?? "null"}`;
    if (restartBudget > 0) {
      restartBudget -= 1;
      void ensureVisionSidecar(lastOptions).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        disableVision(`sidecar crashed after restart: ${detail}; ${msg}`, true);
      });
      return;
    }
    disableVision(`sidecar crashed twice: ${detail}`, true);
  });
}

export function stopVisionSidecar(): void {
  intentionalStop = true;
  starting = null;
  activeConfigKey = "";
  lastResolved = null;
  const proc = child;
  child = null;
  port = 0;
  if (proc) {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  }
}

export async function ensureVisionSidecar(options?: VisionSidecarOptions): Promise<number> {
  if (!(await enforceVisionGpuRequirement())) {
    throw new Error(`ERR_VISION_SIDECAR: vision disabled — ${disabledReason}`);
  }
  if (disabled) {
    throw new Error(`ERR_VISION_SIDECAR: vision disabled — ${disabledReason}`);
  }
  const normalized = normalizeOptions(options);
  const weights = resolveVisionWeights();
  if (!weights) {
    throw new Error(
      "ERR_VISION_SIDECAR: Qwen3.5 pack LM+mmproj missing (install text pack for this tier, including mmproj)",
    );
  }
  const key = configKey(normalized, weights);

  if (child && port > 0 && activeConfigKey === key) {
    try {
      await waitHealthy(port, 3_000);
      return port;
    } catch {
      stopVisionSidecar();
    }
  } else if (child && activeConfigKey !== key) {
    stopVisionSidecar();
  }

  if (starting) return starting;

  starting = (async () => {
    const serverBinary = resolveLlamaServerBinary();
    if (!serverBinary) {
      throw new Error("ERR_VISION_SIDECAR: CUDA llama-server binary not found");
    }
    await access(serverBinary);
    await access(weights.lm);
    await access(weights.mmproj);
    await assertLmMmprojCompatible(weights.lm, weights.mmproj);

    // One GPU resident copy: drop NLC-held weights before loading LM+mmproj here.
    try {
      await clearModelCache();
    } catch {
      /* ignore — sidecar still proceeds */
    }

    stopVisionSidecar();
    lastOptions = normalized;
    lastResolved = weights;

    const nextPort = await freePort();
    const args = [
      "-m",
      weights.lm,
      "--mmproj",
      weights.mmproj,
      // Loopback only, and authenticated. An open model port would bypass every
      // approval gate in front of tool use.
      "--host",
      "127.0.0.1",
      "--api-key",
      visionApiKey,
      "--port",
      String(nextPort),
      "-ngl",
      String(nglLayers()),
      "-c",
      String(normalized.ctxSize),
      "--image-min-tokens",
      String(normalized.imageMinTokens),
      "--image-max-tokens",
      String(normalized.imageMaxTokens),
      // Qwen3.5 emits reasoning_content; without this, short budgets leave message.content empty.
      "--reasoning",
      "off",
    ];
    const proc = spawn(serverBinary, args, {
      windowsHide: true,
      cwd: dirname(serverBinary),
    });
    child = proc;
    intentionalStop = false;
    attachExitHandler(proc);
    proc.stderr.on("data", () => undefined);
    proc.stdout.on("data", () => undefined);
    try {
      await waitHealthy(nextPort);
    } catch (err) {
      stopVisionSidecar();
      throw err;
    }
    port = nextPort;
    activeConfigKey = key;
    return nextPort;
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

export function shutdownVisionSidecar(): void {
  stopVisionSidecar();
}

/** Test-only: clear disabled latch without implying production recovery UI. */
export function resetVisionSidecarForTests(): void {
  stopVisionSidecar();
  disabled = false;
  disabledReason = "";
  restartBudget = 1;
  gpuGateChecked = false;
  lastResolved = null;
  lastOptions = {
    imageMaxTokens: DEFAULT_IMAGE_MAX_TOKENS,
    imageMinTokens: DEFAULT_IMAGE_MAX_TOKENS,
    ctxSize: DEFAULT_CTX_SIZE,
  };
}
