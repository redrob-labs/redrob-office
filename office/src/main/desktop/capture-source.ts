/**
 * Map a desktopCapturer screen source to an Electron Display.
 *
 * Windows often leaves `display_id` empty (or only fills it for DirectX).
 * Falling back to sources[0] always grabs the wrong monitor on a dual setup —
 * and two identical 16:9 monitors also defeat a pure aspect-ratio tie-break.
 */

export type CapturerSourceLike = {
  id: string;
  name: string;
  display_id: string;
  thumbnail: {
    isEmpty: () => boolean;
    getSize: () => { width: number; height: number };
  };
};

export type DisplayLike = {
  id: number;
  width: number;
  height: number;
  /** Electron scaleFactor; used for physical-size matching. */
  scaleFactor?: number;
  /** Index in getAllDisplays() order — last resort when sizes/aspects tie. */
  index?: number;
};

/** Prefer display_id, else the ZZ in `screen:ZZ:0`. */
export function sourceDisplayKey(source: CapturerSourceLike): string {
  if (source.display_id) return source.display_id;
  const match = /^screen:(\d+)/i.exec(source.id);
  return match?.[1] ?? "";
}

function screenOrdinal(source: CapturerSourceLike): number {
  const match = /^screen:(\d+)/i.exec(source.id);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number.parseInt(match[1] ?? "999999", 10);
}

function sizeScore(
  source: CapturerSourceLike,
  display: DisplayLike,
): number {
  const size = source.thumbnail.getSize();
  const scale = display.scaleFactor ?? 1;
  const physW = Math.max(1, Math.round(display.width * scale));
  const physH = Math.max(1, Math.round(display.height * scale));
  const scorePhys =
    Math.abs(size.width - physW) + Math.abs(size.height - physH);
  const scoreDip =
    Math.abs(size.width - display.width) +
    Math.abs(size.height - display.height);
  return Math.min(scorePhys, scoreDip);
}

function aspectDelta(source: CapturerSourceLike, display: DisplayLike): number {
  const size = source.thumbnail.getSize();
  const want = display.width / Math.max(1, display.height);
  const got = size.width / Math.max(1, size.height);
  return Math.abs(got - want);
}

/**
 * Assign each display a distinct capturer source (bijection when possible).
 * Independent per-display picks can all choose sources[0] on identical monitors.
 */
export function assignCapturerSources<T extends CapturerSourceLike>(
  sources: readonly T[],
  displays: readonly DisplayLike[],
): Array<{ display: DisplayLike; source: T | null }> {
  const usable = sources.filter((source) => !source.thumbnail.isEmpty());
  const claimed = new Set<string>();
  const byDisplay = new Map<number, T | null>();
  for (const display of displays) byDisplay.set(display.id, null);

  const unassigned = (): DisplayLike[] =>
    displays.filter((display) => byDisplay.get(display.id) == null);
  const free = (): T[] =>
    usable.filter((source) => !claimed.has(source.id));

  const claim = (display: DisplayLike, source: T): void => {
    claimed.add(source.id);
    byDisplay.set(display.id, source);
  };

  // 1. display_id / screen:ZZ
  for (const display of displays) {
    const want = String(display.id);
    const hit = free().find(
      (source) => sourceDisplayKey(source) === want,
    );
    if (hit) claim(display, hit);
  }

  // 2. Unique closest physical/DIP size (skip when two sources tie)
  for (const display of unassigned()) {
    let best: T | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let tied = false;
    for (const source of free()) {
      const score = sizeScore(source, display);
      if (score < bestScore) {
        bestScore = score;
        best = source;
        tied = false;
      } else if (score === bestScore) {
        tied = true;
      }
    }
    const threshold =
      Math.max(
        display.width * (display.scaleFactor ?? 1),
        display.height * (display.scaleFactor ?? 1),
        display.width,
        display.height,
      ) * 0.25;
    if (best && !tied && bestScore <= threshold) claim(display, best);
  }

  // 3. Unique closest aspect (skip ties — identical dual monitors)
  for (const display of unassigned()) {
    let best: T | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    let tied = false;
    for (const source of free()) {
      const delta = aspectDelta(source, display);
      if (delta < bestDelta - 1e-6) {
        bestDelta = delta;
        best = source;
        tied = false;
      } else if (Math.abs(delta - bestDelta) <= 1e-6) {
        tied = true;
      }
    }
    if (best && !tied) claim(display, best);
  }

  // 4. Same count left → zip by display index / screen ordinal
  const leftDisplays = unassigned()
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const leftSources = free()
    .slice()
    .sort((a, b) => screenOrdinal(a) - screenOrdinal(b));
  if (
    leftDisplays.length > 0 &&
    leftDisplays.length === leftSources.length
  ) {
    for (let i = 0; i < leftDisplays.length; i++) {
      claim(leftDisplays[i]!, leftSources[i]!);
    }
  } else {
    // 5. Greedy aspect among leftovers (claim so nothing is duplicated)
    for (const display of unassigned()) {
      let best: T | null = null;
      let bestDelta = Number.POSITIVE_INFINITY;
      for (const source of free()) {
        const delta = aspectDelta(source, display);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = source;
        }
      }
      if (best) claim(display, best);
    }
  }

  return displays.map((display) => ({
    display,
    source: byDisplay.get(display.id) ?? null,
  }));
}

export function pickCapturerSource<T extends CapturerSourceLike>(
  sources: readonly T[],
  display: DisplayLike,
  allDisplays?: readonly DisplayLike[],
): T | null {
  const pool =
    allDisplays && allDisplays.length > 0 ? allDisplays : [display];
  const assigned = assignCapturerSources(sources, pool);
  return (
    assigned.find((row) => row.display.id === display.id)?.source ?? null
  );
}
