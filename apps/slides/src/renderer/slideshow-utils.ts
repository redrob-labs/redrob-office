/**
 * Pure logic for slide shows: playback sequence computation + rehearsal timing accumulation.
 * Extracted from SlideShowView for unit testing (no React/DOM dependency).
 */

/** Custom show: subset of slides in user-specified order (original indexes). App persists it per document to localStorage. */
export interface CustomShow {
  id: string
  name: string
  slideIndices: number[]
}

/**
 * Compute the playback sequence (array of original indexes).
 * - Default: all slides in order, skipping hidden ones (starting from a hidden slide still plays it)
 * - Non-empty customOrder: play in its order (out-of-range slides filtered; hidden slides still skipped, except the start slide)
 * - Fallback: when the result is empty, at least play the start slide
 */
export function computePlayOrder(
  slides: ReadonlyArray<{ hidden?: boolean }>,
  startAt: number,
  customOrder?: readonly number[],
): number[] {
  const playable = (i: number) => slides[i] != null && (!slides[i]!.hidden || i === startAt)
  const o =
    customOrder && customOrder.length > 0
      ? customOrder.filter(playable)
      : slides.map((_, i) => i).filter(playable)
  return o.length > 0 ? [...o] : [startAt]
}

// ── Set Up Show ──────────────────────────────────────────────────────────────────

/** The parts of Set Up Show that change how a show plays (ppt/presProps.xml, read in main). */
export interface ShowPlayback {
  /** loop until Esc (a kiosk always loops) */
  loop: boolean
  /** kiosk: clicks and keys do not advance, only saved timings (Esc still ends it) */
  kiosk: boolean
  /** saved auto-advance per slide (ms, null = on click), when the show uses timings */
  advanceMs: ReadonlyArray<number | null> | null
  /** recorded narration plays by itself */
  showNarration: boolean
}

export interface ShowSetupInput {
  type: 'speaker' | 'kiosk'
  loop: boolean
  useTimings: boolean
  showNarration: boolean
  range: { kind: 'all' } | { kind: 'slides'; from: number; to: number } | { kind: 'custom'; id: string }
}

/**
 * Where a show from Set Up Show starts and what it plays. A slide range
 * applies to a show from the beginning; a show from the current slide plays
 * the whole deck from there, as PowerPoint does. PowerPoint's own named custom
 * shows are not read here, so a range naming one plays every slide.
 */
export function showSetup(
  settings: ShowSetupInput,
  advanceMs: ReadonlyArray<number | null>,
  slides: ReadonlyArray<{ hidden?: boolean }>,
  fromStart: boolean,
  current: number,
): { startAt: number; customOrder?: number[]; playback: ShowPlayback } {
  const kiosk = settings.type === 'kiosk'
  const playback: ShowPlayback = {
    loop: kiosk || settings.loop,
    kiosk,
    advanceMs: kiosk || settings.useTimings ? advanceMs : null,
    showNarration: settings.showNarration,
  }
  const firstVisible = Math.max(0, slides.findIndex((s) => !s.hidden))
  if (!fromStart) return { startAt: current, playback }
  if (settings.range.kind === 'slides') {
    const from = Math.max(1, settings.range.from)
    const to = Math.min(slides.length, settings.range.to)
    const order: number[] = []
    for (let i = from - 1; i < to; i++) if (!slides[i]?.hidden) order.push(i)
    if (order.length > 0) return { startAt: order[0]!, customOrder: order, playback }
  }
  return { startAt: firstVisible, playback }
}

/** After the last slide: back to the first when looping, otherwise the end screen. */
export function nextPosition(pos: number, length: number, loop: boolean): number | 'end' {
  if (pos < length - 1) return pos + 1
  return loop && length > 0 ? 0 : 'end'
}

// ── Rehearsal timing ─────────────────────────────────────────────────────────────

/** Rehearsal timing state: perPageMs accumulates dwell milliseconds by original slide index. */
export interface RehearseTiming {
  perPageMs: number[]
  /** Slide currently dwelt on (original index; -1 = finished) */
  currentIndex: number
  /** Timestamp of entering the current slide (ms) */
  enteredAt: number
}

/** Start rehearsal: begin timing from startIndex. */
export function startRehearse(slideCount: number, startIndex: number, now: number): RehearseTiming {
  return {
    perPageMs: new Array(Math.max(0, slideCount)).fill(0),
    currentIndex: startIndex,
    enteredAt: now,
  }
}

/** Page turn: accumulate the current slide's dwell into perPageMs, then switch to nextIndex and restart timing (revisiting a slide keeps accumulating). */
export function switchRehearsePage(
  t: RehearseTiming,
  nextIndex: number,
  now: number,
): RehearseTiming {
  const perPageMs = t.perPageMs.slice()
  if (t.currentIndex >= 0 && t.currentIndex < perPageMs.length) {
    perPageMs[t.currentIndex]! += Math.max(0, now - t.enteredAt)
  }
  return { perPageMs, currentIndex: nextIndex, enteredAt: now }
}

/** End rehearsal: accumulate the last slide's dwell, then convert to seconds per slide (rounded; visited slides count at least 1 second). */
export function finishRehearse(t: RehearseTiming, now: number): number[] {
  const final = switchRehearsePage(t, -1, now)
  return final.perPageMs.map((ms) => (ms > 0 ? Math.max(1, Math.round(ms / 1000)) : 0))
}

/** m:ss clock display (rehearsal timer bar / save confirmation dialog). */
export function formatClock(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}
