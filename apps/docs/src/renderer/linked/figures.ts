/**
 * Linked figures in a Docs document: find them, say what each should read,
 * and keep the shell's index in step with what the file contains.
 * Pure functions over a ProseMirror doc and the facts state.
 */
import type { Node as PmDocNode } from '@tiptap/pm/model'
import {
  figState,
  formatFact,
  sentenceFor,
  type FactsCommand,
  type FactsState,
  type FactUse,
  type FigurePart,
  type FigureState,
} from '@genoffice/facts'

export interface DocFigure {
  fact: string
  part: FigurePart
  /** position of the atom node */
  pos: number
  text: string
  /** 1-based top-level block the figure sits in */
  paragraph: number
}

/** Every linked figure in document order. */
export function collectFigures(doc: PmDocNode): DocFigure[] {
  const out: DocFigure[] = []
  doc.forEach((block, offset, index) => {
    if (block.isLeaf) return
    block.descendants((node, pos) => {
      if (node.type.name !== 'docLinkedFigure') return true
      out.push({
        fact: String(node.attrs.fact),
        part: node.attrs.part === 'sentence' ? 'sentence' : 'figures',
        // descendants positions are relative to the block's content
        pos: offset + 1 + pos,
        text: String(node.attrs.text),
        paragraph: index + 1,
      })
      return false
    })
  })
  return out
}

/** What a figure should read in this file, or null when the index has no say. */
export function keptText(state: FactsState, file: string, fact: string, part: FigurePart): string | null {
  const s = figState(state, fact, file, part)
  if (!s) return null
  const def = state.facts[fact]
  return part === 'sentence' ? sentenceFor(def, s.kept) : formatFact(def, s.kept)
}

/** Figures whose text no longer matches what the file keeps. */
export function figureRewrites(
  state: FactsState,
  file: string,
  figures: readonly DocFigure[],
): Array<{ pos: number; text: string }> {
  const out: Array<{ pos: number; text: string }> = []
  for (const f of figures) {
    const next = keptText(state, file, f.fact, f.part)
    if (next !== null && next !== f.text) out.push({ pos: f.pos, text: next })
  }
  return out
}

export function figureUse(f: DocFigure): FactUse {
  return { fact: f.fact, kind: f.part === 'sentence' ? 'sentence' : 'value', where: `Paragraph ${f.paragraph}` }
}

/**
 * The commands that make the index say exactly what the file contains: a use
 * for every figure, and a drop for every recorded use the file no longer has.
 * Facts the index does not know are skipped (a figure from another computer).
 */
export function syncUsesCommands(state: FactsState, file: string, figures: readonly DocFigure[]): FactsCommand[] {
  const want = new Map<string, FactUse>()
  for (const f of figures) {
    if (!(f.fact in state.values)) continue
    const use = figureUse(f)
    want.set(`${use.fact}|${use.kind}|${use.where}`, use)
  }
  const have = state.uses[file] ?? []
  const haveKeys = new Set(have.map((u) => `${u.fact}|${u.kind}|${u.where}`))
  const cmds: FactsCommand[] = []
  for (const u of have) {
    // the source file's own cell is not a figure in this document
    if (!want.has(`${u.fact}|${u.kind}|${u.where}`) && state.facts[u.fact]?.source.file !== file) {
      cmds.push({ type: 'dropUse', file, fact: u.fact, where: u.where })
    }
  }
  for (const [key, use] of want) if (!haveKeys.has(key)) cmds.push({ type: 'useFact', file, use })
  return cmds
}

export type FigureLook = 'ok' | 'wait' | 'stale' | 'unknown'

export function figureLook(s: FigureState | null): FigureLook {
  if (!s) return 'unknown'
  return s.upd ? 'wait' : s.stale ? 'stale' : 'ok'
}

/**
 * Styles for the figures of this file, by fact and part: a tint while an update
 * waits, a solid amber underline when out of date. Paper tokens only, since
 * this is document content. Ids are limited to [A-Za-z0-9_-], so they are safe
 * inside an attribute selector.
 */
export function figureCss(state: FactsState | null, file: string | null, figures: readonly DocFigure[]): string {
  if (!state || !file) return ''
  const rules: string[] = []
  const seen = new Set<string>()
  for (const f of figures) {
    const key = `${f.fact}|${f.part}`
    if (seen.has(key) || !/^[A-Za-z0-9_-]+$/.test(f.fact)) continue
    seen.add(key)
    const look = figureLook(figState(state, f.fact, file, f.part))
    if (look === 'ok' || look === 'unknown') continue
    const sel = `.doc-fig[data-linked-fact="${f.fact}"][data-linked-part="${f.part}"]`
    rules.push(
      look === 'wait'
        ? `${sel}{background:var(--docs-paper-fig-wait-bg);text-decoration-color:var(--docs-paper-fig-wait-line)}`
        : `${sel}{text-decoration-color:var(--docs-paper-fig-stale-line);text-decoration-style:solid}`,
    )
  }
  return rules.join('\n')
}
