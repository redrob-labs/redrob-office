/**
 * Linked figures.
 *
 * A fact is one number with one source (a cell in a workbook). Files use it as
 * the value itself, as a figure derived from it, or as a sentence whose words
 * depend on which band the value falls in. Editing the source changes the
 * source file at once; every other file that uses it waits in Updates until a
 * person keeps (or declines) each change. A newer edit replaces anything still
 * open from an older edit of the same fact.
 *
 * This module is pure data and functions, so the shell, the editors and the
 * tests share one model.
 */

export type FileId = string
export type FactId = string

/** What happened to one part of one file for one update. */
export type Decision =
  /** Waiting for a person. */
  | 'open'
  /** The person took the new value. */
  | 'kept'
  /** The person kept the old value. */
  | 'undone'
  /** A newer update of the same fact took its place before anyone decided. */
  | 'replaced'
  /** The file the edit was made in: it changed at once. */
  | 'self'

/**
 * One band of the dependent sentence. Bands are ordered by value; a band
 * applies while the value is below `below`. The last band has no `below`.
 */
export interface SentenceBand {
  below?: number
  words: string
}

export interface FactSource {
  file: FileId
  /** Where in the source file, e.g. `Summary!C2`. */
  ref: string
}

/** How a value reads, e.g. `{ prefix: '₩', suffix: 'bn', decimals: 2 }` for ₩3.86bn. */
export interface FactDisplay {
  prefix?: string
  suffix?: string
  decimals?: number
}

export interface FactDef {
  id: FactId
  label: string
  source: FactSource
  bands?: SentenceBand[]
  display?: FactDisplay
}

export type FactUseKind = 'value' | 'derived' | 'sentence'

export interface FactUse {
  fact: FactId
  kind: FactUseKind
  /** Where in the file, e.g. `Paragraph 2` or `Slide 4, headline`. */
  where: string
}

export interface FileDecision {
  figures: Decision
  /** Null when the file has no dependent sentence or the band did not move. */
  sentence: Decision | null
}

export interface FactUpdate {
  id: string
  fact: FactId
  from: number
  to: number
  by: string
  /** ISO 8601 time of the edit. */
  at: string
  /** The file the edit was made in. */
  where: FileId
  files: Record<FileId, FileDecision>
}

export interface FactsState {
  version: 1
  facts: Record<FactId, FactDef>
  /** The current source value of each fact. */
  values: Record<FactId, number>
  /** Which facts each file uses. */
  uses: Record<FileId, FactUse[]>
  /** The value each file currently shows, per fact. */
  kept: Record<FactId, Record<FileId, number>>
  /** The value each file's dependent sentence was written for, per fact. */
  keptWords: Record<FactId, Record<FileId, number>>
  /** Newest first. */
  updates: FactUpdate[]
}

export const FACTS_STATE_VERSION = 1 as const

/** Two values closer than this are the same value. */
const SAME = 1e-9

export function emptyFactsState(): FactsState {
  return { version: FACTS_STATE_VERSION, facts: {}, values: {}, uses: {}, kept: {}, keptWords: {}, updates: [] }
}

export function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME
}

/** The index of the band `value` falls in, or -1 when the fact has no bands. */
export function bandOf(fact: FactDef | undefined, value: number): number {
  const bands = fact?.bands
  if (!bands || bands.length === 0) return -1
  for (let i = 0; i < bands.length; i++) {
    const below = bands[i]!.below
    if (below === undefined || value < below) return i
  }
  return bands.length - 1
}

/** The dependent sentence for `value`, or null when the fact has no bands. */
export function sentenceFor(fact: FactDef | undefined, value: number): string | null {
  const i = bandOf(fact, value)
  return i < 0 ? null : fact!.bands![i]!.words
}

/** A value as the fact displays it; plain numbers keep up to 2 decimals. */
export function formatFact(fact: FactDef | undefined, value: number): string {
  const d = fact?.display
  const decimals = d?.decimals
  const n =
    decimals !== undefined && Number.isInteger(decimals) && decimals >= 0 && decimals <= 10
      ? value.toFixed(decimals)
      : String(Math.round(value * 100) / 100)
  return `${d?.prefix ?? ''}${n}${d?.suffix ?? ''}`
}

export function fileUsesFact(state: FactsState, file: FileId, fact: FactId): boolean {
  return (state.uses[file] ?? []).some((u) => u.fact === fact)
}

export function fileHasSentence(state: FactsState, file: FileId, fact: FactId): boolean {
  return (state.uses[file] ?? []).some((u) => u.fact === fact && u.kind === 'sentence')
}

/** Every file that uses `fact`, in insertion order. */
export function filesUsing(state: FactsState, fact: FactId): FileId[] {
  return Object.keys(state.uses).filter((f) => fileUsesFact(state, f, fact))
}

export type FigurePart = 'figures' | 'sentence'

export interface FigureState {
  /** The value this file keeps for this part. */
  kept: number
  /** The newest update still open for this part, if any. */
  upd: FactUpdate | null
  /** No update is open, yet the kept value no longer matches the source. */
  stale: boolean
}

/**
 * What one figure in one file shows: drives the figure's look, its card and
 * the Sources rail. Null when the file does not use the fact (or, for the
 * sentence, has no dependent sentence).
 */
export function figState(state: FactsState, fact: FactId, file: FileId, part: FigurePart = 'figures'): FigureState | null {
  const value = state.values[fact]
  if (value === undefined) return null
  const store = part === 'sentence' ? state.keptWords[fact] : state.kept[fact]
  const kept = store?.[file]
  if (kept === undefined) return null
  const upd =
    state.updates.find((u) => {
      if (u.fact !== fact) return false
      const d = u.files[file]
      return !!d && (part === 'sentence' ? d.sentence === 'open' : d.figures === 'open')
    }) ?? null
  const def = state.facts[fact]
  const stale = !upd && (part === 'sentence' ? bandOf(def, kept) !== bandOf(def, value) : !sameValue(kept, value))
  return { kept, upd, stale }
}

/** True while any update waits for a decision in `file`. */
export function pending(state: FactsState, file: FileId): boolean {
  return state.updates.some((u) => {
    const d = u.files[file]
    return !!d && (d.figures === 'open' || d.sentence === 'open')
  })
}

/** Files with at least one decision waiting, in the order they were first used. */
export function waitingFiles(state: FactsState): FileId[] {
  return Object.keys(state.uses).filter((f) => pending(state, f))
}

/** Updates with at least one open decision, newest first. */
export function openUpdates(state: FactsState): FactUpdate[] {
  return state.updates.filter((u) => Object.values(u.files).some((d) => d.figures === 'open' || d.sentence === 'open'))
}
