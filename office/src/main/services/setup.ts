import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildLocalPackPlan,
  dedicatedVramMib,
  defaultModelsDir,
  detectFreeDisk,
  downloadModel,
  GRADE_VRAM_MIB,
  humanBytes,
  modelLocalPath,
  vramMeetsGrade,
  type InferenceRouteMode,
  type InferenceMode,
  type ModelGrade,
  type LlmProviderSecrets,
  type PackRole,
  type RedrobRemoteConfig,
  DEFAULT_LOCAL_PACK_TIER,
  type Tier,
} from "@redrob/kernel";
import { nowIso } from "../app-time.js";
import { resetLocalReadiness } from "./inference-host.js";
import type { GpuPreference, SetupDecision, SetupProgressEvent } from "../../shared/office-api.js";
import {
  MASKED_API_KEY,
  REDROB_CONSOLE_API_BASE,
  isMaskedApiKey,
} from "../../shared/office-api.js";

export type { SetupProgressEvent };

const INFERENCE_ROUTE_MODES: InferenceRouteMode[] = [
  "auto",
  "local",
  "openai",
  "openrouter",
  "anthropic",
];

export interface SetupStateFile {
  completedAt: string | null;
  mode: InferenceMode;
  packTier: "T4" | "T8" | "T16";
  /** Prefer GPU offload, force CPU, or auto-detect. */
  gpuPreference: GpuPreference;
  downloadedRoles: PackRole[];
  remote: RedrobRemoteConfig | null;
  /**
   * App-wide inference routing: auto (mix), local-only, or a fixed cloud provider.
   * Applies to chat, drafts, and field extract — not only chat.
   */
  inferenceRoute: InferenceRouteMode;
  /** @deprecated Migrated into inferenceRoute */
  chatRoute?: InferenceRouteMode;
  /**
   * Local weight grade (`flash` | `pro`). JSON key kept as chatQualityMode
   * for compatibility; cloud chat ignores this and uses the Luna default.
   */
  chatQualityMode: ModelGrade;
  /**
   * Whether anything in this app may look things up on the web. On by default.
   *
   * One switch for both halves. It used to be component state in the chat
   * composer, which meant the office had no way to read it - and the office had
   * no search at all, so a seat asked for today's weather truthfully said it
   * could not find out while chat answered the same question beside it.
   */
  webSearchEnabled: boolean;
  /** Opt-in third-party keys for cloud inference. */
  llmProviders: LlmProviderSecrets;
}

export interface SetupSnapshot {
  state: SetupStateFile;
  freeBytes: number;
  freeLabel: string;
  mount: string;
  plan: ReturnType<typeof buildLocalPackPlan>;
  planMinimalLabel: string;
  planFullLabel: string;
  canFitMinimal: boolean;
  canFitFull: boolean;
  modelsDir: string;
  /** Roles whose artifacts are already on disk, measured against the flash local pack. */
  presentRoles: PackRole[];
  /** True when the selected grade's own text weights are downloaded. */
  gradeWeightsPresent: boolean;
}

export { REDROB_CONSOLE_API_BASE };

async function assertValidRedrobConsoleKey(apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${REDROB_CONSOLE_API_BASE}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
  } catch {
    throw new Error(
      "Could not reach console.redrob.ai. Check your connection and try again.",
    );
  }
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "That key was not accepted by console.redrob.ai. Create or copy a valid Redrob API key and try again.",
    );
  }
  throw new Error(
    `console.redrob.ai could not verify the key (HTTP ${response.status}). Try again.`,
  );
}

function defaultState(): SetupStateFile {
  return {
    completedAt: null,
    mode: "local",
    packTier: DEFAULT_LOCAL_PACK_TIER,
    gpuPreference: "auto",
    downloadedRoles: [],
    remote: null,
    inferenceRoute: "openai",
    chatQualityMode: "flash",
    webSearchEnabled: true,
    llmProviders: {},
  };
}

function normalizeModelGrade(value: unknown): ModelGrade {
  if (value === "pro" || value === "flash") return value;
  return "flash";
}

function normalizeGpuPreference(value: unknown): GpuPreference {
  if (value === "cpu" || value === "gpu" || value === "auto") return value;
  return "auto";
}

function normalizeInferenceRoute(value: unknown): InferenceRouteMode {
  if (value === "deepseek") return "openrouter";
  if (typeof value === "string" && (INFERENCE_ROUTE_MODES as string[]).includes(value)) {
    return value as InferenceRouteMode;
  }
  return "auto";
}

function normalizeLlmProviders(value: unknown): LlmProviderSecrets {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const entry = raw["openai"];
  if (!entry || typeof entry !== "object") return {};
  const apiKey = (entry as { apiKey?: unknown }).apiKey;
  const baseUrl = (entry as { baseUrl?: unknown }).baseUrl;
  if (typeof apiKey !== "string" || !apiKey.trim()) return {};
  if (
    typeof baseUrl !== "string" ||
    baseUrl.trim().replace(/\/$/, "") !== REDROB_CONSOLE_API_BASE
  ) {
    return {};
  }
  return {
    openai: {
      apiKey: apiKey.trim(),
      baseUrl: REDROB_CONSOLE_API_BASE,
    },
  };
}

/**
 * Apply pack tier + inference route to process env / execution plan.
 *
 * llama-server is GPU-only, so the stored GPU preference no longer selects a
 * backend; it is still exported for callers that read the env, and "cpu" cannot
 * be honoured by the current runtime.
 */
export async function applyInferenceRuntimeConfig(state: SetupStateFile): Promise<void> {
  // Route, keys or a freshly installed backend can all turn a "local cannot
  // start" answer into a working one, so stop remembering the old refusal.
  resetLocalReadiness();
  process.env.REDROB_PACK_TIER = state.packTier;
  process.env.REDROB_MODEL_GRADE = state.chatQualityMode;
  process.env.REDROB_INFERENCE_MODE = "local";
  process.env.REDROB_INFERENCE_ROUTE = state.llmProviders.openai
    ? "openai"
    : "local";
  process.env.REDROB_GPU_PREFERENCE = normalizeGpuPreference(state.gpuPreference);
  process.env.REDROB_LLM_PROVIDERS = JSON.stringify(state.llmProviders ?? {});
  delete process.env.REDROB_REMOTE_BASE_URL;
  delete process.env.REDROB_REMOTE_API_KEY;
  delete process.env.REDROB_REMOTE_CONSENTED_AT;
  if (state.mode === "local" || state.inferenceRoute === "local" || state.inferenceRoute === "auto") {
    // Resolve and cache a plan only. `applyExecutionPlan` would also start
    // llama-server, which must not happen here: Settings and the setup wizard
    // read this, and a machine with no backend installed yet would then be
    // unable to open the very screen that installs one.
    //
    // Heuristics only (nvidia-smi / OS) - never await a backend probe here. Real
    // inference runs through the utilityProcess inference host (see startInferenceHost),
    // which resolves its own fully-probed plan independently in a separate process. Probing
    // again here in the main process just duplicates a slow cold-GPU-load wait, and this
    // module's cache is also what `hostGetPlan` falls back to when the sidecar is unavailable
    // - a probe timing out here previously left that fallback (and briefly the Device panel,
    // before it started querying the sidecar directly) stuck showing a stale cpu plan.
    const { resolveExecutionPlan } = await import("@redrob/kernel");
    // Warming the cache is best-effort. Missing weights or an uninstalled
    // backend are exactly what the caller is about to render a fix for.
    await resolveExecutionPlan({
      memTier: state.packTier,
      grade: state.chatQualityMode,
      skipBackendProbe: true,
    }).catch(() => undefined);
  }
}

export function setupStatePath(userData: string): string {
  return join(userData, "setup.json");
}

export function modelsDirPath(_userData?: string): string {
  return defaultModelsDir();
}

export async function loadSetupState(userData: string): Promise<SetupStateFile> {
  try {
    const raw = await readFile(setupStatePath(userData), "utf8");
    const parsed = JSON.parse(raw) as Partial<SetupStateFile> & {
      /** @deprecated Ignored; cloud no longer upgrades by grade. */
      autoUpgradeChatToPro?: boolean;
    };
    const { autoUpgradeChatToPro: _ignored, ...rest } = parsed;
    return {
      ...defaultState(),
      ...rest,
      gpuPreference: normalizeGpuPreference(parsed.gpuPreference),
      inferenceRoute: normalizeInferenceRoute(
        parsed.inferenceRoute ?? parsed.chatRoute,
      ),
      chatQualityMode: normalizeModelGrade(parsed.chatQualityMode),
      // Absent means a file written before the switch existed, and the switch
      // has always effectively been on, so only an explicit false turns it off.
      webSearchEnabled: parsed.webSearchEnabled !== false,
      // A setup file written before the engine decision may still carry an
      // engine-selection flag. It is read and dropped: there is one engine, so
      // there is nothing for it to select.
      llmProviders: normalizeLlmProviders(parsed.llmProviders),
      remote: null,
      mode: "local",
    };
  } catch {
    return defaultState();
  }
}

export async function saveSetupState(userData: string, state: SetupStateFile): Promise<void> {
  await mkdir(userData, { recursive: true });
  await writeFile(setupStatePath(userData), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function artifactPresent(
  modelsDir: string,
  artifact: Parameters<typeof modelLocalPath>[0],
): Promise<boolean> {
  try {
    const info = await stat(modelLocalPath(artifact, modelsDir));
    return info.size > 0;
  } catch {
    return false;
  }
}

/**
 * Roles whose weights are on disk.
 *
 * Always measured against the flash local pack, never the selected grade: flash
 * is the floor, so its presence is what decides whether this machine can run
 * anything locally at all. Whether the chosen grade's own weights are there is
 * a separate, softer question — see `gradeWeightsPresent`.
 */
export async function detectPresentRoles(
  modelsDir: string,
  tier: Tier = DEFAULT_LOCAL_PACK_TIER,
): Promise<PackRole[]> {
  const plan = buildLocalPackPlan(tier, "flash");
  const present: PackRole[] = [];
  for (const role of plan.roles) {
    const checks = await Promise.all(
      role.artifacts.map((artifact) => artifactPresent(modelsDir, artifact)),
    );
    if (checks.length > 0 && checks.every(Boolean)) {
      present.push(role.role);
    }
  }
  return present;
}

/** If weights are already on disk but setup.json was never finished, mark ready. */
async function reconcileSetupWithDisk(
  userData: string,
  state: SetupStateFile,
  modelsDir: string,
): Promise<{ state: SetupStateFile; presentRoles: PackRole[] }> {
  const presentRoles = await detectPresentRoles(modelsDir, state.packTier);
  const nextRoles = Array.from(new Set([...state.downloadedRoles, ...presentRoles]));
  let next = state;

  if (presentRoles.includes("text") && (!state.completedAt || state.downloadedRoles.length === 0)) {
    next = {
      ...state,
      mode: state.mode || "local",
      completedAt: state.completedAt ?? nowIso(),
      downloadedRoles: nextRoles,
    };
    await saveSetupState(userData, next);
  } else if (nextRoles.length !== state.downloadedRoles.length) {
    next = { ...state, downloadedRoles: nextRoles };
    await saveSetupState(userData, next);
  }

  return { state: next, presentRoles };
}

export async function getSetupSnapshot(userData: string): Promise<SetupSnapshot> {
  const loaded = await loadSetupState(userData);
  const modelsDir = modelsDirPath(userData);
  await mkdir(modelsDir, { recursive: true });
  const { state, presentRoles } = await reconcileSetupWithDisk(userData, loaded, modelsDir);
  await applyInferenceRuntimeConfig(state);
  const disk = await detectFreeDisk(modelsDir);
  const plan = buildLocalPackPlan(state.packTier, state.chatQualityMode);
  return {
    state: redactSecretsForRenderer(state),
    freeBytes: disk.freeBytes,
    freeLabel: humanBytes(disk.freeBytes),
    mount: disk.mount,
    plan,
    planMinimalLabel: humanBytes(plan.minimalBytes),
    planFullLabel: humanBytes(plan.fullBytes),
    canFitMinimal: disk.freeBytes >= plan.minimalBytes + 512 * 1024 * 1024,
    canFitFull: disk.freeBytes >= plan.fullBytes + 512 * 1024 * 1024,
    modelsDir,
    presentRoles,
    gradeWeightsPresent: await gradeTextWeightsPresent(modelsDir, state),
    ...(await gradeVramFit(state.chatQualityMode)),
  };
}

/**
 * How the selected grade sizes up against the graphics memory on this machine.
 *
 * Probed once per run: the card does not change while the app is open, and this
 * snapshot is fetched on every settings render.
 */
let vramMib: number | null | undefined;

async function gradeVramFit(grade: ModelGrade): Promise<{
  gradeFitsVram: boolean;
  vramLabel: string | null;
  gradeVramLabel: string;
}> {
  if (vramMib === undefined) {
    vramMib = await dedicatedVramMib().catch(() => null);
  }
  const want = GRADE_VRAM_MIB[grade];
  return {
    gradeFitsVram: vramMeetsGrade(vramMib, grade),
    vramLabel: vramMib === null ? null : humanBytes(vramMib * 1024 * 1024),
    gradeVramLabel: humanBytes(want * 1024 * 1024),
  };
}

/**
 * Whether the selected grade's own text weights are downloaded.
 *
 * Picking the larger local grade without them is not an error: the plan falls
 * back to flash and says so. This is what lets Settings say the same thing
 * before the user wonders why the answer still came from the smaller pack.
 */
async function gradeTextWeightsPresent(
  modelsDir: string,
  state: SetupStateFile,
): Promise<boolean> {
  const plan = buildLocalPackPlan(state.packTier, state.chatQualityMode);
  const text = plan.roles.find((role) => role.role === "text");
  if (!text) return false;
  const checks = await Promise.all(
    text.artifacts.map((artifact) => artifactPresent(modelsDir, artifact)),
  );
  return checks.length > 0 && checks.every(Boolean);
}

/** Never send raw cloud keys to the renderer — presence only as a fixed mask. */
function redactSecretsForRenderer(state: SetupStateFile): SetupStateFile {
  const llmProviders: SetupStateFile["llmProviders"] = {};
  const entry = state.llmProviders?.openai;
  if (entry?.apiKey?.trim()) {
    llmProviders.openai = {
      apiKey: MASKED_API_KEY,
      ...(entry.baseUrl?.trim() ? { baseUrl: entry.baseUrl.trim() } : {}),
    };
  }
  return { ...state, llmProviders, remote: null, mode: "local" };
}

export async function applySetupDecision(
  userData: string,
  decision: SetupDecision,
  onProgress?: (event: SetupProgressEvent) => void,
): Promise<SetupStateFile> {
  if (decision.mode === "redrob_remote") {
    throw new Error(
      "Custom inference servers are not supported. Use a key from console.redrob.ai.",
    );
  }
  const modelsDir = modelsDirPath(userData);
  await mkdir(modelsDir, { recursive: true });
  const state = await loadSetupState(userData);
  state.mode = decision.mode;
  state.packTier = decision.packTier;
  state.completedAt = nowIso();
  await applyInferenceRuntimeConfig(state);

  const plan = buildLocalPackPlan(decision.packTier, state.chatQualityMode);
  const selected = plan.roles.filter((role) => decision.rolesToDownload.includes(role.role));
  onProgress?.({
    kind: "start",
    detail: "download_start",
    percent: 0,
  });

  await downloadRoles(modelsDir, selected, state, onProgress);
  await saveSetupState(userData, state);
  const firstRole = selected[0]?.role;
  onProgress?.(
    firstRole === undefined
      ? { kind: "done", detail: "local_done", percent: 100 }
      : { kind: "done", detail: "local_done", percent: 100, role: firstRole },
  );
  return state;
}

/**
 * Fetch the weights the chosen grade runs on, and nothing else.
 *
 * Settings offers this the moment it has to admit the selected local grade is
 * not on the machine. Going through `applySetupDecision` for it would have
 * restamped `completedAt` and rewritten mode and tier - a lot of state to move
 * for a download somebody asked for from one line of copy.
 */
export async function downloadGradeTextWeights(
  userData: string,
  onProgress?: (event: SetupProgressEvent) => void,
): Promise<SetupStateFile> {
  const modelsDir = modelsDirPath(userData);
  await mkdir(modelsDir, { recursive: true });
  const state = await loadSetupState(userData);
  const plan = buildLocalPackPlan(state.packTier, state.chatQualityMode);
  const text = plan.roles.filter((role) => role.role === "text");
  onProgress?.({ kind: "start", detail: "download_start", percent: 0 });
  await downloadRoles(modelsDir, text, state, onProgress);
  await saveSetupState(userData, state);
  await applyInferenceRuntimeConfig(state);
  // The running sidecar is holding the old weights, and nothing else would make
  // it look again. Backgrounded so Settings stays answerable while it reloads.
  void import("./inference-host.js")
    .then(({ hostReloadLocalWeights }) => hostReloadLocalWeights(state.chatQualityMode))
    .catch(() => undefined);
  onProgress?.({ kind: "done", detail: "local_done", percent: 100, role: "text" });
  return state;
}

async function downloadRoles(
  modelsDir: string,
  selected: ReturnType<typeof buildLocalPackPlan>["roles"],
  state: SetupStateFile,
  onProgress?: (event: SetupProgressEvent) => void,
): Promise<void> {
  for (const role of selected) {
    for (const artifact of role.artifacts) {
      let lastEmittedPct = -1;
      onProgress?.({
        kind: "download",
        role: role.role,
        artifactId: artifact.id,
        percent: 0,
        bytesReceived: 0,
        totalBytes: null,
      });
      await downloadModel(artifact, modelsDir, {
        onProgress: ({ bytesReceived, totalBytes }) => {
          if (!totalBytes || totalBytes <= 0) {
            onProgress?.({
              kind: "download",
              role: role.role,
              artifactId: artifact.id,
              bytesReceived,
              totalBytes: totalBytes ?? null,
            });
            return;
          }
          const pct = Math.min(100, Math.floor((bytesReceived / totalBytes) * 100));
          if (pct === lastEmittedPct || (pct < 100 && pct - lastEmittedPct < 1 && pct % 5 !== 0)) {
            return;
          }
          lastEmittedPct = pct;
          onProgress?.({
            kind: "download",
            role: role.role,
            artifactId: artifact.id,
            percent: pct,
            bytesReceived,
            totalBytes,
          });
        },
      });
      if (artifact.mmprojFile) {
        onProgress?.({
          kind: "download",
          role: role.role,
          artifactId: `${artifact.id}-mmproj`,
          percent: 0,
        });
        await downloadModel(
          { ...artifact, id: `${artifact.id}-mmproj`, hfFile: artifact.mmprojFile },
          modelsDir,
        );
      }
      onProgress?.({
        kind: "ready",
        role: role.role,
        artifactId: artifact.id,
        percent: 100,
        detail: modelLocalPath(artifact, modelsDir),
      });
    }
    if (!state.downloadedRoles.includes(role.role)) {
      state.downloadedRoles.push(role.role);
    }
  }
}

export async function saveRemoteCredentials(
  userData: string,
  _input: { baseUrl: string; apiKey: string },
): Promise<SetupStateFile> {
  throw new Error(
    "Custom inference servers are not supported. Use a key from console.redrob.ai.",
  );
}

export async function saveGpuPreference(
  userData: string,
  gpuPreference: GpuPreference,
): Promise<SetupStateFile> {
  const state = await loadSetupState(userData);
  const next = normalizeGpuPreference(gpuPreference);
  state.gpuPreference = next;
  await saveSetupState(userData, state);
  await applyInferenceRuntimeConfig(state);
  // Restart in the background so Settings IPC stays responsive; the sidecar loads the model.
  void import("./inference-host.js")
    .then(({ restartInferenceHost }) => restartInferenceHost())
    .catch(() => undefined);
  return state;
}

export async function saveLlmSettings(
  userData: string,
  input: {
    inferenceRoute?: InferenceRouteMode;
    /** @deprecated */
    chatRoute?: InferenceRouteMode;
    /** Local weight grade; optional for benches/internal. */
    chatQualityMode?: ModelGrade;
    webSearchEnabled?: boolean;
    llmProviders?: LlmProviderSecrets;
  },
): Promise<SetupStateFile> {
  const state = await loadSetupState(userData);
  const gradeBefore = state.chatQualityMode;
  const route = input.inferenceRoute ?? input.chatRoute;
  if (route !== undefined) {
    state.inferenceRoute = route === "local" ? "local" : "openai";
  }
  if (input.chatQualityMode !== undefined) {
    state.chatQualityMode = normalizeModelGrade(input.chatQualityMode);
  }
  if (typeof input.webSearchEnabled === "boolean") {
    state.webSearchEnabled = input.webSearchEnabled;
  }
  if (input.llmProviders !== undefined) {
    const entry = input.llmProviders.openai;
    const key = entry?.apiKey?.trim() ?? "";
    if (key && !isMaskedApiKey(key)) {
      await assertValidRedrobConsoleKey(key);
      state.llmProviders = {
        openai: { apiKey: key, baseUrl: REDROB_CONSOLE_API_BASE },
      };
    }
    state.inferenceRoute = "openai";
    state.remote = null;
    state.mode = "local";
  }
  await saveSetupState(userData, state);
  // webSearch toggles live in setup.json and are read from there.
  // Re-resolving the local execution plan (GPU / WMI probes) is only needed
  // when the inference route, grade, or provider keys actually changed —
  // otherwise a Settings toggle can stall for tens of seconds on Windows.
  const touchesInference =
    route !== undefined ||
    input.chatQualityMode !== undefined ||
    input.llmProviders !== undefined;
  if (touchesInference) {
    await applyInferenceRuntimeConfig(state);
    if (state.chatQualityMode !== gradeBefore) {
      // The grade names which weights answer on this PC, so the process holding
      // them has to be told. Backgrounded to keep Settings answerable while a few
      // gigabytes load; the readiness gate makes the next turn wait for it.
      const grade = state.chatQualityMode;
      void import("./inference-host.js")
        .then(({ hostReloadLocalWeights }) => hostReloadLocalWeights(grade))
        .catch(() => undefined);
    }
  }
  return state;
}
