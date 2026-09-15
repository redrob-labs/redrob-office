import type { Tier } from "./types.js";

export function nextLowerTier(tier: Tier): Tier | null {
  switch (tier) {
    case "T16":
      return "T8";
    case "T8":
      return "T4";
    case "T4":
      return null;
  }
}
