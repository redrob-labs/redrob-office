/**
 * Shared arithmetic for the insight charts (MixBar, BulletBar, BarList, CompareBar, Histogram, HeatCell,
 * Delta). Kept here rather than in each component so a percentage is rounded, and a missing value is
 * printed, the same way everywhere on one page.
 */

/** What a missing figure prints as. A hyphen, not a zero: zero is a measurement, missing is not. */
export const MISSING = '-';

/** A share 0-100 rounded to a whole percent, or `MISSING`. */
export function pct(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? MISSING : `${Math.round(v)}%`;
}

/** Position of `v` on a 0..max scale, as a CSS percentage clamped inside the track. */
export function at(v: number, max: number): string {
  const m = max > 0 ? max : 1;
  return `${Math.max(0, Math.min(100, (v / m) * 100))}%`;
}

export interface HeatBand {
  /** `na`: no comparison exists. `zero`: within noise. `pos`/`neg`: moved the good or the bad way. */
  tone: 'na' | 'zero' | 'pos' | 'neg';
  level: 0 | 1 | 2 | 3;
}

/**
 * Diverging band for a difference from a baseline, in points. Under 3 points is noise and is not shaded at
 * all; then 3-8, 8-15 and 15+ are the three steps. `up: false` flips the sense (rework going up is bad), and
 * `up: null` means there is no good direction, so nothing is shaded.
 */
export function heatBand(d: number | null | undefined, up: boolean | null = true): HeatBand {
  if (d == null || Number.isNaN(d)) return { tone: 'na', level: 0 };
  if (up === null) return { tone: 'zero', level: 0 };
  const g = up === false ? -d : d;
  const a = Math.abs(g);
  const level = a < 3 ? 0 : a < 8 ? 1 : a < 15 ? 2 : 3;
  if (level === 0) return { tone: 'zero', level: 0 };
  return { tone: g > 0 ? 'pos' : 'neg', level: level as 1 | 2 | 3 };
}

/** One step of an ordinal scale: a name, and optionally the sentence that defines it. */
export interface MixStep {
  name: string;
  text?: string;
}
