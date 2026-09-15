import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { MODEL_ARTIFACTS } from "../models.js";
import { defaultModelsDir } from "../paths.js";
import { TIERS } from "../tiers.js";
import { ensureModel } from "../weights/resolve.js";
import { schemaFieldsToGbnf } from "../gbnf.js";
import { scoreFields } from "./accuracy.js";
import { defaultBenchThreads, probeBenchHardware, threadSweepValues } from "./probe.js";
import { timedConstrainedGenerate } from "./timed-generate.js";
import type {
  BenchRecord,
  BenchSweepConfig,
  BenchWorkloadId,
  ExecTier,
  InferenceEngineOptions,
  MemTier,
} from "./types.js";
import {
  EXTRACT_GOLD,
  EXTRACT_SCHEMA_FIELDS,
  extractPrompt,
  JD_GRAMMAR,
  PROSE_JD_PROMPT,
  workloadDocument,
} from "./workloads.js";

function pointerToObjectKey(path: string): string {
  return path.replace(/^\//, "");
}

function predictedFromJson(json: unknown): Record<string, unknown> {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return {};
  const obj = json as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of EXTRACT_SCHEMA_FIELDS) {
    const key = pointerToObjectKey(field.path);
    if (key in obj) out[field.path] = obj[key];
  }
  return out;
}

async function appendJsonl(path: string, record: BenchRecord): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

function resolveExecTiers(requested: ExecTier[] | undefined, platform: NodeJS.Platform): ExecTier[] {
  if (requested && requested.length > 0) return requested;
  if (platform === "darwin") return ["cpu", "metal"];
  if (platform === "win32" || platform === "linux") return ["cpu", "vulkan"];
  return ["cpu"];
}

function extractGrammar(): string {
  return schemaFieldsToGbnf(
    EXTRACT_SCHEMA_FIELDS.map((field) => ({
      path: field.path,
      type: field.type,
      required: field.required,
    })),
  );
}

export interface RunBenchOptions {
  outPath: string;
  modelsDir?: string;
  memTier: MemTier;
  execTiers?: ExecTier[];
  workloads?: BenchWorkloadId[];
  /** When set, only these sweeps run (otherwise full Phase 0 matrix). */
  sweeps?: BenchSweepConfig[];
  maxTokensExtract?: number;
  maxTokensProse?: number;
}

export async function runBench(options: RunBenchOptions): Promise<{
  outPath: string;
  records: BenchRecord[];
  prefillShareMean: number | null;
  recommendNextPhase: "phase1_backend" | "phase2_prefix_cache" | "insufficient_data";
}> {
  const modelsDir = options.modelsDir ?? process.env.REDROB_MODELS_DIR ?? defaultModelsDir();
  process.env.REDROB_MODELS_DIR = modelsDir;
  process.env.REDROB_PACK_TIER = options.memTier;

  const modelId = TIERS[options.memTier].text;
  const artifact = MODEL_ARTIFACTS[modelId];
  if (!artifact) throw new Error(`No text model for ${options.memTier}`);
  const modelPath = await ensureModel(artifact, modelsDir);

  const hwProbeSeed = await probeBenchHardware({
    execTierRequested: "cpu",
    activeBackend: null,
  });
  const execTiers = resolveExecTiers(options.execTiers, process.platform);
  const workloads: BenchWorkloadId[] = options.workloads ?? [
    "a_short_extract",
    "b_long_extract",
    "c_prose_gen",
    "d_extract_prompt_ab",
  ];

  const sweeps: BenchSweepConfig[] =
    options.sweeps ??
    (() => {
      const threads = threadSweepValues(hwProbeSeed.physicalCores);
      const configs: BenchSweepConfig[] = [];
      for (const thread of threads) {
        for (const useMmap of [true, false]) {
          for (const kvCache of ["default", "q8"] as const) {
            configs.push({ threads: thread, useMmap, kvCache });
          }
        }
      }
      return configs;
    })();

  const grammarExtract = extractGrammar();
  const records: BenchRecord[] = [];
  const prefillShares: number[] = [];

  for (const execTier of execTiers) {
    for (const sweep of sweeps) {
      const engine: InferenceEngineOptions = {
        execTier,
        threads: sweep.threads > 0 ? sweep.threads : defaultBenchThreads(hwProbeSeed.physicalCores),
        useMmap: sweep.useMmap,
        kvCache: sweep.kvCache,
      };

      for (const workload of workloads) {
        const runOnce = async (
          prompt: string,
          grammar: string,
          maxTokens: number,
          extra: Partial<BenchRecord>,
          forceCold: boolean,
        ): Promise<void> => {
          const runId = randomUUID();
          try {
            const result = await timedConstrainedGenerate({
              modelPath,
              prompt,
              grammar,
              maxTokens,
              engine,
              forceColdLoad: forceCold,
            });
            const hw = await probeBenchHardware({
              execTierRequested: execTier,
              activeBackend: result.activeBackend,
            });
            const phases = result.phases;
            if (phases.prefillMs !== null && phases.totalMs > 0) {
              prefillShares.push(phases.prefillMs / phases.totalMs);
            }
            const record: BenchRecord = {
              schemaVersion: 1,
              recordedAt: new Date().toISOString(),
              runId,
              workload,
              memTier: options.memTier,
              execTier,
              modelId,
              modelPath,
              sweep: { ...sweep, threads: engine.threads },
              hw: { ...hw, memTier: options.memTier },
              phases,
              ...extra,
            };
            if (workload === "d_extract_prompt_ab" && extra.promptVariant) {
              const predicted = predictedFromJson(result.json);
              record.fieldScores = scoreFields(EXTRACT_GOLD, predicted);
            }
            await appendJsonl(options.outPath, record);
            records.push(record);
          } catch (error) {
            const hw = await probeBenchHardware({
              execTierRequested: execTier,
              activeBackend: null,
            });
            const record: BenchRecord = {
              schemaVersion: 1,
              recordedAt: new Date().toISOString(),
              runId,
              workload,
              memTier: options.memTier,
              execTier,
              modelId,
              modelPath,
              sweep: { ...sweep, threads: engine.threads },
              hw: { ...hw, memTier: options.memTier },
              phases: {
                modelLoadMs: 0,
                modelLoadCold: forceCold,
                grammarMs: 0,
                tokenizeMs: 0,
                ttftMs: 0,
                prefillMs: null,
                decodeMs: 0,
                adapterMs: 0,
                totalMs: 0,
                promptTokens: 0,
                outputTokens: 0,
                prefillTokPerSec: null,
                decodeTokPerSec: null,
                cacheHit: false,
              },
              error: error instanceof Error ? error.message : String(error),
              ...extra,
            };
            await appendJsonl(options.outPath, record);
            records.push(record);
          }
        };

        if (workload === "c_prose_gen") {
          await runOnce(
            PROSE_JD_PROMPT,
            JD_GRAMMAR,
            options.maxTokensProse ?? 512,
            {},
            true,
          );
          await runOnce(
            PROSE_JD_PROMPT,
            JD_GRAMMAR,
            options.maxTokensProse ?? 512,
            {},
            false,
          );
          continue;
        }

        if (workload === "d_extract_prompt_ab") {
          const doc = workloadDocument("a_short_extract");
          for (const variant of ["gbnf_only", "fields_in_prompt"] as const) {
            await runOnce(
              extractPrompt(doc, variant),
              grammarExtract,
              options.maxTokensExtract ?? 256,
              { promptVariant: variant },
              variant === "gbnf_only",
            );
          }
          continue;
        }

        const doc = workloadDocument(workload);
        await runOnce(
          extractPrompt(doc, "gbnf_only"),
          grammarExtract,
          options.maxTokensExtract ?? (workload === "b_long_extract" ? 384 : 256),
          {},
          true,
        );
        await runOnce(
          extractPrompt(doc, "gbnf_only"),
          grammarExtract,
          options.maxTokensExtract ?? (workload === "b_long_extract" ? 384 : 256),
          {},
          false,
        );
      }
    }
  }

  const prefillShareMean =
    prefillShares.length === 0
      ? null
      : prefillShares.reduce((sum, value) => sum + value, 0) / prefillShares.length;

  let recommendNextPhase: "phase1_backend" | "phase2_prefix_cache" | "insufficient_data" =
    "insufficient_data";
  if (prefillShareMean !== null) {
    recommendNextPhase =
      prefillShareMean >= 0.4 ? "phase2_prefix_cache" : "phase1_backend";
  }

  return { outPath: options.outPath, records, prefillShareMean, recommendNextPhase };
}

export function defaultBenchOutPath(): string {
  return join(process.cwd(), "bench-results", `inference-${new Date().toISOString().replaceAll(":", "")}.jsonl`);
}
