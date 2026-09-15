import type { Tier } from "../types.js";

/**
 * Initial document-image policy pending per-device encoder measurements.
 * Dimensions are maximum longest edges, not performance claims.
 */
export const MAX_IMAGE_DIMENSION_BY_TIER: Record<Tier, number> = {
  T4: 1024,
  T8: 1280,
  T16: 1536,
};

export function maxImageDimensionForTier(tier: Tier): number {
  return MAX_IMAGE_DIMENSION_BY_TIER[tier];
}
