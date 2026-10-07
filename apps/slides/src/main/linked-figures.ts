/**
 * Linked figures in a deck: a text run that is a <a:fld type="RedrobFact_<id>">
 * field (RedrobFactWords_<id> for the sentence), whose cached text is the
 * kept value, as a DOCVARIABLE is in Docs. PowerPoint shows the cached text.
 * Only top-level text boxes and shapes are read and rewritten here.
 */
import { parseFigureField, type FigurePart } from '@genoffice/facts'
import type { Slide, SlideElement, TextElement } from '@genoffice/pptx-engine'
import type { EditParagraph } from '../shared/ipc'

export interface SlideFigure {
  slideIndex: number
  sourceId: string
  fact: string
  part: FigurePart
  text: string
}

const textOf = (el: SlideElement) =>
  el.type === 'text' || el.type === 'shape' ? (el as TextElement).text?.paragraphs ?? null : null

/** Every figure in the deck, in slide and reading order. */
export function slideFigures(slides: readonly Slide[]): SlideFigure[] {
  const out: SlideFigure[] = []
  slides.forEach((slide, slideIndex) => {
    for (const el of slide.elements) {
      for (const p of textOf(el) ?? []) {
        for (const r of p.runs) {
          const f = parseFigureField(r.field)
          if (f) out.push({ slideIndex, sourceId: el.id, fact: f.fact, part: f.part, text: r.text })
        }
      }
    }
  })
  return out
}

/**
 * setText edits that make each figure read its new text. Every paragraph and
 * run points back at its source (srcPara/srcRun), so formatting, links and
 * other fields are kept; only the figure runs' text changes.
 */
export function figureTextEdits(
  slides: readonly Slide[],
  rewrites: ReadonlyArray<{ fact: string; part: FigurePart; text: string }>,
): Array<{ slideIndex: number; el: string; paragraphs: EditParagraph[] }> {
  const want = new Map(rewrites.map((r) => [`${r.part}|${r.fact}`, r.text]))
  const edits: Array<{ slideIndex: number; el: string; paragraphs: EditParagraph[] }> = []
  slides.forEach((slide, slideIndex) => {
    for (const el of slide.elements) {
      const paras = textOf(el)
      if (!paras) continue
      let changed = false
      const paragraphs: EditParagraph[] = paras.map((p, pi) => ({
        srcPara: pi,
        runs: p.runs.map((r, ri) => {
          const f = parseFigureField(r.field)
          const next = f ? want.get(`${f.part}|${f.fact}`) : undefined
          if (next !== undefined && next !== r.text) changed = true
          return { text: next ?? r.text, srcRun: ri, ...(r.field ? { field: r.field } : {}) }
        }),
      }))
      if (changed) edits.push({ slideIndex, el: el.id, paragraphs })
    }
  })
  return edits
}
