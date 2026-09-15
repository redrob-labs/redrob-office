import si from "systeminformation";

import { tierFromTotalRamMb } from "../tier.js";
import type { ExecTier, MemTier, BenchHwProbe } from "./types.js";

function flagPresent(flags: string | string[] | undefined, name: string): boolean | null {
  if (flags === undefined) return null;
  const list = Array.isArray(flags) ? flags : flags.split(/\s+/);
  const lower = name.toLowerCase();
  return list.some((flag) => flag.toLowerCase().includes(lower));
}

/**
 * Hardware probe for bench JSONL only — not product telemetry.
 */
export async function probeBenchHardware(options: {
  execTierRequested: ExecTier;
  activeBackend?: string | false | null;
}): Promise<BenchHwProbe> {
  const [memory, cpu, graphics] = await Promise.all([si.mem(), si.cpu(), si.graphics()]);
  const totalRamMb = Math.floor(memory.total / 1_000_000);
  const memTier = tierFromTotalRamMb(totalRamMb) as MemTier;

  const controllers = graphics.controllers ?? [];
  let igpuName: string | null = null;
  let dgpuName: string | null = null;
  for (const controller of controllers) {
    const name = `${controller.vendor ?? ""} ${controller.model ?? ""}`.trim() || null;
    if (!name) continue;
    const blob = name.toLowerCase();
    const integrated =
      blob.includes("intel") ||
      blob.includes("iris") ||
      blob.includes("uhd") ||
      blob.includes("radeon graphics") ||
      blob.includes("vega") ||
      Boolean(controller.vram && controller.vram > 0 && controller.vram < 2048);
    if (integrated && !igpuName) igpuName = name;
    else if (!integrated && !dgpuName) dgpuName = name;
    else if (!igpuName) igpuName = name;
  }

  const flags = (cpu as { flags?: string | string[] }).flags;
  const physicalCores = cpu.physicalCores || Math.max(1, Math.floor((cpu.cores || 2) / 2));
  const logicalCores = cpu.cores || physicalCores;

  return {
    os: `${process.platform}`,
    osRelease: String((await si.osInfo()).release ?? ""),
    arch: process.arch,
    cpuModel: cpu.brand || cpu.manufacturer || "Unknown CPU",
    physicalCores,
    logicalCores,
    totalRamMb,
    memoryChannelsEstimate: null,
    avx2: flagPresent(flags, "avx2"),
    avx512: flagPresent(flags, "avx512"),
    vnni: flagPresent(flags, "vnni") ?? flagPresent(flags, "avx_vnni"),
    igpuName,
    dgpuName,
    activeBackend: options.activeBackend ?? null,
    memTier,
    execTierRequested: options.execTierRequested,
  };
}

/** Leave 1–2 logical cores for UI; floor at 1. Physical-core based. */
export function defaultBenchThreads(physicalCores: number): number {
  return Math.max(1, physicalCores - 1);
}

export function threadSweepValues(physicalCores: number): number[] {
  const base = defaultBenchThreads(physicalCores);
  const candidates = new Set<number>([
    Math.max(1, base - 2),
    Math.max(1, base),
    Math.max(1, Math.min(physicalCores, base + 2)),
  ]);
  return [...candidates].sort((a, b) => a - b);
}
