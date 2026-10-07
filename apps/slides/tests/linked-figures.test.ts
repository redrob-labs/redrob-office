import { describe, expect, it } from 'vitest'
import type { Slide } from '@genoffice/pptx-engine'
import { figureTextEdits, slideFigures } from '../src/main/linked-figures'
import { deckRewrites, placedSlideFigures } from '../src/renderer/linked/useSlideLinkedFigures'
import { emptyFactsState, factsReducer } from '@genoffice/facts'

const box = (id: string, runs: Array<{ text: string; field?: string }>) => ({
  id,
  type: 'text',
  anchor: { originalXml: '' },
  text: { paragraphs: [{ runs }] },
})

const deck = () =>
  [
    { path: 'ppt/slides/slide1.xml', elements: [box('a', [{ text: 'Revenue ' }, { text: '3.86', field: 'RedrobFact_rev' }])] },
    {
      path: 'ppt/slides/slide2.xml',
      elements: [
        box('b', [{ text: 'grew a little', field: 'RedrobFactWords_rev' }]),
        box('c', [{ text: '7', field: 'slidenum' }]),
        { id: 'p', type: 'picture', anchor: { originalXml: '' } },
      ],
    },
  ] as unknown as Slide[]

describe('slide figures', () => {
  it('finds value and sentence fields, and nothing else', () => {
    expect(slideFigures(deck())).toEqual([
      { slideIndex: 0, sourceId: 'a', fact: 'rev', part: 'figures', text: '3.86' },
      { slideIndex: 1, sourceId: 'b', fact: 'rev', part: 'sentence', text: 'grew a little' },
    ])
  })

  it('rewrites only the figure runs, pointing every run back at its source', () => {
    const edits = figureTextEdits(deck(), [{ fact: 'rev', part: 'figures', text: '4.10' }])
    expect(edits).toEqual([
      {
        slideIndex: 0,
        el: 'a',
        paragraphs: [
          {
            srcPara: 0,
            runs: [
              { text: 'Revenue ', srcRun: 0 },
              { text: '4.10', srcRun: 1, field: 'RedrobFact_rev' },
            ],
          },
        ],
      },
    ])
    expect(figureTextEdits(deck(), [{ fact: 'rev', part: 'figures', text: '3.86' }])).toEqual([])
  })

  it('places figures by slide and folds rewrites per fact and part', () => {
    const figs = [
      { slideIndex: 0, fact: 'rev', part: 'figures' as const, text: '3.86' },
      { slideIndex: 3, fact: 'rev', part: 'figures' as const, text: '3.86' },
    ]
    expect(placedSlideFigures(figs).map((f) => f.where)).toEqual(['Slide 1', 'Slide 4'])
    let s = factsReducer(emptyFactsState(), {
      type: 'defineFact',
      value: 3.86,
      fact: { id: 'rev', label: 'Revenue', source: { file: 'book', ref: 'A1' } },
    })
    s = factsReducer(s, { type: 'useFact', file: 'deck', use: { fact: 'rev', kind: 'value', where: 'Slide 1' } })
    expect(deckRewrites(s, 'deck', figs)).toEqual([])
    s = factsReducer(s, { type: 'editSource', fact: 'rev', file: 'book', to: 4, by: 'x', at: 'now', id: 'u1' })
    s = factsReducer(s, { type: 'keepFile', update: 'u1', file: 'deck' })
    expect(deckRewrites(s, 'deck', figs)).toEqual([{ fact: 'rev', part: 'figures', text: '4' }])
  })
})
