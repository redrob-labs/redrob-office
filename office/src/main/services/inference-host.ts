/**
 * Main-process client for the inference utilityProcess.
 * Falls back to in-process kernel if fork fails (still logs isolation mode).
 */
import { utilityProcess, type UtilityProcess } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatExecutionPlanLog,
  generateChatHttp,
  generateFieldFill,
  generateLocalChatWithTools,
  generateTextHttp,
  getActiveExecutionPlan,
  peekExecutionPlan,
  preloadInference,
  resolveExecutionPlan,
  type ChatHttpOptions,
  type ChatHttpResult,
  type CloudChatMessage,
  type CloudChatResult,
  type CloudToolDefinition,
  type ExecutionPlan,
  type GenerateFieldFillOptions,
  type ModelGrade,
} from "@redrob/kernel";
import { compare, type CompareInput, type CompareResult } from "@redrob/compare";
import { nowIso } from "../app-time.js";

export type InferenceIsolation = "utilityProcess" | "inProcess";

export type InferenceFallbackCode =
  | "ERR_INFER_FORK_FALLBACK"
  | "ERR_INFER_EXIT_FALLBACK"
  | "ERR_INFER_MODEL_MISSING";

type StreamFieldPayload = {
  path: string;
  value: unknown;
  streamTarget?: string;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onField?: (field: StreamFieldPayload) => void;
  onTextChunk?: (chunk: string) => void;
};

let child: UtilityProcess | null = null;
let isolation: InferenceIsolation = "inProcess";
let seq = 0;
const pending = new Map<string, Pending>();
let logger: (line: string) => void = console.info;
const fallbackNotices: Array<{ code: InferenceFallbackCode; detail: string; at: string }> = [];

export function getInferenceIsolation(): InferenceIsolation {
  return isolation;
}

export function getInferenceFallbackNotices(): readonly {
  code: InferenceFallbackCode;
  detail: string;
  at: string;
}[] {
  return fallbackNotices;
}

function pushFallback(code: InferenceFallbackCode, detail: string): void {
  const entry = { code, detail, at: nowIso() };
  fallbackNotices.push(entry);
  logger(`[inference] WARN ${code}: ${detail}`);
}

function sidecarPath(): string {
  const here = dirnameSafe();
  const candidates = [join(here, "inference-sidecar.js"), join(here, "..", "inference-sidecar.js")];
  return candidates.find((path) => existsSync(path)) ?? candidates[0]!;
}

function dirnameSafe(): string {
  try {
    return fileURLToPath(new URL(".", import.meta.url));
  } catch {
    return __dirname;
  }
}

function post(
  type: string,
  payload?: unknown,
  hooks?: {
    onField?: (field: StreamFieldPayload) => void;
    onTextChunk?: (chunk: string) => void;
  },
): Promise<unknown> {
  if (!child || isolation !== "utilityProcess") {
    return Promise.reject(new Error("utilityProcess not available"));
  }
  const id = `req-${++seq}`;
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      ...(hooks?.onField ? { onField: hooks.onField } : {}),
      ...(hooks?.onTextChunk ? { onTextChunk: hooks.onTextChunk } : {}),
    });
    child!.postMessage({ id, type, payload });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`inference sidecar timeout: ${type}`));
      }
    }, 30 * 60_000);
  });
}

export async function startInferenceHost(log: (line: string) => void = console.info): Promise<{
  isolation: InferenceIsolation;
  plan: ExecutionPlan;
}> {
  logger = log;
  try {
    const path = sidecarPath();
    child = utilityProcess.fork(path, [], { serviceName: "redrob-inference" });
    child.on("message", (message: unknown) => {
      const msg = message as {
        id?: string;
        ok?: boolean;
        result?: unknown;
        error?: string;
        type?: string;
        line?: string;
        requestId?: string;
        field?: StreamFieldPayload;
        chunk?: string;
      };
      if (msg.type === "log" && msg.line) {
        logger(msg.line);
        return;
      }
      if (msg.type === "field" && msg.requestId && msg.field) {
        pending.get(msg.requestId)?.onField?.(msg.field);
        return;
      }
      if (msg.type === "textChunk" && msg.requestId && typeof msg.chunk === "string") {
        pending.get(msg.requestId)?.onTextChunk?.(msg.chunk);
        return;
      }
      if (!msg.id) return;
      const wait = pending.get(msg.id);
      if (!wait) return;
      pending.delete(msg.id);
      if (msg.ok) wait.resolve(msg.result);
      else wait.reject(new Error(msg.error ?? "inference sidecar error"));
    });
    child.on("exit", (code) => {
      pushFallback(
        "ERR_INFER_EXIT_FALLBACK",
        `utilityProcess exited code=${code}; falling back in-process`,
      );
      child = null;
      isolation = "inProcess";
      for (const [, wait] of pending) {
        wait.reject(new Error("inference sidecar exited"));
      }
      pending.clear();
    });
    isolation = "utilityProcess";
    const plan = (await post("preload")) as ExecutionPlan;
    logger(`[inference] isolation=utilityProcess`);
    logger(formatExecutionPlanLog(plan));
    return { isolation, plan };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/ERR_INFER_MODEL_MISSING|ENOENT|not available at|no such file/i.test(detail)) {
      isolation = "inProcess";
      pushFallback("ERR_INFER_MODEL_MISSING", detail);
      // Still resolve a plan so Device/Settings can show downloadSuggested — do not
      // pretend this was a fork failure or chase a second missing CPU weight.
      const plan = await resolveExecutionPlan({ skipBackendProbe: true });
      logger(formatExecutionPlanLog(plan));
      return { isolation, plan };
    }
    isolation = "inProcess";
    pushFallback(
      "ERR_INFER_FORK_FALLBACK",
      detail,
    );
    const plan = await preloadInference();
    const { assertProductSlotGrammarsCompile } = await import("./assert-product-grammars.js");
    const asserted = await assertProductSlotGrammarsCompile();
    logger(
      `grammar-assert: product slots ok fields=${asserted.fieldCount} schemas=${asserted.schemaCount} rubrics=${asserted.rubricCount} templates=${asserted.templateCount} jd=${asserted.jdSlotCount}`,
    );
    logger(formatExecutionPlanLog(plan));
    return { isolation, plan };
  }
}

export async function hostGetPlan(): Promise<ExecutionPlan> {
  if (isolation === "utilityProcess" && child) {
    try {
      return (await post("getPlan")) as ExecutionPlan;
    } catch {
      // Fall through to local resolve if the sidecar is slow/dead.
    }
  }
  const existing = getActiveExecutionPlan() ?? peekExecutionPlan();
  if (existing) return existing;
  return resolveExecutionPlan({ skipBackendProbe: true });
}

export async function hostCompare(input: CompareInput): Promise<CompareResult> {
  if (isolation === "utilityProcess" && child) {
    const { onField, ...serializable } = input;
    return (await post(
      "compare",
      { ...serializable, streamFields: Boolean(onField) },
      onField
        ? {
            onField: (item) =>
              onField({
                path: item.path,
                value: item.value,
                streamTarget: item.streamTarget ?? item.path,
              }),
          }
        : undefined,
    )) as CompareResult;
  }
  return compare(input);
}

export async function hostFieldFill(options: GenerateFieldFillOptions) {
  if (isolation === "utilityProcess" && child) {
    const { onField, ...serializable } = options;
    return post(
      "fieldFill",
      { ...serializable, streamFields: Boolean(onField) },
      onField
        ? {
            onField: (item) => {
              onField(item as Parameters<NonNullable<GenerateFieldFillOptions["onField"]>>[0]);
            },
          }
        : undefined,
    );
  }
  return generateFieldFill(options);
}

export type GenerateTextHttpOptions = Parameters<typeof generateTextHttp>[0];

export async function hostGenerateText(options: GenerateTextHttpOptions) {
  if (isolation === "utilityProcess" && child) {
    const { onTextChunk, ...serializable } = options;
    return post(
      "generateText",
      { ...serializable, streamText: Boolean(onTextChunk) },
      onTextChunk ? { onTextChunk } : undefined,
    );
  }
  return generateTextHttp(options);
}

/**
 * One chat turn. llama-server holds its own KV cache, so there is no session to
 * open or reset here: the caller passes the conversation it wants prefilled.
 * `signal` cannot cross the utilityProcess boundary and stays main-process only.
 */
export async function hostGenerateChat(options: ChatHttpOptions): Promise<ChatHttpResult> {
  if (isolation === "utilityProcess" && child) {
    const { onTextChunk, onReasoningChunk, signal, ...serializable } = options;
    void onReasoningChunk;
    void signal;
    return (await post(
      "chat",
      { ...serializable, streamText: Boolean(onTextChunk) },
      onTextChunk ? { onTextChunk } : undefined,
    )) as ChatHttpResult;
  }
  return generateChatHttp(options);
}

/** Tool-calling chat for Floor / computer-use on the local llama-server. */
export async function hostGenerateChatWithTools(options: {
  messages: CloudChatMessage[];
  maxTokens?: number;
  temperature?: number;
  thinking?: boolean;
  tools?: CloudToolDefinition[];
  toolChoice?: "auto" | "none" | "required";
  /** GBNF the sampler must obey. Cannot be combined with tools. */
  grammar?: string;
  onTextChunk?: (chunk: string) => void;
}): Promise<CloudChatResult> {
  if (isolation === "utilityProcess" && child) {
    const { onTextChunk, ...serializable } = options;
    return (await post(
      "chatTools",
      { ...serializable, streamText: Boolean(onTextChunk) },
      onTextChunk ? { onTextChunk } : undefined,
    )) as CloudChatResult;
  }
  return generateLocalChatWithTools(options);
}

/**
 * Make sure llama-server is actually running, in whichever process will serve
 * the call. Binding a route only records a preference; the weights still have
 * to be loaded, and callers that skip this get ERR_LLAMA_SERVER_NOT_STARTED
 * halfway through a turn instead of a refusal up front. Idempotent and cheap
 * once the plan is loaded.
 */
/**
 * A refusal is remembered, a success is not.
 *
 * Failing costs a full backend probe (seconds), and the answer cannot change
 * until the user installs a backend or edits their inference settings - both of
 * which call `resetLocalReadiness`. Succeeding is cheap to re-check, and worth
 * re-checking, because a loaded server can still die under us.
 */
let localReadiness: Promise<{ ok: true } | { ok: false; reason: string }> | null = null;

export function resetLocalReadiness(): void {
  localReadiness = null;
}

/** Load the weights, so callers learn now whether a local call can be served. */
export async function hostEnsureLocalReady(): Promise<{ ok: true } | { ok: false; reason: string }> {
  localReadiness ??= (async () => {
    try {
      if (isolation === "utilityProcess" && child) await post("preload");
      else await preloadInference();
      return { ok: true as const };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false as const, reason: detail };
    }
  })();
  const ready = await localReadiness;
  if (ready.ok) localReadiness = null;
  return ready;
}

/**
 * Put the weights for a grade behind the local route.
 *
 * Picking the larger local grade used to change the setting, the env and the main process's
 * cached plan, and none of that reached the process holding the model: the next
 * turn answered from the weights loaded at startup, and the reply was honestly
 * labelled Flash while Settings said Pro. The grade is passed explicitly rather
 * than left to env, because this process was forked with the old one.
 *
 * A no-op when the same file is already loaded, which is what makes it safe to
 * call on every save. Pro with no 9B on disk resolves back to the 4B, so nothing
 * reloads for a switch that cannot change what runs.
 */
export async function hostReloadLocalWeights(grade: ModelGrade): Promise<boolean> {
  const target = await resolveExecutionPlan({ grade, skipBackendProbe: true });
  const running = await hostGetPlan().catch(() => null);
  if (running && running.modelPath === target.modelPath) return false;
  resetLocalReadiness();
  if (isolation === "utilityProcess" && child) await post("preload", { grade });
  else await preloadInference({ grade });
  logger(`[inference] reloaded for grade=${grade} model=${target.modelId}`);
  return true;
}

/**
 * The gate every local turn goes through, in words a person can act on.
 *
 * Weights on disk do not mean a turn can run: `hostGetPlan` skips the backend
 * probe, and the server can also be mid-reload after a grade download or a GPU
 * change. Loading them here is what makes the turn wait for that reload instead
 * of failing with `ERR_LLAMA_SERVER_NOT_STARTED` in the middle of it.
 */
export async function localTurnReady(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ready = await hostEnsureLocalReady();
  if (ready.ok) return ready;
  // The two failures with a one-click fix are worth naming the click for,
  // instead of quoting an error code at the reader.
  if (/ERR_NO_GPU_BACKEND|ERR_LLAMA_SERVER_NO_BINARY/.test(ready.reason)) {
    return {
      ok: false,
      reason: "The GPU runtime for local models is not installed. Install it in Device → GPU runtime.",
    };
  }
  if (/ERR_LLAMA_SERVER_NO_WEIGHTS/.test(ready.reason)) {
    return {
      ok: false,
      reason: "The local model is not downloaded. Restart Office to finish the model download.",
    };
  }
  return { ok: false, reason: `The local model cannot start: ${ready.reason}` };
}

export function stopInferenceHost(): void {
  try {
    child?.kill();
  } catch {
    // ignore
  }
  child = null;
  isolation = "inProcess";
  for (const [, wait] of pending) {
    wait.reject(new Error("inference sidecar restarted"));
  }
  pending.clear();
}

export async function restartInferenceHost(
  log: (line: string) => void = logger,
): Promise<{ isolation: InferenceIsolation; plan: ExecutionPlan }> {
  stopInferenceHost();
  return startInferenceHost(log);
}
