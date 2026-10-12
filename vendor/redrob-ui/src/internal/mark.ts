/** The accent families a generated mark can land in. Nine, one per accent scale. */
export const MARK_FAMILIES = [
  'teal',
  'sky',
  'violet',
  'pink',
  'red',
  'orange',
  'yellow',
  'lime',
  'green',
] as const;

/** 40 × tan 40° - the run of the rake across a 40px tile. */
export const MARK_RUN = 33.56;

/**
 * ONE threshold, in the same place on every mark, with the same three faces behind it.
 *
 * The seam is the brand, not a per-person variable. A set of avatars whose diagonals sit at different
 * heights reads as a rendering bug rather than a family, so only the colour family varies.
 */
export const MARK_SEAM = 19;
export const MARK_FACES = 3;

export const MARK_CJK = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]/;

/** FNV-1a. Small, stable, and the same name always lands on the same family. */
export function markHash(v: unknown): number {
  const s = String(v == null ? '' : v);
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) {
    n ^= s.charCodeAt(i);
    n = (n * 16777619) >>> 0;
  }
  return n >>> 0;
}

/**
 * Initials from a name.
 *
 * A Hangul name is one family syllable, not two letters: 김철수 is 김. Taking two gave 김철, which reads
 * as a different name - it borrows half the given name and presents it as the family one.
 */
export function initials(name?: string): string {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/);
  if (/^[\uAC00-\uD7AF]/.test(parts[0])) return parts[0].charAt(0);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Initials for a mark. Latin takes two, CJK one.
 *
 * Two Hangul syllables are a full em each, so the pair runs nearly twice as wide as two Latin caps and
 * would cross the seam.
 */
export function markInitials(name?: string): string {
  if (!name) return '';
  const t = String(name).trim();
  if (MARK_CJK.test(t)) return t.replace(/\s+/g, '').slice(0, 1);
  return initials(t);
}

/** An SVG path through a series, scaled to the box. Butt caps and miter joins, like every chart mark. */
export function sparkPath(values: number[], w: number, hgt: number): string {
  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? w / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = hgt - ((v - min) / span) * hgt;
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
