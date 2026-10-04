import { emptyFactsState, factsReducer, type FactsAction, type FactsState } from '../src'

/** Q2 revenue is 3.20bn; the growth sentence bands sit at 15%, 25% and 35% growth on Q2. */
export const Q2 = 3.2

export const REV = 'q3-revenue'

/**
 * The prototype's world: Q3 revenue in forecast.xlsx Summary!C2, used by the
 * memo, the deck and the investor update. The memo and the update carry the
 * growth sentence.
 */
export function boardState(value = 3.86): FactsState {
  const actions: FactsAction[] = [
    {
      type: 'defineFact',
      value,
      fact: {
        id: REV,
        label: 'Q3 revenue',
        source: { file: 'forecast', ref: 'Summary!C2' },
        bands: [
          { below: Q2 * 1.15, words: 'Revenue grew modestly on Q2' },
          { below: Q2 * 1.25, words: 'Revenue grew by about a fifth on Q2' },
          { below: Q2 * 1.35, words: 'Revenue grew by almost a third on Q2' },
          { words: 'Revenue grew by more than a third on Q2' },
        ],
      },
    },
    { type: 'useFact', file: 'forecast', use: { fact: REV, kind: 'value', where: 'Summary!C2' } },
    { type: 'useFact', file: 'forecast', use: { fact: REV, kind: 'derived', where: 'Summary!C3' } },
    { type: 'useFact', file: 'memo', use: { fact: REV, kind: 'value', where: 'Paragraph 1' } },
    { type: 'useFact', file: 'memo', use: { fact: REV, kind: 'sentence', where: 'Paragraph 2' } },
    { type: 'useFact', file: 'deck', use: { fact: REV, kind: 'value', where: 'Slide 4, headline' } },
    { type: 'useFact', file: 'update', use: { fact: REV, kind: 'value', where: 'Highlights' } },
    { type: 'useFact', file: 'update', use: { fact: REV, kind: 'sentence', where: 'Highlights' } },
  ]
  return actions.reduce(factsReducer, emptyFactsState())
}

let n = 0
export function edit(state: FactsState, to: number, file = 'forecast'): FactsState {
  n += 1
  return factsReducer(state, { type: 'editSource', fact: REV, file, to, by: 'felix', at: '2026-10-04T10:00:00.000Z', id: `u${n}` })
}
