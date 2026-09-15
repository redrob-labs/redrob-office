import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  assertSpeechPresent,
  energyVadTrim,
  loadWavPcm16Mono16k,
  remapOutputMsToSource,
} from "./services/asr/vad.js";
import {
  resolveWhisperBinary,
  resolveWhisperModel,
  runWhisperCli,
  type WhisperSegment,
} from "./services/asr/whisper-cli.js";
import {
  resolveWhisperServerBinary,
  runWhisperServer,
  shutdownWhisperServer,
} from "./services/asr/whisper-server.js";

type RequestMessage =
  | { id: string; type: "ping" }
  | {
      id: string;
      type: "transcribe";
      payload: {
        path: string;
        language: string;
        modelTier: "small" | "turbo";
        /** Batch trims silence; PTT keeps the original timeline. Default true. */
        trimVad?: boolean;
      };
    }
  | { id: string; type: "shutdown" };

type ResponseMessage =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string; code?: string }
  | { type: "log"; line: string };

declare const process: NodeJS.Process & {
  parentPort?: {
    on: (event: "message", listener: (message: RequestMessage) => void) => void;
    postMessage: (message: ResponseMessage) => void;
  };
};

function encodePcm16Wav(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    wav.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
  }
  return wav;
}

async function transcribe(payload: {
  path: string;
  language: string;
  modelTier: "small" | "turbo";
  trimVad?: boolean;
}): Promise<{
  text: string;
  segments: WhisperSegment[];
  model: string;
  vadApplied: boolean;
  vadModel: "energy-rms";
  speechRatio: number;
  vadThreshold: number;
}> {
  const { samples, sampleRate } = await loadWavPcm16Mono16k(payload.path);
  const trimVad = payload.trimVad ?? true;
  const vad = energyVadTrim(samples, sampleRate, { trim: trimVad });
  assertSpeechPresent(vad, sampleRate, { loose: !trimVad });

  const modelsDir = process.env.REDROB_MODELS_DIR;
  if (!modelsDir) throw new Error("ERR_ASR_MODEL: REDROB_MODELS_DIR is not configured");
  const binary = resolveWhisperBinary(modelsDir);
  const serverBinary = resolveWhisperServerBinary(modelsDir);
  const model = resolveWhisperModel(modelsDir, payload.modelTier);
  process.parentPort?.postMessage({
    type: "log",
    line: `[asr] plan tier=${payload.modelTier} vad=${vad.model} trim=${vad.trimmed} speechRatio=${vad.speechRatio.toFixed(3)} threshold=${vad.threshold.toFixed(4)} binary=${binary} server=${serverBinary ?? "none"} model=${model}`,
  });

  const workDir = await mkdtemp(join(tmpdir(), "redrob-asr-"));
  const asrWav = join(workDir, `${randomUUID()}.wav`);
  try {
    await writeFile(asrWav, encodePcm16Wav(vad.samples, sampleRate));
    let result;
    if (serverBinary) {
      try {
        result = await runWhisperServer({
          serverBinary,
          model,
          wavPath: asrWav,
          language: payload.language,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        process.parentPort?.postMessage({
          type: "log",
          line: `[asr] WARN server failed, falling back to CLI: ${detail}`,
        });
        result = await runWhisperCli({
          binary,
          model,
          wavPath: asrWav,
          language: payload.language,
        });
      }
    } else {
      result = await runWhisperCli({
        binary,
        model,
        wavPath: asrWav,
        language: payload.language,
      });
    }
    const segments = vad.trimmed
      ? result.segments.map((segment) => {
          const remapped = remapOutputMsToSource(
            segment.startMs,
            segment.endMs,
            vad.keptRegions,
            sampleRate,
          );
          return { ...segment, startMs: remapped.startMs, endMs: remapped.endMs };
        })
      : result.segments;
    return {
      text: result.text,
      segments,
      model,
      vadApplied: true,
      vadModel: vad.model,
      speechRatio: vad.speechRatio,
      vadThreshold: vad.threshold,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function errorCode(detail: string): string | undefined {
  if (detail.startsWith("ERR_ASR_BINARY")) return "ERR_ASR_BINARY";
  if (detail.startsWith("ERR_ASR_NO_SPEECH")) return "ERR_ASR_NO_SPEECH";
  if (detail.startsWith("ERR_ASR_MODEL")) return "ERR_ASR_MODEL";
  return undefined;
}

async function handle(message: RequestMessage): Promise<unknown> {
  switch (message.type) {
    case "ping": {
      const modelsDir = process.env.REDROB_MODELS_DIR ?? "(unset)";
      let binary = "(unavailable)";
      try {
        binary = resolveWhisperBinary(modelsDir);
      } catch (error) {
        binary = error instanceof Error ? error.message : String(error);
      }
      process.parentPort?.postMessage({
        type: "log",
        line: `[asr] plan vad=energy-rms modelsDir=${modelsDir} binary=${binary}`,
      });
      return { pong: true, isolation: "utilityProcess" };
    }
    case "transcribe":
      return transcribe(message.payload);
    case "shutdown":
      shutdownWhisperServer();
      setTimeout(() => process.exit(0), 0);
      return { stopping: true };
    default:
      throw new Error("Unknown ASR sidecar message");
  }
}

process.parentPort?.on("message", (raw: unknown) => {
  const envelope = raw as { data?: RequestMessage } | RequestMessage;
  const message =
    envelope && typeof envelope === "object" && "data" in envelope && envelope.data
      ? envelope.data
      : (envelope as RequestMessage);
  void handle(message)
    .then((result) => {
      process.parentPort?.postMessage({ id: message.id, ok: true, result });
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      const code = errorCode(detail);
      process.parentPort?.postMessage({
        id: message.id,
        ok: false,
        error: detail,
        ...(code ? { code } : {}),
      });
    });
});
