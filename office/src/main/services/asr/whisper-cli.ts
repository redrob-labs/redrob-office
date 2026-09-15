import { access, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

export interface WhisperSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface WhisperCliResult {
  text: string;
  segments: WhisperSegment[];
}

export class AsrBinaryError extends Error {
  readonly code = "ERR_ASR_BINARY";

  constructor(message: string) {
    super(message);
    this.name = "AsrBinaryError";
  }
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}

/** Locate a whisper.cpp CLI installed with the local model pack. */
export function resolveWhisperBinary(modelsDir: string): string {
  const configured = process.env.REDROB_WHISPER_CLI?.trim();
  if (configured) {
    if (existsSync(configured)) return configured;
    throw new AsrBinaryError(`ERR_ASR_BINARY: REDROB_WHISPER_CLI does not exist: ${configured}`);
  }
  const binary = firstExisting([
    join(modelsDir, "bin", "whisper-cli.exe"),
    join(modelsDir, "bin", "main.exe"),
    join(modelsDir, "bin", "whisper-cli"),
    join(modelsDir, "bin", "main"),
  ]);
  if (!binary) {
    throw new AsrBinaryError(
      `ERR_ASR_BINARY: whisper.cpp CLI not found under ${join(modelsDir, "bin")}`,
    );
  }
  return binary;
}

/** Resolve the v1 tier choices documented for the local ASR pack. */
export function resolveWhisperModel(modelsDir: string, tierHint: "small" | "turbo"): string {
  const namesFor = (tier: "small" | "turbo"): string[] =>
    tier === "small"
      ? ["ggml-small.bin", "ggml-small.en.bin"]
      : ["ggml-large-v3-turbo.bin", "ggml-large-v3-turbo-q5_0.bin"];

  const find = (tier: "small" | "turbo"): string | undefined => {
    const locations = namesFor(tier).flatMap((name) => [
      join(modelsDir, name),
      join(modelsDir, "asr", name),
      join(modelsDir, "models", name),
    ]);
    return firstExisting(locations);
  };

  const primary = find(tierHint);
  if (primary) return primary;

  // High-RAM desks prefer turbo, but install may only have finished small so far
  // (turbo downloads are large and often left as `.partial`).
  if (tierHint === "turbo") {
    const fallback = find("small");
    if (fallback) return fallback;
  }

  throw new Error(`ERR_ASR_MODEL: ${tierHint} Whisper model not found in ${modelsDir}`);
}

function run(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      reject(
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? new AsrBinaryError(`ERR_ASR_BINARY: cannot execute ${binary}`)
          : error,
      );
    });
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`whisper-cli exited ${code}: ${stderr || stdout}`));
    });
  });
}

const jsonSupportCache = new Map<string, boolean>();

async function supportsJson(binary: string): Promise<boolean> {
  const cached = jsonSupportCache.get(binary);
  if (cached !== undefined) return cached;
  try {
    const { stdout, stderr } = await run(binary, ["--help"]);
    const ok = /(?:^|\s)-oj(?:\s|,)|output-json/i.test(`${stdout}\n${stderr}`);
    jsonSupportCache.set(binary, ok);
    return ok;
  } catch {
    jsonSupportCache.set(binary, false);
    return false;
  }
}

/** whisper.cpp `offsets` are already milliseconds — never scale them. */
export function offsetsToMilliseconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return undefined;
  const numeric = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric) : undefined;
}

/** Parse `HH:MM:SS.mmm` / `MM:SS.mmm` style timestamps into ms. */
export function timestampStringToMilliseconds(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return undefined;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return undefined;
  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

function parseJsonSegments(json: unknown): WhisperSegment[] {
  const root = json as Record<string, unknown>;
  const candidates = [root.segments, root.transcription, root.result].find(Array.isArray);
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const segment = item as Record<string, unknown>;
    const offsets = segment.offsets as Record<string, unknown> | undefined;
    const timestamps = segment.timestamps as Record<string, unknown> | undefined;
    const startMs =
      offsetsToMilliseconds(offsets?.from) ??
      offsetsToMilliseconds(segment.start) ??
      timestampStringToMilliseconds(timestamps?.from);
    const endMs =
      offsetsToMilliseconds(offsets?.to) ??
      offsetsToMilliseconds(segment.end) ??
      timestampStringToMilliseconds(timestamps?.to);
    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    return text && startMs !== undefined && endMs !== undefined ? [{ startMs, endMs, text }] : [];
  });
}

function plainTextResult(stdout: string): WhisperCliResult {
  const text = stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\[[^\]]+\]\s*/, "").trim())
    .filter((line) => line && !/^(whisper_|system_info:|main:)/i.test(line))
    .join(" ")
    .trim();
  return { text, segments: text ? [{ startMs: 0, endMs: 0, text }] : [] };
}

/**
 * Prefer whisper.cpp JSON output where the installed CLI supports it. Older
 * builds are executed in plain-text mode, preserving a usable single segment.
 */
export async function runWhisperCli(options: {
  binary: string;
  model: string;
  wavPath: string;
  language: string;
}): Promise<WhisperCliResult> {
  await Promise.all([access(options.binary), access(options.model), access(options.wavPath)]);
  if (await supportsJson(options.binary)) {
    const outputBase = join(tmpdir(), `redrob-whisper-${randomUUID()}`);
    const jsonPath = `${outputBase}.json`;
    try {
      const { stdout } = await run(options.binary, [
        "-m",
        options.model,
        "-f",
        options.wavPath,
        "-l",
        options.language,
        "-oj",
        "-of",
        outputBase,
      ]);
      const parsed = JSON.parse(await readFile(jsonPath, "utf8")) as Record<string, unknown>;
      const segments = parseJsonSegments(parsed);
      const text =
        typeof parsed.transcription === "string"
          ? parsed.transcription.trim()
          : segments.map((segment) => segment.text).join(" ").trim();
      return { text, segments: segments.length ? segments : plainTextResult(stdout).segments };
    } finally {
      await rm(jsonPath, { force: true }).catch(() => undefined);
    }
  }

  const { stdout } = await run(options.binary, [
    "-m",
    options.model,
    "-f",
    options.wavPath,
    "-l",
    options.language,
  ]);
  return plainTextResult(stdout);
}
