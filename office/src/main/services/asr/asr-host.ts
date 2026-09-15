import { utilityProcess, type UtilityProcess } from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nowIso } from "../../app-time.js";
import type { WhisperSegment } from "./whisper-cli.js";

export type AsrIsolation = "utilityProcess" | "unavailable";
export type AsrFallbackCode = "ERR_ASR_ISOLATION" | "ERR_ASR_BINARY" | "ERR_ASR_SIDECAR";

export interface AsrTranscription {
  text: string;
  segments: WhisperSegment[];
  model: string;
  vadApplied: boolean;
  vadModel: "energy-rms";
  speechRatio: number;
  vadThreshold: number;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

let child: UtilityProcess | null = null;
let isolation: AsrIsolation = "unavailable";
/** True between fork and successful ping — allows post() before isolation flips. */
let booting = false;
let sequence = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let logger: (line: string) => void = console.info;
const pending = new Map<string, Pending>();
const fallbackNotices: Array<{ code: AsrFallbackCode; detail: string; at: string }> = [];
const IDLE_KILL_MS = 8 * 60_000;

function dirnameSafe(): string {
  try {
    return fileURLToPath(new URL(".", import.meta.url));
  } catch {
    return __dirname;
  }
}

/**
 * electron-vite may place asr-host in `out/main/chunks/` while the sidecar entry
 * stays at `out/main/asr-sidecar.js`. Probe both.
 */
function sidecarPath(): string {
  const here = dirnameSafe();
  const candidates = [
    join(here, "asr-sidecar.js"),
    join(here, "..", "asr-sidecar.js"),
    join(dirname(here), "asr-sidecar.js"),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (found) return found;
  return candidates[1] ?? candidates[0]!;
}

function pushFallback(code: AsrFallbackCode, detail: string): void {
  fallbackNotices.push({ code, detail, at: nowIso() });
  logger(`[asr] WARN ${code}: ${detail}`);
}

function isolationError(): Error & { code: "ERR_ASR_ISOLATION" } {
  return Object.assign(
    new Error("ERR_ASR_ISOLATION: ASR utilityProcess is unavailable; in-process ASR is forbidden"),
    { code: "ERR_ASR_ISOLATION" as const },
  );
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (pending.size === 0) stopAsrHost();
  }, IDLE_KILL_MS);
}

function post(type: "ping" | "transcribe" | "shutdown", payload?: unknown): Promise<unknown> {
  if (!child || (isolation !== "utilityProcess" && !booting)) {
    return Promise.reject(isolationError());
  }
  if (type !== "shutdown") resetIdleTimer();
  const id = `asr-${++sequence}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child!.postMessage({ id, type, payload });
    setTimeout(() => {
      const wait = pending.get(id);
      if (!wait) return;
      pending.delete(id);
      wait.reject(new Error(`ASR sidecar timeout: ${type}`));
    }, 30 * 60_000);
  });
}

/** Starts the dedicated whisper process. Failure is terminal for ASR, never a fallback. */
export async function startAsrHost(
  log: (line: string) => void = console.info,
): Promise<{ isolation: AsrIsolation }> {
  logger = log;
  if (child && isolation === "utilityProcess") return { isolation };
  const path = sidecarPath();
  if (!existsSync(path)) {
    const detail = `ASR sidecar script missing at ${path}`;
    pushFallback("ERR_ASR_SIDECAR", detail);
    throw Object.assign(new Error(`ERR_ASR_SIDECAR: ${detail}`), {
      code: "ERR_ASR_SIDECAR" as const,
    });
  }
  try {
    booting = true;
    child = utilityProcess.fork(path, [], { serviceName: "redrob-asr" });
    child.on("message", (message: unknown) => {
      const msg = message as {
        id?: string;
        ok?: boolean;
        result?: unknown;
        error?: string;
        code?: string;
        type?: string;
        line?: string;
      };
      if (msg.type === "log" && msg.line) {
        logger(msg.line);
        return;
      }
      if (!msg.id) return;
      const wait = pending.get(msg.id);
      if (!wait) return;
      pending.delete(msg.id);
      if (msg.ok) wait.resolve(msg.result);
      else {
        if (msg.code === "ERR_ASR_BINARY" || msg.error?.startsWith("ERR_ASR_BINARY")) {
          pushFallback("ERR_ASR_BINARY", msg.error ?? "Whisper CLI unavailable");
        }
        wait.reject(Object.assign(new Error(msg.error ?? "ASR sidecar error"), { code: msg.code }));
      }
    });
    child.on("exit", (code) => {
      const wasReady = isolation === "utilityProcess";
      const wasBooting = booting;
      child = null;
      isolation = "unavailable";
      booting = false;
      if (wasReady) {
        pushFallback("ERR_ASR_ISOLATION", `ASR utilityProcess exited code=${code}`);
      } else if (wasBooting) {
        pushFallback(
          "ERR_ASR_SIDECAR",
          `ASR utilityProcess exited code=${code} before ready (sidecar=${path})`,
        );
      }
      for (const wait of pending.values()) wait.reject(isolationError());
      pending.clear();
    });
    await post("ping");
    booting = false;
    isolation = "utilityProcess";
    resetIdleTimer();
    logger(`[asr] isolation=utilityProcess serviceName=redrob-asr sidecar=${path}`);
    return { isolation };
  } catch (error) {
    booting = false;
    try {
      child?.kill();
    } catch {
      // ignore
    }
    child = null;
    isolation = "unavailable";
    const detail = error instanceof Error ? error.message : String(error);
    if (!detail.startsWith("ERR_ASR_")) {
      pushFallback("ERR_ASR_ISOLATION", detail);
    }
    throw isolationError();
  }
}

export async function hostTranscribeAsr(payload: {
  path: string;
  language: string;
  modelTier: "small" | "turbo";
  /** Default true (batch). Voice/PTT passes false to keep the source timeline. */
  trimVad?: boolean;
}): Promise<AsrTranscription> {
  if (isolation !== "utilityProcess" || !child) {
    await startAsrHost(logger);
  }
  if (isolation !== "utilityProcess" || !child) throw isolationError();
  return (await post("transcribe", payload)) as AsrTranscription;
}

export function getAsrIsolation(): AsrIsolation {
  return isolation;
}

export function getAsrFallbackNotices(): readonly {
  code: AsrFallbackCode;
  detail: string;
  at: string;
}[] {
  return fallbackNotices;
}

/** Drop stale ASR alerts after a successful install or recovery. */
export function clearAsrFallbackNotices(codes?: readonly AsrFallbackCode[]): void {
  if (!codes || codes.length === 0) {
    fallbackNotices.length = 0;
    return;
  }
  const drop = new Set(codes);
  for (let i = fallbackNotices.length - 1; i >= 0; i -= 1) {
    const notice = fallbackNotices[i];
    if (notice && drop.has(notice.code)) fallbackNotices.splice(i, 1);
  }
}

export function stopAsrHost(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = undefined;
  try {
    child?.kill();
  } catch {
    // Best effort during application shutdown.
  }
  child = null;
  isolation = "unavailable";
  for (const wait of pending.values()) wait.reject(isolationError());
  pending.clear();
}
