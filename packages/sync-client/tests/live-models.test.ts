import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { bindCells, bindShapeText, CELLS_MAP } from '../src/live-models'

function relay(a: Y.Doc, b: Y.Doc) {
  a.on('update', (u: Uint8Array, origin: unknown) => origin !== 'relay' && Y.applyUpdate(b, u, 'relay'))
  b.on('update', (u: Uint8Array, origin: unknown) => origin !== 'relay' && Y.applyUpdate(a, u, 'relay'))
}

describe('live cells', () => {
  it('a cell typed in one view reaches the other, not back to itself, and the later write wins', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    relay(a, b)
    const onA = vi.fn()
    const onB = vi.fn()
    const ca = bindCells(a, { readOnly: false, onRemote: onA })
    const cb = bindCells(b, { readOnly: false, onRemote: onB })
    ca.push([
      { sheetId: 's1', row: 0, col: 1, v: 42 },
      { sheetId: 's1', row: 2, col: 0, v: 7, f: '=A1*7' },
    ])
    expect(onB).toHaveBeenCalledTimes(1)
    expect(onB.mock.calls[0]![0]).toEqual(
      expect.arrayContaining([
        { sheetId: 's1', row: 0, col: 1, v: 42 },
        { sheetId: 's1', row: 2, col: 0, v: 7, f: '=A1*7' },
      ]),
    )
    expect(onA).not.toHaveBeenCalled()
    cb.push([{ sheetId: 's1', row: 0, col: 1, v: 'forty-two' }])
    expect(onA).toHaveBeenLastCalledWith([{ sheetId: 's1', row: 0, col: 1, v: 'forty-two' }])
    expect(ca.all().find((c) => c.row === 0)?.v).toBe('forty-two')
  })

  it('a read-only person never writes, and malformed entries are skipped', () => {
    const doc = new Y.Doc()
    const ro = bindCells(doc, { readOnly: true, onRemote: () => undefined })
    ro.push([{ sheetId: 's', row: 0, col: 0, v: 1 }])
    expect(doc.getMap(CELLS_MAP).size).toBe(0)
    const map = doc.getMap(CELLS_MAP)
    map.set('nonsense', { v: 1 })
    map.set('s!1:1', { v: { evil: true } })
    map.set('s!2:2', { v: Number.NaN })
    map.set('s!3:3', { v: 'ok' })
    expect(ro.all()).toEqual([
      { sheetId: 's', row: 1, col: 1, v: null },
      { sheetId: 's', row: 3, col: 3, v: 'ok' },
    ])
  })
})

describe('live shape text', () => {
  it("a text box's paragraphs reach the other view by slide and shape id; a read-only view never writes", () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    relay(a, b)
    const onB = vi.fn()
    const sa = bindShapeText(a, { readOnly: false, onRemote: () => undefined })
    bindShapeText(b, { readOnly: false, onRemote: onB })
    const paragraphs = [{ runs: [{ text: 'Q3 results' }] }]
    sa.push({ slideId: 'sld-256', shapeId: 'sp-4', paragraphs })
    expect(onB).toHaveBeenCalledWith([{ slideId: 'sld-256', shapeId: 'sp-4', paragraphs }])
    // the same text again is not a change
    sa.push({ slideId: 'sld-256', shapeId: 'sp-4', paragraphs })
    expect(onB).toHaveBeenCalledTimes(1)
    const c = new Y.Doc()
    const ro = bindShapeText(c, { readOnly: true, onRemote: () => undefined })
    ro.push({ slideId: 'x', shapeId: 'y', paragraphs })
    expect(ro.all()).toEqual([])
    expect(sa.all()).toEqual([{ slideId: 'sld-256', shapeId: 'sp-4', paragraphs }])
  })
})
