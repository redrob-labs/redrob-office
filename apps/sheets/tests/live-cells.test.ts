import { describe, expect, it } from 'vitest'
import { cellsFromMutation, mutationsFor } from '../src/renderer/live/useLiveCells'

describe('live cells', () => {
  it('reads values, formulas and cleared cells from a set-range-values payload', () => {
    const cells = cellsFromMutation('s1', {
      0: { 0: { v: 'a' }, 1: { v: 2, f: '=1+1' }, 2: null },
      3: { 4: { s: 'style-only' } },
    })
    expect(cells).toEqual([
      { sheetId: 's1', row: 0, col: 0, v: 'a' },
      { sheetId: 's1', row: 0, col: 1, v: 2, f: '=1+1' },
      { sheetId: 's1', row: 0, col: 2, v: null },
    ])
  })

  it('ignores malformed payloads', () => {
    expect(cellsFromMutation('', { 0: { 0: { v: 1 } } })).toEqual([])
    expect(cellsFromMutation('s1', null)).toEqual([])
    expect(cellsFromMutation('s1', { x: { 0: { v: 1 } }, 1: { '-1': { v: 1 } } })).toEqual([])
    expect(cellsFromMutation('s1', { 0: { 0: { v: { rich: true } } } })).toEqual([{ sheetId: 's1', row: 0, col: 0, v: null }])
  })

  it('groups remote cells into one payload per sheet', () => {
    const out = mutationsFor([
      { sheetId: 's1', row: 0, col: 0, v: 'a' },
      { sheetId: 's2', row: 1, col: 2, v: 3, f: '=1+2' },
      { sheetId: 's1', row: 0, col: 1, v: null },
    ])
    expect([...out.keys()]).toEqual(['s1', 's2'])
    expect(out.get('s1')).toEqual({ 0: { 0: { v: 'a' }, 1: { v: null } } })
    expect(out.get('s2')).toEqual({ 1: { 2: { v: 3, f: '=1+2' } } })
  })

  it('round-trips a payload', () => {
    const payload = { 2: { 5: { v: 'x' }, 6: { v: 1, f: '=A1' } } }
    expect(mutationsFor(cellsFromMutation('s9', payload)).get('s9')).toEqual(payload)
  })
})
