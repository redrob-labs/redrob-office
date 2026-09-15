import { useCallback, useEffect, useRef, useState } from "react";
import { nowMs } from "./clock";
import { runtimeAlertLabel } from "./schema-label";

/**
 * Push-to-talk dictation, lifted out of the chat panel so every message box
 * can have it.
 *
 * The audio path is unchanged from where it grew up: open the mic, buffer raw
 * PCM, watch the level to decide when the talker stopped, resample to the 16 kHz
 * Whisper wants, and hand the result to whoever asked. What moved is only where
 * the state lives — a second chat surface could not have voice while all of
 * this was private to the first one.
 */

const VOICE_WAVE_BARS = 36;
/** Absolute floor — quiet laptop mics often sit near 0.005–0.02 while speaking. */
const VOICE_SPEECH_RMS = 0.0035;
/** End after this much quiet *relative to the talker's recent peak*. */
const VOICE_SILENCE_STOP_MS = 1_200;
/** Fraction of recent speech peak treated as silence. */
const VOICE_SILENCE_PEAK_RATIO = 0.2;
/** After the mic actually starts delivering audio, wait this long before auto-stop can fire. */
const VOICE_MIN_LISTEN_MS = 700;
/** Cap final Whisper audio so stop→send does not encode minutes of PCM. */
const VOICE_FINAL_WINDOW_SEC = 45;
const VOICE_KEEP_CHUNKS_SEC = 50;
/** Below this *before* gain boost = true digital silence (skip Whisper). */
const VOICE_PCM_MIN_RMS = 0.0004;

export const VOICE_BARS = VOICE_WAVE_BARS;

export function asrErrorMessage(t: (path: string) => string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const code = /ERR_[A-Z0-9_]+/.exec(raw)?.[0];
  if (code) return runtimeAlertLabel(t, code);
  return raw;
}

function playMicReadyChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    // Short 띠-디-딕 ascending blips.
    const notes = [988, 1319, 1760];
    const t0 = ctx.currentTime + 0.01;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * 0.085;
      const dur = 0.065;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 450);
  } catch {
    /* ignore — chime is best-effort */
  }
}

function floatToPcm16Base64(float32: Float32Array): string {
  const bytes = new Uint8Array(float32.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < float32.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32[i] ?? 0));
    view.setInt16(i * 2, (s * 0x7fff) | 0, true);
  }
  const Buf = (
    globalThis as unknown as {
      Buffer?: { from: (u: Uint8Array) => { toString: (e: string) => string } };
    }
  ).Buffer;
  if (Buf) return Buf.from(bytes).toString("base64");
  // Browser fallback — chunked; avoid per-byte string concat.
  const CHUNK = 0x2000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    let chunk = "";
    for (let j = 0; j < slice.length; j += 1) chunk += String.fromCharCode(slice[j]!);
    parts.push(chunk);
  }
  return btoa(parts.join(""));
}

function pcmRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

/** Quiet laptop mics often sit at ~0.001–0.01 peak — boost before Whisper/VAD. */
function normalizePcmGain(samples: Float32Array, targetPeak = 0.8): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const a = Math.abs(samples[i] ?? 0);
    if (a > peak) peak = a;
  }
  if (peak < 1e-5) return samples;
  // Already loud enough — leave dynamics alone.
  if (peak >= targetPeak * 0.45) return samples;
  const gain = Math.min(16, targetPeak / peak);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = (samples[i] ?? 0) * gain;
  }
  return out;
}

/** Whisper expects 16 kHz; Chromium often captures at 44.1/48 kHz. */
function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (!Number.isFinite(fromRate) || fromRate <= 0 || Math.abs(fromRate - 16_000) < 1) {
    return input;
  }
  const ratio = fromRate / 16_000;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = (input[i0] ?? 0) * (1 - t) + (input[i1] ?? 0) * t;
  }
  return out;
}

export interface VoiceDictationOptions {
  /** Refuse to arm while the surface is busy. */
  busy: boolean;
  /** Overrides the "this machine is too slow" guard, from Settings. */
  force?: boolean;
  locale: string;
  t: (path: string, vars?: Record<string, string | number>) => string;
  /** What to do with the words. Chat sends them; the office hands them over. */
  onTranscript: (text: string) => void | Promise<void>;
  onError: (message: string | null) => void;
  /** Fired when capture arms, so the surface can clear whatever was typed. */
  onArm?: () => void;
}

export interface VoiceDictation {
  armed: boolean;
  /** True when transcribing here would be painfully slow. Not a hard stop. */
  blocked: boolean;
  connecting: boolean;
  justReady: boolean;
  finalizing: boolean;
  liveWhisper: boolean;
  levels: number[];
  /** The Whisper install prompt, raised when the model or binary is missing. */
  installOpen: boolean;
  closeInstall: () => void;
  readyToRetry: boolean;
  markInstalled: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** Reads without a re-render, for handlers that fire mid-gesture. */
  armedRef: { readonly current: boolean };
  /** Drops the mic without transcribing. For teardown and session resets. */
  abandon: () => void;
}

export function useVoiceDictation(options: VoiceDictationOptions): VoiceDictation {
  const { busy, force = false, locale, t, onTranscript, onError, onArm } = options;

  /**
   * Whether transcribing on this machine is going to hurt.
   *
   * Read here rather than passed in, because it is a fact about the hardware
   * and not about which chat box is asking — the office chat had no such
   * check at all while the general chat did, which is precisely the kind of
   * drift that having one hook is supposed to end.
   */
  const [cpuSlow, setCpuSlow] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  useEffect(() => {
    void window.office
      .getExecutionPlan()
      .then((plan) => setCpuSlow(plan.backend === "cpu"))
      .catch(() => undefined);
    void window.office
      .getSetupSnapshot()
      .then((snapshot) => {
        const route = snapshot.state.inferenceRoute;
        const providers = snapshot.state.llmProviders ?? {};
        const keyed =
          (providers.openai?.apiKey?.trim() ?? "").length > 0;
        setCloudReady(keyed && route === "openai");
      })
      .catch(() => undefined);
  }, []);
  const blocked = cpuSlow && !cloudReady && !force;

  const [armed, setArmed] = useState(false);
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: VOICE_WAVE_BARS }, () => 0.12),
  );
  const [liveWhisper, setLiveWhisper] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [justReady, setJustReady] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [readyToRetry, setReadyToRetry] = useState(false);

  const mediaRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const recRef = useRef<ScriptProcessorNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const voiceStartedAtRef = useRef(0);
  const heardSpeechRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const stoppingRef = useRef(false);
  const stopRef = useRef<() => void>(() => undefined);
  const armedRef = useRef(false);
  const micLiveRef = useRef(false);
  const whisperReadyCacheRef = useRef<boolean | null>(null);
  const liveWhisperRef = useRef(false);
  /** Peak RMS while the user was talking — silence is relative to this. */
  const speechPeakRmsRef = useRef(0);
  /** Actual AudioContext rate (often 44100/48000 on Windows). */
  const captureSampleRateRef = useRef(16_000);

  function stopMeter(): void {
    if (meterRafRef.current != null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    analyserRef.current = null;
    setLevels(Array.from({ length: VOICE_WAVE_BARS }, () => 0.12));
  }

  function clearLiveWhisper(): void {
    liveWhisperRef.current = false;
    setLiveWhisper(false);
  }

  function captureMinSamples(seconds: number): number {
    const rate = captureSampleRateRef.current || 16_000;
    return Math.max(1, Math.floor(rate * seconds));
  }

  function mergeChunksSnapshot(maxSeconds?: number): Float32Array {
    const parts = chunksRef.current;
    let length = parts.reduce((sum, part) => sum + part.length, 0);
    const maxSamples =
      maxSeconds != null ? captureMinSamples(maxSeconds) : Number.POSITIVE_INFINITY;
    let skip = 0;
    if (length > maxSamples) {
      skip = length - maxSamples;
      length = maxSamples;
    }
    const merged = new Float32Array(length);
    let offset = 0;
    let skipped = 0;
    for (const part of parts) {
      if (skipped + part.length <= skip) {
        skipped += part.length;
        continue;
      }
      const from = Math.max(0, skip - skipped);
      const slice = from > 0 ? part.subarray(from) : part;
      merged.set(slice, offset);
      offset += slice.length;
      skipped += part.length;
    }
    return merged;
  }

  function pruneChunkBuffer(maxSeconds: number): void {
    const maxSamples = captureMinSamples(maxSeconds);
    let total = chunksRef.current.reduce((sum, part) => sum + part.length, 0);
    while (total > maxSamples && chunksRef.current.length > 0) {
      const head = chunksRef.current[0];
      if (!head) break;
      if (total - head.length >= maxSamples || chunksRef.current.length === 1) {
        const overflow = total - maxSamples;
        if (overflow > 0 && overflow < head.length) {
          chunksRef.current[0] = head.subarray(overflow);
          total = maxSamples;
          break;
        }
      }
      chunksRef.current.shift();
      total -= head.length;
    }
  }

  function pcm16kBase64FromCapture(merged: Float32Array): string {
    const rate = captureSampleRateRef.current || 16_000;
    const resampled = resampleTo16k(merged, rate);
    return floatToPcm16Base64(normalizePcmGain(resampled));
  }

  function startMeter(ctx: AudioContext, source: MediaStreamAudioSourceNode): void {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    analyserRef.current = analyser;
    // Timers start when audio frames actually arrive — not when the button was pressed.
    voiceStartedAtRef.current = 0;
    heardSpeechRef.current = false;
    lastSpeechAtRef.current = 0;
    speechPeakRmsRef.current = 0;
    // Do not clear micLiveRef here — ScriptProcessor owns that flag.

    const floatBuf = new Float32Array(analyser.fftSize);
    const tick = (): void => {
      const node = analyserRef.current;
      if (!node) return;
      if (!micLiveRef.current) {
        meterRafRef.current = requestAnimationFrame(tick);
        return;
      }
      node.getFloatTimeDomainData(floatBuf);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < floatBuf.length; i += 1) {
        const v = floatBuf[i] ?? 0;
        sum += v * v;
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
      const rms = Math.sqrt(sum / floatBuf.length);
      const now = nowMs();
      // Peak catches short syllables better than RMS alone on quiet mics.
      const level = Math.max(rms, peak * 0.55);
      if (level >= VOICE_SPEECH_RMS) {
        heardSpeechRef.current = true;
        lastSpeechAtRef.current = now;
        speechPeakRmsRef.current = Math.max(speechPeakRmsRef.current * 0.97, level);
      } else if (heardSpeechRef.current && voiceStartedAtRef.current > 0) {
        const silenceCeil = Math.max(
          VOICE_SPEECH_RMS * 0.65,
          speechPeakRmsRef.current * VOICE_SILENCE_PEAK_RATIO,
        );
        if (
          level < silenceCeil &&
          now - voiceStartedAtRef.current >= VOICE_MIN_LISTEN_MS &&
          now - lastSpeechAtRef.current >= VOICE_SILENCE_STOP_MS
        ) {
          stopRef.current();
          return;
        }
      }

      const bars: number[] = [];
      const step = Math.max(1, Math.floor(floatBuf.length / VOICE_WAVE_BARS));
      for (let i = 0; i < VOICE_WAVE_BARS; i += 1) {
        let barPeak = 0;
        const start = i * step;
        for (let j = 0; j < step; j += 1) {
          const v = Math.abs(floatBuf[start + j] ?? 0);
          if (v > barPeak) barPeak = v;
        }
        bars.push(Math.min(1, 0.08 + barPeak * 3.2));
      }
      setLevels(bars);
      meterRafRef.current = requestAnimationFrame(tick);
    };
    meterRafRef.current = requestAnimationFrame(tick);
  }

  async function openMicStream(): Promise<{
    stream: MediaStream;
    ctx: AudioContext;
    source: MediaStreamAudioSourceNode;
  }> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        // NS/AEC often zeros the second capture while Web Speech holds the mic.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });
    for (const track of stream.getAudioTracks()) {
      track.enabled = true;
    }
    // Don't force 16 kHz — browsers ignore it and lie; we resample on export.
    const ctx = new AudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }
    captureSampleRateRef.current = ctx.sampleRate || 16_000;
    const source = ctx.createMediaStreamSource(stream);
    return { stream, ctx, source };
  }

  function attachPcmRecorder(ctx: AudioContext, source: MediaStreamAudioSourceNode): void {
    captureSampleRateRef.current = ctx.sampleRate || 16_000;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    chunksRef.current = [];
    processor.onaudioprocess = (event) => {
      if (!micLiveRef.current) {
        micLiveRef.current = true;
        const now = nowMs();
        voiceStartedAtRef.current = now;
        lastSpeechAtRef.current = now;
        setConnecting(false);
        setJustReady(true);
        playMicReadyChime();
        window.setTimeout(() => setJustReady(false), 1_600);
      }
      // Copy immediately — getChannelData reuses the same backing store.
      const input = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      chunksRef.current.push(copy);
      // Bound memory / encode cost while armed.
      if (chunksRef.current.length % 12 === 0) {
        pruneChunkBuffer(VOICE_KEEP_CHUNKS_SEC);
      }
    };
    source.connect(processor);
    const mute = ctx.createGain();
    // Exactly 0 can stall some Chromium graphs; keep the node audible to the graph only.
    mute.gain.value = 0.00001;
    processor.connect(mute);
    mute.connect(ctx.destination);
    recRef.current = processor;
    startMeter(ctx, source);
  }

  async function ensureWhisperReady(): Promise<boolean> {
    if (whisperReadyCacheRef.current === true) return true;
    try {
      const status = await window.office.getAsrSetupStatus();
      whisperReadyCacheRef.current = status.ready;
      if (status.ready) {
        setReadyToRetry(false);
        return true;
      }
    } catch {
      whisperReadyCacheRef.current = false;
    }
    setReadyToRetry(false);
    setInstallOpen(true);
    return false;
  }

  function openWhisperInstallFromError(err: unknown): boolean {
    const raw = err instanceof Error ? err.message : String(err);
    if (!/ERR_ASR_BINARY|ERR_ASR_MODEL/.test(raw)) return false;
    whisperReadyCacheRef.current = false;
    setReadyToRetry(false);
    setInstallOpen(true);
    return true;
  }

  function cleanupMicGraph(): void {
    try {
      recRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    audioCtxRef.current?.close().catch(() => undefined);
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    recRef.current = null;
    audioCtxRef.current = null;
    mediaRef.current = null;
  }

  async function startLocalWhisperCapture(): Promise<void> {
    stoppingRef.current = false;
    armedRef.current = true;
    micLiveRef.current = false;
    setArmed(true);
    clearLiveWhisper();
    setConnecting(true);
    setJustReady(false);
    onError(null);
    onArm?.();

    const readyPromise =
      whisperReadyCacheRef.current === true ? Promise.resolve(true) : ensureWhisperReady();

    try {
      const [ready, mic] = await Promise.all([readyPromise, openMicStream()]);
      if (!ready) {
        armedRef.current = false;
        setArmed(false);
        clearLiveWhisper();
        setConnecting(false);
        mic.stream.getTracks().forEach((track) => track.stop());
        void mic.ctx.close().catch(() => undefined);
        return;
      }
      if (stoppingRef.current || !armedRef.current) {
        setConnecting(false);
        mic.stream.getTracks().forEach((track) => track.stop());
        void mic.ctx.close().catch(() => undefined);
        return;
      }
      mediaRef.current = mic.stream;
      audioCtxRef.current = mic.ctx;
      attachPcmRecorder(mic.ctx, mic.source);
      // No live interim: each Whisper CLI call reloads the model (~0.5–1s+).
      whisperReadyCacheRef.current = true;
    } catch (err) {
      armedRef.current = false;
      setArmed(false);
      clearLiveWhisper();
      setConnecting(false);
      setJustReady(false);
      cleanupMicGraph();
      if (openWhisperInstallFromError(err)) return;
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  const start = useCallback(async (): Promise<void> => {
    if (busy || finalizing || armedRef.current || installOpen) return;
    if (blocked) {
      onError(t("voice.cpuBlocked"));
      return;
    }
    onError(null);
    await startLocalWhisperCapture();
    // The capture closure is recreated each render; the deps that matter are
    // the gates above, and the audio path reads everything else off refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, finalizing, installOpen, blocked, onError, t]);


  const stop = useCallback(async (): Promise<void> => {
    if (!armedRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    armedRef.current = false;
    setArmed(false);
    setConnecting(false);
    setJustReady(false);
    micLiveRef.current = false;
    stopMeter();
    clearLiveWhisper();

    const merged = mergeChunksSnapshot(VOICE_FINAL_WINDOW_SEC);
    chunksRef.current = [];
    cleanupMicGraph();

    const minSamples = captureMinSamples(0.35);

    try {
      if (merged.length < minSamples) {
        onError(t("voice.tooShort"));
        return;
      }

      if (pcmRms(merged) < VOICE_PCM_MIN_RMS) {
        onError(t("voice.noSpeech"));
        return;
      }

      setFinalizing(true);
      try {
        const asr = await window.office.voiceTranscribePcm({
          pcmBase64: pcm16kBase64FromCapture(merged),
          language: locale === "en" ? "en" : "ko",
        });
        const textOut = asr.text.trim();
        if (!textOut) {
          onError(t("voice.emptyAsr"));
          return;
        }
        await onTranscript(textOut);
      } catch (err) {
        if (openWhisperInstallFromError(err)) return;
        const raw = err instanceof Error ? err.message : String(err);
        if (/ERR_ASR_NO_SPEECH/.test(raw)) {
          onError(t("voice.noSpeech"));
        } else {
          onError(asrErrorMessage(t, err));
        }
      }
    } finally {
      cleanupMicGraph();
      stoppingRef.current = false;
      setFinalizing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, onError, onTranscript, t]);

  stopRef.current = () => {
    void stop();
  };

  /** Drop the mic without transcribing: a wipe or a new session, not a send. */
  const abandon = useCallback((): void => {
    if (!armedRef.current) return;
    stoppingRef.current = true;
    armedRef.current = false;
    stopMeter();
    clearLiveWhisper();
    setArmed(false);
    cleanupMicGraph();
    chunksRef.current = [];
    stoppingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markInstalled = useCallback((): void => {
    whisperReadyCacheRef.current = true;
    setReadyToRetry(true);
  }, []);

  const closeInstall = useCallback((): void => {
    setInstallOpen(false);
  }, []);

  return {
    armed,
    blocked,
    connecting,
    justReady,
    finalizing,
    liveWhisper,
    levels,
    installOpen,
    closeInstall,
    readyToRetry,
    markInstalled,
    start,
    stop,
    armedRef,
    abandon,
  };
}
