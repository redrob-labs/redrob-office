import { describe, expect, it } from 'vitest'
import {
  factChoices,
  factsReducer,
  figureFieldName,
  figureInsertText,
  keptFigureText,
  parseFigureField,
  placedFigureRewrites,
  syncPlacedUses,
} from '../src'
import { boardState, edit, REV } from './fixture'

describe('figure field names', () => {
  it('round-trips value and sentence fields and refuses anything else', () => {
    expect(figureFieldName(REV, 'figures')).toBe('RedrobFact_q3-revenue')
    expect(figureFieldName(REV, 'sentence')).toBe('RedrobFactWords_q3-revenue')
    expect(parseFigureField('RedrobFact_q3-revenue')).toEqual({ fact: REV, part: 'figures' })
    expect(parseFigureField('RedrobFactWords_q3-revenue')).toEqual({ fact: REV, part: 'sentence' })
    expect(parseFigureField('slidenum')).toBeNull()
    expect(parseFigureField('RedrobFact_bad id')).toBeNull()
    expect(parseFigureField(undefined)).toBeNull()
  })
})

describe('placed figures', () => {
  it('reads what the file keeps, and rewrites only after the file keeps a new value', () => {
    let s = boardState()
    const deck = [{ fact: REV, part: 'figures' as const, where: 'Slide 4, headline', text: '3.86' }]
    expect(keptFigureText(s, 'deck', REV, 'figures')).toBe('3.86')
    expect(placedFigureRewrites(s, 'deck', deck)).toEqual([])
    s = edit(s, 4.1)
    // the update waits: the deck keeps the old value
    expect(placedFigureRewrites(s, 'deck', deck)).toEqual([])
    const upd = s.updates[0]!.id
    s = factsReducer(s, { type: 'keepFile', update: upd, file: 'deck' })
    expect(placedFigureRewrites(s, 'deck', deck)).toEqual([{ index: 0, text: '4.1' }])
  })

  it('starts a new figure with the kept value, else the source value', () => {
    const s = boardState()
    expect(figureInsertText(s, 'deck', REV, 'figures')).toBe('3.86')
    expect(figureInsertText(s, 'new-file', REV, 'figures')).toBe('3.86')
    expect(figureInsertText(s, 'new-file', REV, 'sentence')).toBe('Revenue grew by about a fifth on Q2')
  })

  it('syncs uses to what the saved file contains, never dropping the source cell', () => {
    const s = boardState()
    expect(syncPlacedUses(s, 'deck', [])).toEqual([{ type: 'dropUse', file: 'deck', fact: REV, where: 'Slide 4, headline' }])
    expect(syncPlacedUses(s, 'deck', [{ fact: REV, part: 'figures', where: 'Slide 2', text: '3.86' }])).toEqual([
      { type: 'dropUse', file: 'deck', fact: REV, where: 'Slide 4, headline' },
      { type: 'useFact', file: 'deck', use: { fact: REV, kind: 'value', where: 'Slide 2' } },
    ])
    expect(syncPlacedUses(s, 'forecast', [])).toEqual([])
    expect(syncPlacedUses(s, 'deck', [{ fact: 'unknown', part: 'figures', where: 'Slide 1', text: '1' }])).toHaveLength(1)
  })

  it('offers each fact formatted for the picker', () => {
    expect(factChoices(boardState())).toEqual([
      { id: REV, label: 'Q3 revenue', value: '3.86', source: 'forecast, Summary!C2', hasSentence: true },
    ])
    expect(factChoices(null)).toEqual([])
  })
})
