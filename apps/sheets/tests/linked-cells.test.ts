import { describe, expect, it } from 'vitest'
import { emptyFactsState, factsReducer, type FactsAction } from '@genoffice/facts'
import {
  factIdForCell,
  formatCellRef,
  linkCellCommands,
  linkedCellsIn,
  parseCellRef,
  sourceEdits,
} from '../src/renderer/linked-cells'

const BOOK = 'C:\\Board\\forecast.xlsx'

describe('cell references', () => {
  it('formats and parses a plain and a quoted sheet', () => {
    expect(formatCellRef({ sheet: 'Summary', a1: 'C2' })).toBe('Summary!C2')
    expect(formatCellRef({ sheet: "Q3 board's", a1: 'B7' })).toBe("'Q3 board''s'!B7")
    expect(parseCellRef("'Q3 board''s'!B7")).toEqual({ sheet: "Q3 board's", a1: 'B7' })
    expect(parseCellRef('Summary!$C$2')).toEqual({ sheet: 'Summary', a1: 'C2' })
    expect(parseCellRef('Summary!C2:C4')).toBeNull()
  })

  it('gives one stable, Word-safe id per cell', () => {
    const a = factIdForCell(BOOK, { sheet: 'Summary', a1: 'C2' })
    expect(a).toMatch(/^cell-[0-9a-f]{16}$/)
    expect(factIdForCell(BOOK.toUpperCase(), { sheet: 'Summary', a1: 'C2' })).toBe(a)
    expect(factIdForCell(BOOK, { sheet: 'Summary', a1: 'C3' })).not.toBe(a)
  })
})

describe('linkCellCommands', () => {
  it('defines the fact and records the workbook as its first user', () => {
    const r = linkCellCommands({ path: BOOK, ref: { sheet: 'Summary', a1: 'C2' }, value: 3.86, labelLeft: 'Q3 revenue' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fact).toMatchObject({ label: 'Q3 revenue', source: { file: BOOK, ref: 'Summary!C2' } })
    expect(r.commands).toEqual([
      { type: 'defineFact', fact: r.fact, value: 3.86 },
      { type: 'useFact', file: BOOK, use: { fact: r.fact.id, kind: 'value', where: 'Summary!C2' } },
    ])
  })

  it('names the figure after its cell when there is no label beside it', () => {
    const r = linkCellCommands({ path: BOOK, ref: { sheet: 'Summary', a1: 'C2' }, value: '4' })
    expect(r.ok && r.fact.label).toBe('Summary!C2')
  })

  it('refuses an unsaved workbook and a cell that is not a number', () => {
    expect(linkCellCommands({ path: '', ref: { sheet: 'S', a1: 'A1' }, value: 1 })).toEqual({ ok: false, reason: 'not-saved' })
    expect(linkCellCommands({ path: BOOK, ref: { sheet: 'S', a1: 'A1' }, value: 'Q3' })).toEqual({ ok: false, reason: 'not-a-number' })
    expect(linkCellCommands({ path: BOOK, ref: { sheet: 'S', a1: 'A1' }, value: '' })).toEqual({ ok: false, reason: 'not-a-number' })
  })
})

describe('sourceEdits', () => {
  const linked = () => {
    const r = linkCellCommands({ path: BOOK, ref: { sheet: 'Summary', a1: 'C2' }, value: 3.86 })
    if (!r.ok) throw new Error('link failed')
    return { id: r.fact.id, state: r.commands.reduce((s, c) => factsReducer(s, c as FactsAction), emptyFactsState()) }
  }

  it('finds the linked cells of this workbook only', () => {
    const { id, state } = linked()
    expect(linkedCellsIn(state, BOOK)).toEqual([{ fact: id, ref: { sheet: 'Summary', a1: 'C2' } }])
    expect(linkedCellsIn(state, 'C:\\other.xlsx')).toEqual([])
  })

  it('sends one edit when the linked cell changed, none when it did not', () => {
    const { id, state } = linked()
    expect(sourceEdits(state, BOOK, () => 3.86)).toEqual([])
    expect(sourceEdits(state, BOOK, () => 3.9)).toEqual([{ type: 'editSource', fact: id, file: BOOK, to: 3.9 }])
  })

  it('never turns a figure into text, an error or nothing', () => {
    const { state } = linked()
    expect(sourceEdits(state, BOOK, () => '#REF!')).toEqual([])
    expect(sourceEdits(state, BOOK, () => null)).toEqual([])
    expect(
      sourceEdits(state, BOOK, () => {
        throw new Error('sheet gone')
      }),
    ).toEqual([])
  })
})
