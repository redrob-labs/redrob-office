import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectDeviceProfile } from "@redrob/kernel";
import { hostTranscribeAsr, startAsrHost, getAsrIsolation } from "./asr-host.js";

function turboModelPresent(modelsDir: string): boolean {
  return [
    "ggml-large-v3-turbo.bin",
    "ggml-large-v3-turbo-q5_0.bin",
  ].some((name) =>
    [join(modelsDir, name), join(modelsDir, "asr", name), join(modelsDir, "models", name)].some(
      (path) => existsSync(path),
    ),
  );
}

export async function resolveAsrModelTier(): Promise<"small" | "turbo"> {
  // ASR is independent of the LLM inference backend — do not force small just
  // because chat is on CPU. Use turbo whenever the file is on disk and RAM is OK.
  const modelsDir = process.env.REDROB_MODELS_DIR?.trim();
  if (!modelsDir || !turboModelPresent(modelsDir)) return "small";
  try {
    const profile = await detectDeviceProfile();
    if ((profile.totalRamMb ?? 0) > 0 && (profile.totalRamMb ?? 0) < 8 * 1024) {
      return "small";
    }
  } catch {
    // Prefer installed turbo if we cannot read RAM.
  }
  return "turbo";
}

/** Ensure ASR utilityProcess is up; never falls back in-process. */
export async function ensureAsrReady(log?: (line: string) => void): Promise<void> {
  if (getAsrIsolation() === "utilityProcess") return;
  await startAsrHost(log);
}

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
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    wav.writeInt16LE((s * 0x7fff) | 0, 44 + i * 2);
  }
  return Buffer.from(wav);
}

/**
 * Voice-mode path: raw PCM16 LE mono @ 16kHz → WAV → ASR utilityProcess.
 * VAD runs once inside the sidecar (no pre-trim) so PTT keeps the source timeline.
 */
export async function transcribePcmBase64(input: {
  pcmBase64: string;
  language?: string;
}): Promise<{ text: string; model: string }> {
  await ensureAsrReady();
  const buf = Buffer.from(input.pcmBase64, "base64");
  if (buf.length < 2) {
    return { text: "", model: "none" };
  }
  const samples = new Float32Array(buf.length / 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = buf.readInt16LE(i * 2) / 0x8000;
  }
  // Cheap gate before spinning Whisper — empty/near-silent captures.
  let energy = 0;
  const step = Math.max(1, Math.floor(samples.length / 4_000));
  for (let i = 0; i < samples.length; i += step) {
    const v = samples[i] ?? 0;
    energy += v * v;
  }
  const rms = Math.sqrt(energy / Math.max(1, Math.ceil(samples.length / step)));
  if (rms < 0.00035) {
    return { text: "", model: "none" };
  }
  // Soft-normalize quiet captures so energy VAD + Whisper see usable levels.
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const a = Math.abs(samples[i] ?? 0);
    if (a > peak) peak = a;
  }
  if (peak > 1e-5 && peak < 0.35) {
    const gain = Math.min(16, 0.8 / peak);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = (samples[i] ?? 0) * gain;
    }
  }
  const dir = await mkdtemp(join(tmpdir(), "redrob-voice-"));
  const wavPath = join(dir, "utt.wav");
  try {
    await writeFile(wavPath, encodePcm16Wav(samples, 16_000));
    const tier = await resolveAsrModelTier();
    try {
      const result = await hostTranscribeAsr({
        path: wavPath,
        language: input.language ?? "ko",
        modelTier: tier,
        trimVad: false,
      });
      return { text: result.text.trim(), model: result.model };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // Voice interim polls often hit silence; don't reject the IPC as a hard error.
      if (/ERR_ASR_NO_SPEECH/.test(raw)) {
        return { text: "", model: tier };
      }
      throw err;
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
