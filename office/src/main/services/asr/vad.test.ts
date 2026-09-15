import { describe, expect, it } from "vitest";
import {
  assertSpeechPresent,
  energyVadTrim,
  remapOutputMsToSource,
  type VadKeptRegion,
} from "./vad.js";
import { offsetsToMilliseconds, resolveWhisperModel, timestampStringToMilliseconds } from "./whisper-cli.js";
import { requireConsent } from "./consent.js";
import { assertTranscriptAssessable, type TranscriptDocument } from "./types.js";

function tone(sampleRate: number, durationSec: number, hz: number, amplitude = 0.3): Float32Array {
  const n = Math.round(sampleRate * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = Math.sin((2 * Math.PI * hz * i) / sampleRate) * amplitude;
  }
  return out;
}

function silence(sampleRate: number, durationSec: number): Float32Array {
  return new Float32Array(Math.round(sampleRate * durationSec));
}

function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

describe("energyVadTrim", () => {
  const sr = 16_000;

  it("trims silence and reports regions for remap", () => {
    const samples = concat(silence(sr, 1), tone(sr, 0.5, 440), silence(sr, 1), tone(sr, 0.4, 880));
    const vad = energyVadTrim(samples, sr, { trim: true });
    expect(vad.trimmed).toBe(true);
    expect(vad.samples.length).toBeLessThan(samples.length);
    expect(vad.keptRegions.length).toBeGreaterThanOrEqual(1);
    expect(vad.speechRatio).toBeGreaterThan(0.05);
    assertSpeechPresent(vad, sr);
  });

  it("PTT mode keeps original timeline", () => {
    const samples = concat(silence(sr, 0.5), tone(sr, 0.6, 440), silence(sr, 0.5));
    const vad = energyVadTrim(samples, sr, { trim: false });
    expect(vad.trimmed).toBe(false);
    expect(vad.samples.length).toBe(samples.length);
    assertSpeechPresent(vad, sr);
  });

  it("rejects near-silent clips", () => {
    const vad = energyVadTrim(silence(sr, 2), sr, { trim: true });
    expect(() => assertSpeechPresent(vad, sr)).toThrow(/ERR_ASR_NO_SPEECH/);
  });
});

describe("remapOutputMsToSource", () => {
  it("maps trimmed ASR timestamps back to source", () => {
    const sr = 16_000;
    // Two kept regions: [1000ms,1500ms] and [3000ms,3500ms] in source;
    // concatenated output is [0,500ms] then [500ms,1000ms].
    const regions: VadKeptRegion[] = [
      { srcStartSample: sr * 1, srcEndSample: sr * 1.5, outStartSample: 0 },
      { srcStartSample: sr * 3, srcEndSample: sr * 3.5, outStartSample: Math.round(sr * 0.5) },
    ];
    expect(remapOutputMsToSource(100, 200, regions, sr)).toEqual({ startMs: 1100, endMs: 1200 });
    expect(remapOutputMsToSource(600, 700, regions, sr)).toEqual({ startMs: 3100, endMs: 3200 });
  });
});

describe("whisper timestamp parsing", () => {
  it("treats offsets as milliseconds (no ×1000)", () => {
    expect(offsetsToMilliseconds(1234)).toBe(1234);
    expect(offsetsToMilliseconds(12)).toBe(12);
    expect(offsetsToMilliseconds("500")).toBe(500);
  });

  it("parses clock timestamps", () => {
    expect(timestampStringToMilliseconds("00:01.500")).toBe(1500);
    expect(timestampStringToMilliseconds("1:02:03.250")).toBe(3_723_250);
  });
});

describe("resolveWhisperModel", () => {
  it("falls back to small when turbo is missing", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "redrob-whisper-model-"));
    try {
      const asr = join(root, "asr");
      await mkdir(asr);
      await writeFile(join(asr, "ggml-small.bin"), "x");
      expect(resolveWhisperModel(root, "turbo")).toBe(join(asr, "ggml-small.bin"));
      expect(resolveWhisperModel(root, "small")).toBe(join(asr, "ggml-small.bin"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("requireConsent", () => {
  it("persists the caller's acknowledgement bit", () => {
    const record = requireConsent("self", true);
    expect(record.acknowledgedPlaceholders).toBe(true);
  });

  it("rejects missing acknowledgement", () => {
    expect(() => requireConsent("self", false)).toThrow(/acknowledged/);
    expect(() => requireConsent("others", false)).toThrow(/Consent required/);
  });
});

describe("assertTranscriptAssessable", () => {
  it("requires vadApplied", () => {
    const doc: TranscriptDocument = {
      lines: [],
      provenance: { model: "x", vadApplied: false, vadModel: "energy-rms", origin: "local" },
    };
    expect(() => assertTranscriptAssessable(doc)).toThrow(/VAD was not applied/);
  });
});
