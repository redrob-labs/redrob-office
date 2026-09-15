import type { Tier } from "./types.js";

/** Assign model tier from total system RAM (SPEC §4.1). */
export function tierFromTotalRamMb(totalRamMb: number): Tier {
  if (totalRamMb < 8_000) {
    return "T4";
  }
  if (totalRamMb < 16_000) {
    return "T8";
  }
  return "T16";
}
