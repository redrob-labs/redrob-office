/**
 * Chart scale and palette helpers.
 *
 * The series palette is six tokens, `--series-1` through `--series-6`. The literals below are the fallback
 * for a consumer who loads the components without the token sheet.
 *
 * They are literals on purpose. They duplicated named palette tokens for a while WITHOUT reading them,
 * which meant changing `accent-orange-4` in tokens.json left the chart on the old value with nothing to
 * catch it. Reading the token first and falling back second makes the token authoritative.
 */

/**
 * Six colours, validated together: inside the lightness band, above the chroma floor, worst adjacent
 * colour-vision separation 8.6 light and 11.5 dark, both above the floor of 8.
 *
 * The order is fixed. A seventh series folds into "Other" or becomes small multiples; it never gets a
 * generated hue, because a generated seventh breaks the validation the other six passed.
 */
export const SERIES_LIGHT = ['#2B52FF', '#AE5100', '#8944FF', '#00864A', '#A31310', '#D2A100'];
export const SERIES_DARK = ['#2E56F0', '#E17223', '#844BEF', '#239B5B', '#AD251E', '#B08922'];

export function cssVar(name: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return '';
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return '';
  }
}

export function isDark(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement;
  return (el && el.getAttribute('data-theme')) === 'dark';
}

/** The token if the sheet is loaded, the validated literal otherwise. */
export function seriesColor(i: number): string {
  const token = cssVar(`--series-${(i % 6) + 1}`);
  if (token) return token;
  const p = isDark() ? SERIES_DARK : SERIES_LIGHT;
  return p[i % p.length];
}

/**
 * A round number at or above the data's maximum, so the top gridline is readable.
 *
 * 1, 1.5, 2, 3, 5, 7.5, 10 times a power of ten. An axis topping out at 8,347 tells a reader less than one
 * topping out at 10,000.
 */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10;
  return step * mag;
}
