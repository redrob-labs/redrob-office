export type Tier = "T4" | "T8" | "T16";

export interface DeviceProfile {
  tier: Tier;
  totalRamMb: number;
  freeRamMb: number;
  cpuModel: string;
  cpuCores: number;
  /** CPU package temp °C when the OS exposes it; null if unavailable. */
  cpuTempC: number | null;
  gpu: { vendor: string; renderer: string } | null;
  hasUnifiedMemory: boolean;
  platform: "darwin" | "win32" | "linux";
}
