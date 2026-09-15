/** Memory-capacity axis — existing pack / model selection. Do not rename. */
export type MemTier = "T4" | "T8" | "T16";

/**
 * Execution / speed axis — which llama.cpp compute backend is active.
 * Independent from MemTier. Do not conflate with Android T0/T1/T2.
 */
export type ExecTier = "cpu" | "vulkan" | "metal" | "cuda";

export type BenchWorkloadId = "a_short_extract" | "b_long_extract" | "c_prose_gen" | "d_extract_prompt_ab";

export type BenchPromptVariant = "gbnf_only" | "fields_in_prompt";

export type FieldErrorClass = "value_wrong" | "miss" | "hallucination" | "ok";

export interface BenchHwProbe {
  os: string;
  osRelease: string;
  arch: string;
  cpuModel: string;
  physicalCores: number;
  logicalCores: number;
  totalRamMb: number;
  /** Best-effort; null when unknown. */
  memoryChannelsEstimate: number | null;
  avx2: boolean | null;
  avx512: boolean | null;
  vnni: boolean | null;
  igpuName: string | null;
  dgpuName: string | null;
  activeBackend: string | false | null;
  memTier: MemTier;
  execTierRequested: ExecTier;
}

export interface BenchPhaseTimings {
  modelLoadMs: number;
  modelLoadCold: boolean;
  /**
   * Null since the move to llama-server: grammar construction and tokenization
   * happen inside the server as part of task setup and are not separately
   * observable from here. Left in the record so older JSONL stays readable.
   */
  grammarMs: number | null;
  tokenizeMs: number | null;
  /** Time to first generated token (prefill + first decode step). */
  ttftMs: number;
  /**
   * Estimated prefill: ttftMs - mean per-token decode after first token.
   * Null when fewer than 2 output tokens.
   */
  prefillMs: number | null;
  decodeMs: number;
  adapterMs: number;
  totalMs: number;
  promptTokens: number;
  outputTokens: number;
  prefillTokPerSec: number | null;
  decodeTokPerSec: number | null;
  /** Always false until Phase 2 prefix cache exists. */
  cacheHit: boolean;
}

export interface BenchSweepConfig {
  threads: number;
  useMmap: boolean;
  kvCache: "default" | "q8";
}

export interface BenchFieldScore {
  path: string;
  gold: unknown;
  predicted: unknown;
  classification: FieldErrorClass;
}

export interface BenchRecord {
  schemaVersion: 1;
  recordedAt: string;
  runId: string;
  workload: BenchWorkloadId;
  promptVariant?: BenchPromptVariant;
  memTier: MemTier;
  execTier: ExecTier;
  modelId: string;
  modelPath: string;
  sweep: BenchSweepConfig;
  hw: BenchHwProbe;
  phases: BenchPhaseTimings;
  /** Workload (d) only. */
  fieldScores?: BenchFieldScore[];
  error?: string;
}

export interface InferenceEngineOptions {
  /** `auto` follows GpuPreference / getLlama backend detection. */
  execTier: ExecTier | "auto";
  /** Passed to getLlama maxThreads and context threads hint. */
  threads: number;
  useMmap: boolean;
  kvCache: "default" | "q8";
}
