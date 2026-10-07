/**
 * Linked figures in Slides: insert a figure from the shell's index as a text
 * box holding a RedrobFact_<id> field, keep each figure reading what this
 * file keeps, and keep the index in step with what the saved deck contains.
 * Main reads and rewrites the fields (src/main/linked-figures.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { FIGURE_STRINGS, LinkedFigurePicker, useFactsIndex, type FrameTool } from '@genoffice/ui'
import '@genoffice/ui/figures.css'
import {
  factChoices,
  figureFieldName,
  figureInsertText,
  isFactId,
  placedFigureRewrites,
  syncPlacedUses,
  type FactsCommand,
  type FactsState,
  type FigurePart,
  type PlacedFigure,
} from '@genoffice/facts'
import type { RenderSlide } from '@genoffice/pptx-render'
import type { SlidesApi } from '../../shared/ipc'

type DeckFigure = { slideIndex: number; fact: string; part: FigurePart; text: string }

/** A deck's figures as the shared helpers take them: one place per slide. */
export function placedSlideFigures(figures: readonly DeckFigure[]): PlacedFigure[] {
  return figures.map((f) => ({ fact: f.fact, part: f.part, text: f.text, where: `Slide ${f.slideIndex + 1}` }))
}

/** One rewrite per fact and part (every box showing it reads the same kept text). */
export function deckRewrites(state: FactsState, file: string, figures: readonly DeckFigure[]): Array<{ fact: string; part: FigurePart; text: string }> {
  const placed = placedSlideFigures(figures)
  const out = new Map<string, { fact: string; part: FigurePart; text: string }>()
  for (const r of placedFigureRewrites(state, file, placed)) {
    const f = placed[r.index]!
    out.set(`${f.part}|${f.fact}`, { fact: f.fact, part: f.part, text: r.text })
  }
  return [...out.values()]
}

export function useSlideLinkedFigures({
  api,
  slides,
  current,
  slideSize,
  filePath,
  clean,
  editable,
  fitWidthPx,
  onDeck,
  onInserted,
  notify,
}: {
  api: SlidesApi | undefined
  slides: readonly RenderSlide[]
  current: number
  slideSize: { w: number; h: number } | null
  filePath: string | null
  clean: boolean
  editable: boolean
  fitWidthPx: number
  /** figures were rewritten: the new slides (marks the deck unsaved) */
  onDeck: (slides: RenderSlide[]) => void
  onInserted: (slideIndex: number, slide: RenderSlide, sourceId: string) => void
  notify: (msg: string) => void
}): { tools: FrameTool[]; overlay: ReactElement | null } {
  const facts = useFactsIndex<FactsState, FactsCommand>(api)
  const [figures, setFigures] = useState<DeckFigure[]>([])
  const [picking, setPicking] = useState(false)

  // the deck's figures, re-read whenever the slides change
  useEffect(() => {
    if (!api?.linkedFigures || !facts.available) return
    let active = true
    void api.linkedFigures().then(
      (list) => {
        if (active) setFigures(Array.isArray(list) ? list : [])
      },
      () => undefined,
    )
    return () => {
      active = false
    }
  }, [api, slides, facts.available])

  // a kept update rewrites the figures to what this file keeps
  const rewriting = useRef(false)
  useEffect(() => {
    if (!api?.refreshLinkedFigures || !facts.state || !filePath || !editable || rewriting.current) return
    const rewrites = deckRewrites(facts.state, filePath, figures)
    if (rewrites.length === 0) return
    rewriting.current = true
    void api
      .refreshLinkedFigures(rewrites)
      .then((next) => {
        if (next) onDeck(next)
      })
      .catch(() => undefined)
      .finally(() => {
        rewriting.current = false
      })
  }, [api, facts.state, filePath, figures, editable, onDeck])

  // the index says which files use which fact: keep it in step with the saved deck
  const syncing = useRef(false)
  useEffect(() => {
    if (!clean || !filePath || !facts.state || syncing.current) return
    const cmds = syncPlacedUses(facts.state, filePath, placedSlideFigures(figures))
    if (cmds.length === 0) return
    syncing.current = true
    void (async () => {
      try {
        for (const c of cmds) await facts.command(c)
      } catch {
        // the file is the record: the next clean state tries again
      } finally {
        syncing.current = false
      }
    })()
  }, [clean, filePath, facts, figures])

  const insert = useCallback(
    async (fact: string, part: FigurePart) => {
      setPicking(false)
      if (!api || !filePath || !facts.state || !isFactId(fact) || !slideSize) return
      const text = figureInsertText(facts.state, filePath, fact, part)
      const w = part === 'sentence' ? 480 : 200
      const h = 44
      const slideIndex = current
      const r = await api.addElement({
        slideIndex,
        kind: 'textbox',
        xPx: Math.round((slideSize.w - w) / 2),
        yPx: Math.round((slideSize.h - h) / 2),
        wPx: w,
        hPx: h,
        fitWidthPx,
        paragraphs: [{ align: 'center', runs: [{ text, fontSize: 18, field: figureFieldName(fact, part) }] }],
      })
      if (!r) return
      onInserted(slideIndex, r.slide, r.sourceId)
      facts
        .command({
          type: 'useFact',
          file: filePath,
          use: { fact, kind: part === 'sentence' ? 'sentence' : 'value', where: `Slide ${slideIndex + 1}` },
        })
        .catch(() => notify(FIGURE_STRINGS.failed))
    },
    [api, filePath, facts, slideSize, current, fitWidthPx, onInserted, notify],
  )

  const tools = useMemo<FrameTool[]>(
    () => [
      {
        id: 'linked-insert',
        label: FIGURE_STRINGS.tool,
        keywords: ['figure', 'link', 'fact', 'number'],
        disabled: !editable || !facts.available || !slideSize,
        run: () => {
          if (!filePath) notify(FIGURE_STRINGS.saveFirst)
          else setPicking(true)
        },
      },
    ],
    [editable, facts.available, filePath, notify, slideSize],
  )

  const overlay = picking ? (
    <LinkedFigurePicker
      choices={factChoices(facts.state)}
      strings={FIGURE_STRINGS}
      onInsert={(fact, part) => void insert(fact, part)}
      onClose={() => setPicking(false)}
    />
  ) : null
  return { tools, overlay }
}
