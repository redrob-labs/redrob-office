#!/usr/bin/env node
/**
 * Phase 0 inference bench — local JSONL only. No product telemetry.
 *
 *   pnpm bench -- --mem-tier T4 --exec-tier cpu --quick
 */
import { join } from "node:path";

import { runBench, defaultBenchOutPath } from "./run.js";
import type { BenchWorkloadId, ExecTier, MemTier } from "./types.js";
import { defaultBenchThreads, probeBenchHardware } from "./probe.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const memTier = (arg("--mem-tier") ?? "T4") as MemTier;
  if (memTier !== "T4" && memTier !== "T8" && memTier !== "T16") {
    throw new Error("--mem-tier must be T4|T8|T16");
  }

  const execRaw = parseList(arg("--exec-tier"));
  const execTiers = (execRaw.length > 0 ? execRaw : undefined) as ExecTier[] | undefined;
  if (execTiers) {
    for (const tier of execTiers) {
      if (tier !== "cpu" && tier !== "vulkan" && tier !== "metal" && tier !== "cuda") {
        throw new Error(`invalid --exec-tier ${tier}`);
      }
    }
  }

  const workloadRaw = parseList(arg("--workload"));
  const workloads = (workloadRaw.length > 0 ? workloadRaw : undefined) as
    | BenchWorkloadId[]
    | undefined;

  const outPath = arg("--out") ?? defaultBenchOutPath();
  const modelsDir = arg("--models-dir") ?? process.env.REDROB_MODELS_DIR;
  const quick = hasFlag("--quick");

  const hw = await probeBenchHardware({
    execTierRequested: execTiers?.[0] ?? "cpu",
    activeBackend: null,
  });

  const sweeps = quick
    ? [
        {
          threads: defaultBenchThreads(hw.physicalCores),
          useMmap: true,
          kvCache: "default" as const,
        },
      ]
    : undefined;

  process.stderr.write(
    `[bench] memTier=${memTier} exec=${(execTiers ?? ["auto"]).join(",")} physicalCores=${hw.physicalCores} out=${outPath}\n`,
  );

  const result = await runBench({
    outPath,
    ...(modelsDir ? { modelsDir } : {}),
    memTier,
    ...(execTiers ? { execTiers } : {}),
    ...(workloads ? { workloads } : {}),
    ...(sweeps ? { sweeps } : {}),
  });

  const ok = result.records.filter((record) => !record.error);
  const failed = result.records.length - ok.length;
  const meanTotal =
    ok.length === 0
      ? null
      : ok.reduce((sum, record) => sum + record.phases.totalMs, 0) / ok.length;

  process.stderr.write(
    `[bench] records=${result.records.length} ok=${ok.length} failed=${failed}\n`,
  );
  process.stderr.write(
    `[bench] meanTotalMs=${meanTotal === null ? "n/a" : meanTotal.toFixed(1)} prefillShareMean=${
      result.prefillShareMean === null ? "n/a" : (result.prefillShareMean * 100).toFixed(1) + "%"
    }\n`,
  );
  process.stderr.write(`[bench] recommendNextPhase=${result.recommendNextPhase}\n`);
  process.stderr.write(`[bench] jsonl=${join(result.outPath)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
