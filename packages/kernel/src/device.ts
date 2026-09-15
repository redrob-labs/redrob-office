import os from "node:os";
import si from "systeminformation";

import { detectGpuInfo } from "./gpu-detect.js";
import { tierFromTotalRamMb } from "./tier.js";
import type { DeviceProfile } from "./types.js";

export interface ElectronMemoryInfo {
  total: number;
  free: number;
}

export interface DetectDeviceProfileOptions {
  /** Electron's process.getSystemMemoryInfo, whose values are KiB. */
  getSystemMemoryInfo?: () => ElectronMemoryInfo;
  /** Per-probe timeout in ms (default 4000). */
  timeoutMs?: number;
}

function supportedPlatform(platform: NodeJS.Platform): DeviceProfile["platform"] {
  if (platform === "darwin" || platform === "win32" || platform === "linux") {
    return platform;
  }
  throw new Error(`Unsupported platform for device profiling: ${platform}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Device probe timed out: ${label}`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function normalizeTempC(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function readRamMb(getSystemMemoryInfo?: () => ElectronMemoryInfo): {
  totalRamMb: number;
  freeRamMb: number;
} {
  const electronMemory = getSystemMemoryInfo?.();
  if (electronMemory !== undefined) {
    return {
      // Electron reports KiB.
      totalRamMb: Math.floor((electronMemory.total * 1024) / 1_000_000),
      freeRamMb: Math.floor((electronMemory.free * 1024) / 1_000_000),
    };
  }
  // node:os is sync and avoids systeminformation WMI hangs on Windows.
  return {
    totalRamMb: Math.floor(os.totalmem() / 1_000_000),
    freeRamMb: Math.floor(os.freemem() / 1_000_000),
  };
}

export async function detectDeviceProfile(
  options: DetectDeviceProfileOptions = {},
): Promise<DeviceProfile> {
  const timeoutMs = options.timeoutMs ?? 4_000;
  const { totalRamMb, freeRamMb } = readRamMb(options.getSystemMemoryInfo);

  const [cpu, temperature, gpuInfo] = await Promise.all([
    withTimeout(si.cpu(), timeoutMs, "cpu").catch(() => null),
    // Windows often returns empty/stale ACPI zone temps — never block the profile.
    withTimeout(si.cpuTemperature(), timeoutMs, "cpuTemperature").catch(() => ({
      main: -1,
      max: -1,
      cores: [] as number[],
    })),
    // OS-aware: nvidia-smi (Win/Linux), system_profiler (macOS), si.graphics fallback.
    detectGpuInfo(timeoutMs),
  ]);

  const cpus = os.cpus();
  const platform = supportedPlatform(process.platform);
  const cpuTempC =
    normalizeTempC(temperature.main) ?? normalizeTempC(temperature.max) ?? null;

  return {
    tier: tierFromTotalRamMb(totalRamMb),
    totalRamMb,
    freeRamMb,
    cpuModel: cpu?.brand || cpu?.manufacturer || cpus[0]?.model || "Unknown CPU",
    cpuCores: cpu?.cores || cpus.length || 1,
    cpuTempC,
    gpu: gpuInfo
      ? { vendor: gpuInfo.vendor, renderer: gpuInfo.renderer }
      : null,
    hasUnifiedMemory: platform === "darwin",
    platform,
  };
}
