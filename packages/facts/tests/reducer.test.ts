import { describe, expect, it } from 'vitest'
import {
  bandOf,
  factsReducer,
  figState,
  filesUsing,
  formatFact,
  normalizeFactsState,
  openUpdates,
  pending,
  sentenceFor,
  waitingFiles,
} from '../src'
import { boardState, edit, REV } from './fixture'

describe('setup', () => {
  it('every using file keeps the current value and nothing waits', () => {
    const s = boardState()
    expect(filesUsing(s, REV)).toEqual(['forecast', 'memo', 'deck', 'update'])
    expect(s.kept[REV]).toEqual({ forecast: 3.86, memo: 3.86, deck: 3.86, update: 3.86 })
    expect(s.keptWords[REV]).toEqual({ memo: 3.86, update: 3.86 })
    expect(waitingFiles(s)).toEqual([])
    expect(figState(s, REV, 'memo')).toEqual({ kept: 3.86, upd: null, stale: false })
  })

  it('defining a fact again changes its label but never its value', () => {
    const s = boardState()
    const def = s.facts[REV]!
    const next = factsReducer(s, { type: 'defineFact', fact: { ...def, label: 'Revenue, Q3' }, value: 1 })
    expect(next.values[REV]).toBe(3.86)
    expect(next.facts[REV]!.label).toBe('Revenue, Q3')
  })

  it('a file that does not use the fact has no figure state', () => {
    expect(figState(boardState(), REV, 'nda')).toBeNull()
    expect(figState(boardState(), REV, 'deck', 'sentence')).toBeNull()
  })
})

describe('editSource', () => {
  it('changes the source file now and leaves every other file waiting', () => {
    const s = edit(boardState(), 3.9)
    expect(s.values[REV]).toBe(3.9)
    expect(s.kept[REV]!.forecast).toBe(3.9)
    expect(s.kept[REV]!.memo).toBe(3.86)
    const u = s.updates[0]!
    expect(u).toMatchObject({ fact: REV, from: 3.86, to: 3.9, where: 'forecast', by: 'felix' })
    expect(u.files.forecast).toEqual({ figures: 'self', sentence: null })
    expect(u.files.memo).toEqual({ figures: 'open', sentence: null })
    expect(waitingFiles(s)).toEqual(['memo', 'deck', 'update'])
    expect(pending(s, 'forecast')).toBe(false)
    const memo = figState(s, REV, 'memo')!
    expect(memo.kept).toBe(3.86)
    expect(memo.upd?.id).toBe(u.id)
    expect(memo.stale).toBe(false)
  })

  it('opens the sentence only where the band moved', () => {
    const s = boardState()
    expect(sentenceFor(s.facts[REV], 3.86)).toBe('Revenue grew by about a fifth on Q2')
    const same = edit(s, 3.9)
    expect(same.updates[0]!.files.memo!.sentence).toBeNull()
    const moved = edit(s, 4.1)
    expect(bandOf(s.facts[REV], 4.1)).toBe(2)
    expect(moved.updates[0]!.files.memo!.sentence).toBe('open')
    expect(moved.updates[0]!.files.update!.sentence).toBe('open')
    expect(moved.updates[0]!.files.deck!.sentence).toBeNull()
    expect(figState(moved, REV, 'memo', 'sentence')!.upd).not.toBeNull()
  })

  it('updates the editing file\'s sentence value when the band did not move', () => {
    const s = edit(boardState(), 3.9, 'memo')
    expect(s.keptWords[REV]!.memo).toBe(3.9)
    expect(s.updates[0]!.files.memo).toEqual({ figures: 'self', sentence: null })
    const moved = edit(boardState(), 4.1, 'memo')
    expect(moved.keptWords[REV]!.memo).toBe(3.86)
    expect(moved.updates[0]!.files.memo).toEqual({ figures: 'self', sentence: 'open' })
  })

  it('ignores an edit to the same value, an unknown fact, or a non-number', () => {
    const s = boardState()
    expect(edit(s, 3.86)).toBe(s)
    expect(edit(s, Number.NaN)).toBe(s)
    expect(factsReducer(s, { type: 'editSource', fact: 'nope', file: 'forecast', to: 2, by: 'x', at: 'y', id: 'z' })).toBe(s)
  })

  it('a newer edit replaces what is still open from an older one', () => {
    let s = edit(boardState(), 4.1)
    const first = s.updates[0]!.id
    s = factsReducer(s, { type: 'keepFile', update: first, file: 'deck' })
    s = edit(s, 3.95)
    const older = s.updates.find((u) => u.id === first)!
    expect(older.files.memo).toEqual({ figures: 'replaced', sentence: 'replaced' })
    expect(older.files.deck!.figures).toBe('kept')
    expect(older.files.forecast!.figures).toBe('self')
    expect(s.updates[0]!.from).toBe(4.1)
    expect(openUpdates(s).map((u) => u.id)).toEqual([s.updates[0]!.id])
    // The deck kept 4.10; the memo still shows 3.86; both now wait for 3.95.
    expect(figState(s, REV, 'deck')!.kept).toBe(4.1)
    expect(figState(s, REV, 'memo')!.upd!.to).toBe(3.95)
  })
})

describe('decisions', () => {
  it('keepFile takes the new value and settles the file', () => {
    let s = edit(boardState(), 3.9)
    const id = s.updates[0]!.id
    s = factsReducer(s, { type: 'keepFile', update: id, file: 'deck' })
    expect(s.kept[REV]!.deck).toBe(3.9)
    expect(s.updates[0]!.files.deck!.figures).toBe('kept')
    expect(pending(s, 'deck')).toBe(false)
    expect(figState(s, REV, 'deck')).toEqual({ kept: 3.9, upd: null, stale: false })
  })

  it('keepOld keeps the old value, which then reads as out of date', () => {
    let s = edit(boardState(), 3.9)
    s = factsReducer(s, { type: 'keepOld', update: s.updates[0]!.id, file: 'deck' })
    expect(s.kept[REV]!.deck).toBe(3.86)
    expect(s.updates[0]!.files.deck!.figures).toBe('undone')
    expect(figState(s, REV, 'deck')).toEqual({ kept: 3.86, upd: null, stale: true })
  })

  it('keepSentence and declineSentence decide the sentence apart from the figures', () => {
    let s = edit(boardState(), 4.1)
    const id = s.updates[0]!.id
    s = factsReducer(s, { type: 'keepFile', update: id, file: 'memo' })
    expect(pending(s, 'memo')).toBe(true)
    s = factsReducer(s, { type: 'keepSentence', update: id, file: 'memo' })
    expect(s.keptWords[REV]!.memo).toBe(4.1)
    expect(pending(s, 'memo')).toBe(false)
    expect(figState(s, REV, 'memo', 'sentence')!.stale).toBe(false)

    s = factsReducer(s, { type: 'keepFile', update: id, file: 'update' })
    s = factsReducer(s, { type: 'declineSentence', update: id, file: 'update' })
    expect(s.keptWords[REV]!.update).toBe(3.86)
    expect(s.updates[0]!.files.update!.sentence).toBe('undone')
    expect(figState(s, REV, 'update', 'sentence')!.stale).toBe(true)
  })

  it('a decision on something not open changes nothing', () => {
    let s = edit(boardState(), 3.9)
    const id = s.updates[0]!.id
    expect(factsReducer(s, { type: 'keepFile', update: id, file: 'forecast' })).toBe(s)
    expect(factsReducer(s, { type: 'keepSentence', update: id, file: 'memo' })).toBe(s)
    expect(factsReducer(s, { type: 'keepFile', update: 'missing', file: 'memo' })).toBe(s)
    s = factsReducer(s, { type: 'keepOld', update: id, file: 'memo' })
    expect(factsReducer(s, { type: 'keepFile', update: id, file: 'memo' })).toBe(s)
  })
})

describe('uses', () => {
  it('a file that starts using a fact keeps the current value', () => {
    const s = factsReducer(edit(boardState(), 3.9), { type: 'useFact', file: 'nda', use: { fact: REV, kind: 'value', where: 'Clause 1' } })
    expect(s.kept[REV]!.nda).toBe(3.9)
    expect(figState(s, REV, 'nda')).toEqual({ kept: 3.9, upd: null, stale: false })
  })

  it('the same use twice is one use', () => {
    const s = boardState()
    expect(factsReducer(s, { type: 'useFact', file: 'deck', use: { fact: REV, kind: 'value', where: 'Slide 4, headline' } })).toBe(s)
  })

  it('dropping the last use clears the file and settles what waited for it', () => {
    let s = edit(boardState(), 4.1)
    s = factsReducer(s, { type: 'dropUse', file: 'memo', fact: REV, where: 'Paragraph 2' })
    expect(s.keptWords[REV]!.memo).toBeUndefined()
    expect(s.updates[0]!.files.memo).toEqual({ figures: 'open', sentence: 'replaced' })
    s = factsReducer(s, { type: 'dropUse', file: 'memo', fact: REV })
    expect(s.uses.memo).toBeUndefined()
    expect(s.kept[REV]!.memo).toBeUndefined()
    expect(pending(s, 'memo')).toBe(false)
  })
})

describe('normalizeFactsState', () => {
  it('round-trips a real state through JSON', () => {
    const s = edit(edit(boardState(), 4.1), 3.95)
    expect(normalizeFactsState(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it('drops what does not parse', () => {
    expect(normalizeFactsState(null).facts).toEqual({})
    expect(normalizeFactsState({ version: 2 }).facts).toEqual({})
    const raw = JSON.parse(JSON.stringify(boardState())) as Record<string, any>
    raw.values.ghost = 1
    raw.uses.memo.push({ fact: REV, kind: 'bogus', where: 'x' })
    raw.uses.deck.push({ fact: 'ghost', kind: 'value', where: 'x' })
    raw.updates.push({ id: 'bad' })
    raw.kept[REV].deck = 'three'
    const s = normalizeFactsState(raw)
    expect(s.values.ghost).toBeUndefined()
    expect(s.uses.memo).toHaveLength(2)
    expect(s.uses.deck).toHaveLength(1)
    expect(s.updates).toEqual([])
    expect(s.kept[REV]!.deck).toBeUndefined()
  })
})

describe('formatFact', () => {
  it('reads with the fact display, or as a plain number', () => {
    const def = { id: 'r', label: 'R', source: { file: 'f', ref: 'A1' }, display: { prefix: '₩', suffix: 'bn', decimals: 2 } }
    expect(formatFact(def, 3.9)).toBe('₩3.90bn')
    expect(formatFact(undefined, 3.14159)).toBe('3.14')
  })

  it('keeps the display through normalising', () => {
    const s = factsReducer(boardState(), {
      type: 'defineFact',
      value: 0,
      fact: { id: 'x', label: 'X', source: { file: 'f', ref: 'A1' }, display: { suffix: '%', decimals: 1 } },
    })
    expect(normalizeFactsState(JSON.parse(JSON.stringify(s))).facts.x!.display).toEqual({ suffix: '%', decimals: 1 })
  })
})
