/**
 * Linked figures as any editor places them: what a figure should read in a
 * file, which figures need rewriting, and the commands that make the shell's
 * index say exactly what a saved file contains. Each editor finds its own
 * figures (a DOCX field, a PPTX text field, a Markdown link) and hands them
 * here as plain records.
 */
import type { FactsCommand } from './ipc'
import { figState, formatFact, sentenceFor, type FactsState, type FactUse, type FigurePart } from './model'

/** One figure in a file. */
export interface PlacedFigure {
  fact: string
  part: FigurePart
  /** where a person finds it, e.g. "Paragraph 3" or "Slide 2" */
  where: string
  /** what it reads now */
  text: string
}

/** Fact ids are limited so they are safe in field names, link targets and CSS selectors. */
export const FACT_ID_RE = /^[A-Za-z0-9_-]{1,120}$/
export const isFactId = (id: unknown): id is string => typeof id === 'string' && FACT_ID_RE.test(id)

/**
 * A figure's field name, the same in DOCX (DOCVARIABLE) and PPTX (<a:fld type>):
 * RedrobFact_<id> for the value, RedrobFactWords_<id> for its sentence.
 */
export function figureFieldName(fact: string, part: FigurePart): string {
  return `${part === 'sentence' ? 'RedrobFactWords_' : 'RedrobFact_'}${fact}`
}

/** The fact and part a field name names, or null for any other field. */
export function parseFigureField(name: unknown): { fact: string; part: FigurePart } | null {
  if (typeof name !== 'string') return null
  const m = /^RedrobFact(Words)?_([A-Za-z0-9_-]{1,120})$/.exec(name)
  return m ? { fact: m[2]!, part: m[1] ? 'sentence' : 'figures' } : null
}

/** What a figure should read in this file, or null when the index has no say. */
export function keptText(state: FactsState, file: string, fact: string, part: FigurePart): string | null {
  const s = figState(state, fact, file, part)
  if (!s) return null
  const def = state.facts[fact]
  return part === 'sentence' ? sentenceFor(def, s.kept) : formatFact(def, s.kept)
}

/** The text a newly inserted figure starts with: the kept value, else the source's current one. */
export function insertText(state: FactsState, file: string, fact: string, part: FigurePart): string {
  const kept = keptText(state, file, fact, part)
  if (kept !== null) return kept
  if (part === 'sentence') return sentenceFor(state.facts[fact], state.values[fact] ?? 0) ?? ''
  return formatFact(state.facts[fact], state.values[fact] ?? 0)
}

/** Figures (by their index in the list) whose text no longer matches what the file keeps. */
export function figureRewrites(state: FactsState, file: string, figures: readonly PlacedFigure[]): Array<{ index: number; text: string }> {
  const out: Array<{ index: number; text: string }> = []
  figures.forEach((f, index) => {
    const next = keptText(state, file, f.fact, f.part)
    if (next !== null && next !== f.text) out.push({ index, text: next })
  })
  return out
}

/** The facts a figure picker offers, formatted for display. */
export function factChoices(
  state: FactsState | null,
): Array<{ id: string; label: string; value: string; source: string; hasSentence: boolean }> {
  if (!state) return []
  const base = (p: string) => p.split(/[\\/]/).pop() ?? p
  return Object.values(state.facts).map((f) => ({
    id: f.id,
    label: f.label,
    value: formatFact(f, state.values[f.id] ?? 0),
    source: `${base(f.source.file)}, ${f.source.ref}`,
    hasSentence: !!f.bands?.length,
  }))
}

export function placedUse(f: PlacedFigure): FactUse {
  return { fact: f.fact, kind: f.part === 'sentence' ? 'sentence' : 'value', where: f.where }
}

/**
 * The commands that make the index say exactly what the file contains: a use
 * for every figure, and a drop for every recorded use the file no longer has.
 * Facts the index does not know are skipped (a figure from another computer),
 * and the source file's own cell is never dropped.
 */
export function syncUses(state: FactsState, file: string, figures: readonly PlacedFigure[]): FactsCommand[] {
  const key = (u: FactUse) => `${u.fact}|${u.kind}|${u.where}`
  const want = new Map<string, FactUse>()
  for (const f of figures) {
    if (!(f.fact in state.values)) continue
    const use = placedUse(f)
    want.set(key(use), use)
  }
  const have = state.uses[file] ?? []
  const haveKeys = new Set(have.map(key))
  const cmds: FactsCommand[] = []
  for (const u of have) {
    if (!want.has(key(u)) && state.facts[u.fact]?.source.file !== file) {
      cmds.push({ type: 'dropUse', file, fact: u.fact, where: u.where })
    }
  }
  for (const [k, use] of want) if (!haveKeys.has(k)) cmds.push({ type: 'useFact', file, use })
  return cmds
}
