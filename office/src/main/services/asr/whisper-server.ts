import { access, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { WhisperCliResult, WhisperSegment } from "./whisper-cli.js";

/**
 * Optional resident whisper.cpp HTTP server (whisper-server).
 * Keeps the ggml model loaded across utterances — much faster than
 * spawning whisper-cli (which reloads weights every call).
 *
 * Windows whisper-bin zips often ship only whisper-cli; when server is
 * missing we fall back to CLI in the sidecar.
 */

/**
 * Bearer token for this process, minted once at load.
 *
 * Loopback is not a trust boundary: any other local process could otherwise
 * drive this server directly. The token is never read from config and has no
 * "off" switch, which is the same rule the inference server follows.
 */
const apiKey = randomBytes(32).toString("hex");

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${apiKey}` };
}

let child: ChildProcessWithoutNullStreams | null = null;
let port = 0;
let loadedModel = "";
let loadedLanguage = "";
let starting: Promise<number> | null = null;

function firstExisting(paths: string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}

export function resolveWhisperServerBinary(modelsDir: string): string | null {
  const configured = process.env.REDROB_WHISPER_SERVER?.trim();
  if (configured) return existsSync(configured) ? configured : null;
  return (
    firstExisting([
      join(modelsDir, "bin", "whisper-server.exe"),
      join(modelsDir, "bin", "server.exe"),
      join(modelsDir, "bin", "whisper-server"),
      join(modelsDir, "bin", "server"),
    ]) ?? null
  );
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const chosen =
        address && typeof address === "object" ? address.port : 0;
      probe.close((err) => {
        if (err) reject(err);
        else resolve(chosen);
      });
    });
  });
}

async function waitHealthy(targetPort: number, timeoutMs = 60_000): Promise<void> {
  const started = performance.now();
  let lastErr = "not ready";
  while (performance.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${targetPort}/health`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { status?: string } | null;
        if (!body || body.status === "ok") return;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`ERR_ASR_SERVER: whisper-server health timeout (${lastErr})`);
}

function stopWhisperServer(): void {
  if (!child) return;
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  child = null;
  port = 0;
  loadedModel = "";
  loadedLanguage = "";
  starting = null;
}

async function startWhisperServer(options: {
  serverBinary: string;
  model: string;
  language: string;
}): Promise<number> {
  if (
    child &&
    port > 0 &&
    loadedModel === options.model &&
    loadedLanguage === options.language
  ) {
    try {
      await waitHealthy(port, 2_000);
      return port;
    } catch {
      stopWhisperServer();
    }
  }

  if (starting) return starting;

  starting = (async () => {
    stopWhisperServer();
    await access(options.serverBinary);
    await access(options.model);
    const nextPort = await freePort();
    const proc = spawn(
      options.serverBinary,
      [
        "-m",
        options.model,
        "-l",
        options.language,
        // Loopback only, and not configurable.
        "--host",
        "127.0.0.1",
        "--api-key",
        apiKey,
        "--port",
        String(nextPort),
      ],
      { windowsHide: true },
    );
    child = proc;
    proc.once("exit", () => {
      if (child === proc) {
        child = null;
        port = 0;
        loadedModel = "";
        loadedLanguage = "";
      }
    });
    proc.stderr.on("data", () => undefined);
    proc.stdout.on("data", () => undefined);
    await waitHealthy(nextPort);
    port = nextPort;
    loadedModel = options.model;
    loadedLanguage = options.language;
    return nextPort;
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

function parseServerJson(raw: unknown): WhisperCliResult {
  if (!raw || typeof raw !== "object") {
    return { text: "", segments: [] };
  }
  const obj = raw as Record<string, unknown>;
  const text =
    typeof obj.text === "string"
      ? obj.text.trim()
      : typeof obj.transcription === "string"
        ? obj.transcription.trim()
        : "";
  const segments: WhisperSegment[] = [];
  const list = Array.isArray(obj.segments)
    ? obj.segments
    : Array.isArray(obj.transcription)
      ? obj.transcription
      : [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const piece =
      typeof row.text === "string"
        ? row.text.trim()
        : typeof row.transcription === "string"
          ? row.transcription.trim()
          : "";
    if (!piece) continue;
    const start =
      typeof row.start === "number"
        ? row.start * 1000
        : typeof row.offsets === "object" &&
            row.offsets &&
            typeof (row.offsets as { from?: number }).from === "number"
          ? (row.offsets as { from: number }).from
          : 0;
    const end =
      typeof row.end === "number"
        ? row.end * 1000
        : typeof row.offsets === "object" &&
            row.offsets &&
            typeof (row.offsets as { to?: number }).to === "number"
          ? (row.offsets as { to: number }).to
          : start;
    segments.push({ startMs: Math.round(start), endMs: Math.round(end), text: piece });
  }
  return {
    text: text || segments.map((s) => s.text).join(" ").trim(),
    segments,
  };
}

/** Transcribe via resident server; throws if server binary missing or request fails. */
export async function runWhisperServer(options: {
  serverBinary: string;
  model: string;
  wavPath: string;
  language: string;
}): Promise<WhisperCliResult> {
  const targetPort = await startWhisperServer({
    serverBinary: options.serverBinary,
    model: options.model,
    language: options.language,
  });
  const wav = await readFile(options.wavPath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "utt.wav");
  form.append("response_format", "json");
  form.append("temperature", "0.0");
  form.append("temperature_inc", "0.0");
  const res = await fetch(`http://127.0.0.1:${targetPort}/inference`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ERR_ASR_SERVER: inference HTTP ${res.status} ${detail}`.trim());
  }
  const json = (await res.json()) as unknown;
  return parseServerJson(json);
}

export function shutdownWhisperServer(): void {
  stopWhisperServer();
}
