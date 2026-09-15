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
 * The one llama-server process. Text, field-fill and vision all talk to it.
 *
 * Text and vision are the same Qwen3.5 LM, so a single instance loads `-m` plus
 * `--mmproj` and serves every route. The previous design ran field-fill in-process
 * through node-llama-cpp and spawned a separate vision sidecar, which meant
 * evicting the in-process weights before the sidecar could start; the model was
 * loaded twice across the two paths. There is exactly one resident copy now.
 *
 * Reasoning is left at `auto` on the process so the chat route can decide per
 * request. Field-fill never goes through the chat template at all — it uses
 * /completion with a preamble it builds itself — so no thinking tokens can reach
 * a grammar-constrained decode regardless of the toggle.
 */

import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";

import {
  backendDescriptor,
  type BackendId,
  type BackendDescriptor,
} from "../runtime/backend-matrix.js";
import { backendInstallDir } from "../paths.js";

const HEALTH_TIMEOUT_MS = 180_000;
const HEALTH_POLL_MS = 400;
/** Offload everything. There is no CPU inference path. */
const DEFAULT_NGL = 99;
const DEFAULT_CTX_SIZE = 16_384;
const DEFAULT_IMAGE_MAX_TOKENS = 1024;

export const ERR_NO_BINARY = "ERR_LLAMA_SERVER_NO_BINARY";
export const ERR_NO_WEIGHTS = "ERR_LLAMA_SERVER_NO_WEIGHTS";
export const ERR_HEALTH_TIMEOUT = "ERR_LLAMA_SERVER_HEALTH_TIMEOUT";
export const ERR_CRASHED = "ERR_LLAMA_SERVER_CRASHED";
/** A newer start took over while this one was still waiting on its port. */
export const ERR_SUPERSEDED = "ERR_LLAMA_SERVER_SUPERSEDED";

export interface LlamaServerConfig {
  backendId: BackendId;
  modelPath: string;
  /** Omitted on backends whose build cannot load a projector. */
  mmprojPath?: string | null;
  contextSize?: number;
  gpuLayers?: number;
  imageMaxTokens?: number;
  imageMinTokens?: number;
  /** Label for logs only. */
  modelId?: string;
}

export interface LlamaServerStatus {
  running: boolean;
  port: number;
  baseUrl: string | null;
  backendId: BackendId | null;
  modelId: string | null;
  visionEnabled: boolean;
  failed: boolean;
  failureReason: string;
}

let child: ChildProcess | null = null;
let port = 0;
let starting: Promise<number> | null = null;
let activeKey = "";
let activeConfig: LlamaServerConfig | null = null;
let intentionalStop = false;
let failed = false;
let failureReason = "";
let restartBudget = 1;
let onFailure: ((reason: string) => void) | null = null;
/**
 * Tail of stderr per process, so a startup failure reports the server's own
 * message. Keyed by process rather than kept as one module buffer: two starts
 * can overlap, and a shared buffer let a failing attempt quote the log of the
 * healthy process that had replaced it - an error that read as a success.
 */
const stderrTails = new WeakMap<ChildProcess, string[]>();

/**
 * Bearer token for this process, minted once at module load.
 *
 * The server listens on loopback, but loopback is not a trust boundary: any
 * local process, any other account on the machine, and anything that can get a
 * browser to issue a request could otherwise drive the model directly and skip
 * every approval gate in front of it. The token is never read from config and
 * has no "off" switch, so there is no deployment in which the port is open.
 */
const apiKey = randomBytes(32).toString("hex");

/** Authorization header for every call to the server. */
export function llamaServerAuthHeaders(): Record<string, string> {
  return { authorization: `Bearer ${apiKey}` };
}

/**
 * Raw bearer token for OpenAI-compatible clients pointed at this process.
 * Same secret as `llamaServerAuthHeaders`; never persisted or user-configurable.
 */
export function llamaServerApiKey(): string {
  return apiKey;
}

export function setLlamaServerFailureHandler(handler: ((reason: string) => void) | null): void {
  onFailure = handler;
}

export function getLlamaServerStatus(): LlamaServerStatus {
  return {
    running: Boolean(child && port > 0),
    port,
    baseUrl: port > 0 ? `http://127.0.0.1:${port}` : null,
    backendId: activeConfig?.backendId ?? null,
    modelId: activeConfig?.modelId ?? null,
    visionEnabled: Boolean(activeConfig?.mmprojPath),
    failed,
    failureReason,
  };
}

/** Throws if the server is not up; callers must not silently degrade. */
export function requireLlamaServerBaseUrl(): string {
  if (!child || port <= 0) {
    throw new Error(
      failed
        ? `${ERR_CRASHED}: llama-server unavailable (${failureReason})`
        : "ERR_LLAMA_SERVER_NOT_STARTED: llama-server is not running",
    );
  }
  return `http://127.0.0.1:${port}`;
}

/**
 * Server executable for a backend. Env override wins so a hand-built binary
 * (the only option on Linux CUDA at the pinned release) can be pointed at.
 */
export function resolveServerBinary(backendId: BackendId): string | null {
  const configured = process.env.REDROB_LLAMA_SERVER?.trim();
  if (configured) return existsSync(configured) ? configured : null;

  const descriptor: BackendDescriptor = backendDescriptor(backendId);
  const root = backendInstallDir(backendId);
  // Archives extract either flat or under a build/bin prefix depending on target.
  const candidates = [
    join(root, descriptor.serverBinary),
    join(root, "bin", descriptor.serverBinary),
    join(root, "build", "bin", descriptor.serverBinary),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function configKey(config: LlamaServerConfig): string {
  return [
    config.backendId,
    config.modelPath,
    config.mmprojPath ?? "",
    config.contextSize ?? DEFAULT_CTX_SIZE,
    config.gpuLayers ?? DEFAULT_NGL,
    config.imageMaxTokens ?? DEFAULT_IMAGE_MAX_TOKENS,
  ].join("|");
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const chosen = address && typeof address === "object" ? address.port : 0;
      probe.close((err) => (err ? reject(err) : resolve(chosen)));
    });
  });
}

/**
 * Poll one process's port until it answers. The process is an argument, not
 * read from module state: a start that has been superseded must stop waiting
 * rather than keep probing a port nobody listens on until the timeout, which
 * is how a healthy server on a new port produced a health timeout on the old.
 */
async function waitHealthy(
  proc: ChildProcess,
  targetPort: number,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<void> {
  const started = Date.now();
  let lastErr = "not ready";
  while (Date.now() - started < timeoutMs) {
    if (child !== proc) {
      throw new Error(`${ERR_SUPERSEDED}: a newer start replaced this one`);
    }
    if (proc.exitCode !== null || proc.signalCode !== null) {
      throw new Error(`${ERR_CRASHED}: process exited during startup`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${targetPort}/health`, {
        headers: llamaServerAuthHeaders(),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { status?: string } | null;
        if (!body || body.status === "ok") return;
        lastErr = `status=${body.status}`;
      } else {
        lastErr = `HTTP ${res.status}`;
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS));
  }
  throw new Error(`${ERR_HEALTH_TIMEOUT}: ${lastErr}${tailText(proc)}`);
}

function tailText(proc: ChildProcess): string {
  const tail = stderrTails.get(proc) ?? [];
  return tail.length > 0 ? `\n${tail.join("")}` : "";
}

function markFailed(reason: string): void {
  failed = true;
  failureReason = reason;
  try {
    onFailure?.(reason);
  } catch {
    /* a UI notify failure must not mask the original fault */
  }
}

function buildArgs(config: LlamaServerConfig, targetPort: number): string[] {
  const descriptor = backendDescriptor(config.backendId);
  const args = [
    "-m",
    config.modelPath,
    // Loopback only, and not configurable. An externally reachable model port
    // bypasses every approval gate the app puts in front of tool use.
    "--host",
    "127.0.0.1",
    "--api-key",
    apiKey,
    "--port",
    String(targetPort),
    "-ngl",
    String(config.gpuLayers ?? DEFAULT_NGL),
    "-c",
    String(config.contextSize ?? DEFAULT_CTX_SIZE),
    "--jinja",
    // Per-request control; the chat route sets enable_thinking itself.
    "--reasoning",
    "auto",
    // Split reasoning into message.reasoning_content instead of inline tags.
    "--reasoning-format",
    "auto",
    // Prefix reuse across field-fill calls, which re-send a shared document preamble.
    "--cache-reuse",
    "256",
    "--no-webui",
  ];

  if (config.mmprojPath && descriptor.supportsVision) {
    args.push("--mmproj", config.mmprojPath);
    args.push("--image-max-tokens", String(config.imageMaxTokens ?? DEFAULT_IMAGE_MAX_TOKENS));
    args.push(
      "--image-min-tokens",
      String(config.imageMinTokens ?? config.imageMaxTokens ?? DEFAULT_IMAGE_MAX_TOKENS),
    );
  } else {
    // Stop llama-server auto-fetching a projector we deliberately did not install.
    args.push("--no-mmproj");
  }

  return args;
}

function attachExitHandler(proc: ChildProcess, config: LlamaServerConfig): void {
  proc.once("exit", (code, signal) => {
    if (child !== proc) return;
    child = null;
    port = 0;
    activeKey = "";
    if (intentionalStop) return;
    const detail = `exit code=${code ?? "null"} signal=${signal ?? "null"}`;
    if (restartBudget > 0) {
      restartBudget -= 1;
      void ensureLlamaServer(config).catch((err) => {
        markFailed(
          `${ERR_CRASHED}: ${detail}; restart failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      return;
    }
    markFailed(`${ERR_CRASHED}: ${detail} (twice)${tailText(proc)}`);
  });
}

/**
 * Kill the running process, leaving any start in flight alone.
 *
 * A start calls this to clear the ground before it spawns. It must not drop
 * `starting`, because that is the very handle it is being tracked by: losing it
 * tells every other caller that nobody is starting, and they begin competing
 * starts that then kill each other's processes.
 */
function killChild(): void {
  intentionalStop = true;
  activeKey = "";
  activeConfig = null;
  const proc = child;
  child = null;
  port = 0;
  if (proc) {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }
}

/** Stop the server and abandon any start in flight. */
export function stopLlamaServer(): void {
  starting = null;
  killChild();
}

/**
 * Start the instance, or reuse it when the config is unchanged and it is healthy.
 * A changed model or backend replaces the process — never a second one.
 *
 * A start that was superseded mid-flight is retried rather than reported. The
 * caller asked for a running server, and if another start already produced one
 * then that is the answer; raising it as a failure told a person their office
 * had no model while the model was loaded and serving.
 */
export async function ensureLlamaServer(config: LlamaServerConfig): Promise<number> {
  try {
    return await startOrReuse(config);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith(ERR_SUPERSEDED)) {
      throw err;
    }
    // Another start owns the process now. Wait for it to settle rather than
    // starting again: a fresh attempt here would tear down the very process
    // that superseded this one, and the two would race indefinitely.
    const inFlight = starting;
    if (inFlight) return await inFlight;
    return startOrReuse(config);
  }
}

async function startOrReuse(config: LlamaServerConfig): Promise<number> {
  if (failed) {
    throw new Error(`${ERR_CRASHED}: llama-server disabled — ${failureReason}`);
  }
  const key = configKey(config);

  if (child && port > 0 && activeKey === key) {
    const running = child;
    try {
      await waitHealthy(running, port, 3_000);
      return port;
    } catch {
      if (child === running) killChild();
    }
  } else if (child && activeKey !== "" && activeKey !== key) {
    // A settled server running the wrong model is replaced. An unsettled one
    // (empty key) belongs to a start still in flight, and the `starting` check
    // below joins it rather than shooting it.
    stopLlamaServer();
  }

  if (starting) return starting;

  starting = (async () => {
    const binary = resolveServerBinary(config.backendId);
    if (!binary) {
      const descriptor = backendDescriptor(config.backendId);
      throw new Error(
        `${ERR_NO_BINARY}: llama-server for ${config.backendId} not found in ${backendInstallDir(config.backendId)}. ` +
          (descriptor.unavailableReason ?? "Install the backend from setup."),
      );
    }
    await access(binary, constants.X_OK).catch(async () => {
      await access(binary, constants.R_OK);
    });

    try {
      await access(config.modelPath, constants.R_OK);
    } catch {
      throw new Error(`${ERR_NO_WEIGHTS}: model not readable at ${config.modelPath}`);
    }
    if (config.mmprojPath) {
      try {
        await access(config.mmprojPath, constants.R_OK);
      } catch {
        throw new Error(`${ERR_NO_WEIGHTS}: mmproj not readable at ${config.mmprojPath}`);
      }
    }

    killChild();
    intentionalStop = false;

    const nextPort = await freePort();
    const args = buildArgs(config, nextPort);
    const proc = spawn(binary, args, { windowsHide: true, cwd: dirname(binary) });
    child = proc;
    activeConfig = config;
    attachExitHandler(proc, config);

    const tail: string[] = [];
    stderrTails.set(proc, tail);
    proc.stderr?.on("data", (chunk: Buffer) => {
      tail.push(chunk.toString("utf8"));
      if (tail.length > 40) tail.shift();
    });
    proc.stdout?.on("data", () => undefined);

    try {
      await waitHealthy(proc, nextPort);
    } catch (err) {
      // Tear down only what this attempt started. If a newer start already owns
      // the module state, killing it would turn one failed start into two.
      if (child === proc) killChild();
      else {
        try {
          proc.kill();
        } catch {
          /* already gone */
        }
      }
      throw err;
    }

    port = nextPort;
    activeKey = key;
    console.info(
      `[llama-server] backend=${config.backendId} model=${config.modelId ?? config.modelPath} ` +
        `vision=${config.mmprojPath ? 1 : 0} port=${nextPort}`,
    );
    return nextPort;
  })();

  const own = starting;
  try {
    return await own;
  } finally {
    // Only retire our own start. By the time a losing attempt unwinds, `starting`
    // may already be the newer start that replaced it, and clearing that would
    // hide the winner from everyone still waiting on it.
    if (starting === own) starting = null;
  }
}

export async function restartLlamaServer(): Promise<number> {
  const config = activeConfig;
  if (!config) throw new Error("ERR_LLAMA_SERVER_NOT_STARTED: nothing to restart");
  stopLlamaServer();
  failed = false;
  failureReason = "";
  restartBudget = 1;
  return ensureLlamaServer(config);
}

export function shutdownLlamaServer(): void {
  stopLlamaServer();
}

/** Test-only: clear the failure latch and process state. */
export function resetLlamaServerForTests(): void {
  stopLlamaServer();
  failed = false;
  failureReason = "";
  restartBudget = 1;
}
