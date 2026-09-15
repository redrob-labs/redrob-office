import { readFile } from "node:fs/promises";

export interface MonoPcm16Wav {
  samples: Float32Array;
  sampleRate: 16_000;
}

/** Maps a contiguous range in the (possibly trimmed) output back to source audio. */
export interface VadKeptRegion {
  /** Inclusive start sample in the original PCM. */
  srcStartSample: number;
  /** Exclusive end sample in the original PCM. */
  srcEndSample: number;
  /** Inclusive start sample in the concatenated/trimmed output (0 when untrimmed). */
  outStartSample: number;
}

export interface EnergyVadResult {
  /** Samples passed to ASR (original or concatenated speech). */
  samples: Float32Array;
  speechRatio: number;
  model: "energy-rms";
  /** Absolute RMS threshold after adaptive noise-floor estimation. */
  threshold: number;
  keptRegions: VadKeptRegion[];
  /** True when samples were concatenated (timeline differs from source). */
  trimmed: boolean;
}

const WAV_FORMAT_PCM = 1;
const REQUIRED_SAMPLE_RATE = 16_000;
/** Reject near-silent clips before Whisper invents speech. */
export const MIN_SPEECH_RATIO = 0.02;
export const MIN_SPEECH_MS = 300;

function readFourCc(buffer: Buffer, offset: number): string {
  return buffer.toString("ascii", offset, offset + 4);
}

/**
 * Read the narrowly-supported ASR input format. Conversion belongs at the
 * import boundary; accepting arbitrary WAV variants here risks silent errors.
 */
export async function loadWavPcm16Mono16k(path: string): Promise<MonoPcm16Wav> {
  const wav = await readFile(path);
  if (wav.length < 12 || readFourCc(wav, 0) !== "RIFF" || readFourCc(wav, 8) !== "WAVE") {
    throw new Error("Unsupported audio: expected a RIFF/WAVE PCM16 mono 16 kHz file");
  }

  let offset = 12;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let audioFormat: number | undefined;
  let pcmData: Buffer | undefined;

  while (offset + 8 <= wav.length) {
    const id = readFourCc(wav, offset);
    const size = wav.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > wav.length) {
      throw new Error("Unsupported audio: WAV chunk extends past end of file");
    }

    if (id === "fmt ") {
      if (size < 16) throw new Error("Unsupported audio: invalid WAV fmt chunk");
      audioFormat = wav.readUInt16LE(dataStart);
      channels = wav.readUInt16LE(dataStart + 2);
      sampleRate = wav.readUInt32LE(dataStart + 4);
      bitsPerSample = wav.readUInt16LE(dataStart + 14);
    } else if (id === "data") {
      pcmData = wav.subarray(dataStart, dataEnd);
    }
    offset = dataEnd + (size % 2);
  }

  if (
    audioFormat !== WAV_FORMAT_PCM ||
    channels !== 1 ||
    sampleRate !== REQUIRED_SAMPLE_RATE ||
    bitsPerSample !== 16 ||
    !pcmData
  ) {
    throw new Error(
      "Unsupported audio: expected uncompressed PCM16, mono, 16 kHz WAV (convert before ASR)",
    );
  }
  if (pcmData.length % 2 !== 0) throw new Error("Unsupported audio: PCM16 data has odd length");

  const samples = new Float32Array(pcmData.length / 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = pcmData.readInt16LE(i * 2) / 32_768;
  }
  return { samples, sampleRate: REQUIRED_SAMPLE_RATE };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx] ?? 0;
}

/**
 * Adaptive energy VAD.
 * - `trim: true` (batch): concatenate padded speech regions for Whisper.
 * - `trim: false` (PTT): keep original timeline; still compute speechRatio + regions for gating.
 */
export function energyVadTrim(
  samples: Float32Array,
  sampleRate: number,
  options?: { trim?: boolean },
): EnergyVadResult {
  const trim = options?.trim ?? true;
  if (sampleRate <= 0) throw new Error("Invalid sample rate for VAD");
  if (samples.length === 0) {
    return {
      samples: new Float32Array(),
      speechRatio: 0,
      model: "energy-rms",
      threshold: 0,
      keptRegions: [],
      trimmed: false,
    };
  }

  const frameSamples = Math.max(1, Math.round(sampleRate * 0.03));
  const frameCount = Math.ceil(samples.length / frameSamples);
  const frameRms: number[] = new Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * frameSamples;
    const end = Math.min(start + frameSamples, samples.length);
    let sumSquares = 0;
    for (let index = start; index < end; index += 1) sumSquares += samples[index]! ** 2;
    frameRms[frame] = Math.sqrt(sumSquares / (end - start));
  }

  const sorted = [...frameRms].sort((a, b) => a - b);
  const noiseFloor = percentile(sorted, 0.15);
  // PTT (untrimmed) often has quiet laptop mics — lower absolute floor so soft speech counts.
  const absoluteFloor = trim ? 0.008 : 0.0015;
  const multiplier = trim ? 3.5 : 2.2;
  const threshold = Math.max(absoluteFloor, noiseFloor * multiplier);

  const speech = frameRms.map((rms) => rms >= threshold);
  let speechFrames = 0;
  for (const isSpeech of speech) if (isSpeech) speechFrames += 1;

  const padFrames = Math.ceil((sampleRate * 0.2) / frameSamples);
  const keep = new Array<boolean>(frameCount).fill(false);
  for (let frame = 0; frame < frameCount; frame += 1) {
    if (!speech[frame]) continue;
    for (
      let padded = Math.max(0, frame - padFrames);
      padded <= Math.min(frameCount - 1, frame + padFrames);
      padded += 1
    ) {
      keep[padded] = true;
    }
  }

  // Merge contiguous kept frames into regions in source sample space.
  const keptRegions: VadKeptRegion[] = [];
  let regionStart: number | null = null;
  for (let frame = 0; frame <= frameCount; frame += 1) {
    const on = frame < frameCount && keep[frame];
    if (on && regionStart === null) regionStart = frame * frameSamples;
    if (!on && regionStart !== null) {
      const srcEndSample = Math.min(frame * frameSamples, samples.length);
      keptRegions.push({
        srcStartSample: regionStart,
        srcEndSample,
        outStartSample: 0, // filled below when trimming
      });
      regionStart = null;
    }
  }

  if (!trim) {
    return {
      samples,
      speechRatio: speechFrames / frameCount,
      model: "energy-rms",
      threshold,
      keptRegions: keptRegions.map((r) => ({ ...r, outStartSample: r.srcStartSample })),
      trimmed: false,
    };
  }

  let retained = 0;
  for (const region of keptRegions) retained += region.srcEndSample - region.srcStartSample;
  const trimmedSamples = new Float32Array(retained);
  let writeAt = 0;
  for (const region of keptRegions) {
    region.outStartSample = writeAt;
    const slice = samples.subarray(region.srcStartSample, region.srcEndSample);
    trimmedSamples.set(slice, writeAt);
    writeAt += slice.length;
  }

  return {
    samples: trimmedSamples,
    speechRatio: speechFrames / frameCount,
    model: "energy-rms",
    threshold,
    keptRegions,
    trimmed: true,
  };
}

/** Map a millisecond range on the ASR (output) timeline back onto the source WAV. */
export function remapOutputMsToSource(
  startMs: number,
  endMs: number,
  regions: readonly VadKeptRegion[],
  sampleRate: number,
): { startMs: number; endMs: number } {
  if (regions.length === 0 || sampleRate <= 0) {
    return { startMs: Math.max(0, Math.round(startMs)), endMs: Math.max(0, Math.round(endMs)) };
  }

  const mapPoint = (outMs: number): number => {
    const outSample = Math.max(0, Math.round((outMs / 1000) * sampleRate));
    for (const region of regions) {
      const outEnd = region.outStartSample + (region.srcEndSample - region.srcStartSample);
      if (outSample >= region.outStartSample && outSample < outEnd) {
        const srcSample = region.srcStartSample + (outSample - region.outStartSample);
        return Math.round((srcSample / sampleRate) * 1000);
      }
    }
    // Past last region → clamp to last source end.
    const last = regions[regions.length - 1]!;
    return Math.round((last.srcEndSample / sampleRate) * 1000);
  };

  const start = mapPoint(startMs);
  const end = mapPoint(endMs);
  return { startMs: start, endMs: Math.max(start, end) };
}

export function assertSpeechPresent(
  vad: EnergyVadResult,
  sampleRate: number,
  options?: { loose?: boolean },
): void {
  // When untrimmed, sample length is the full clip — use kept regions (or ratio).
  const speechSamples = vad.trimmed
    ? vad.samples.length
    : vad.keptRegions.reduce((sum, r) => sum + (r.srcEndSample - r.srcStartSample), 0);
  const speechMs = (speechSamples / sampleRate) * 1000;
  // PTT clips often have leading silence while the mic graph comes up — use a looser gate.
  const minRatio = options?.loose ? 0.002 : MIN_SPEECH_RATIO;
  const minMs = options?.loose ? 40 : MIN_SPEECH_MS;
  if (vad.speechRatio < minRatio || speechMs < minMs) {
    throw new Error(
      `ERR_ASR_NO_SPEECH: speechRatio=${vad.speechRatio.toFixed(3)} speechMs=${Math.round(speechMs)}`,
    );
  }
}
