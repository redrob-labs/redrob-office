import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, cellProperties, selectedCells, tableCells, tableProperties, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

function withTable(format: 'hwpx' | 'hwp' = 'hwpx') {
  const s = new Session(HwpCoreDocument.blank(), format)
  const bus = new CommandBus(s)
  bus.run('table:create', { rows: 3, cols: 3 })
  return { s, bus }
}

const cellPos = (s: Session, cell: number): Pos => {
  const h = s.selection.head
  return { section: h.section, para: h.para, offset: 0, cell: { control: h.cell!.control, cell, para: 0 } }
}

describe('table and cell properties (task 2.3)', () => {
  it('selected cells are the rectangle between anchor and head', () => {
    const { s } = withTable()
    expect(selectedCells(s)).toEqual([0])
    s.select({ anchor: cellPos(s, 1), head: cellPos(s, 5) })
    // rows 0–1, cols 1–2 of a 3×3 table
    expect(selectedCells(s)).toEqual([1, 2, 4, 5])
    expect(tableCells(s, { section: 0, host: s.selection.head.para, control: s.selection.head.cell!.control })).toHaveLength(9)
  })

  it('table properties apply, undo and survive a save in both formats', () => {
    for (const format of ['hwpx', 'hwp'] as const) {
      const { s, bus } = withTable(format)
      expect(tableProperties(s)!.repeatHeader).toBe(false)
      bus.run('table:set-properties', { props: { repeatHeader: true, pageBreak: 2, cellSpacing: 283, outerLeft: 567 } })
      const p = tableProperties(s)!
      expect([p.repeatHeader, p.pageBreak, p.cellSpacing, p.outerLeft]).toEqual([true, 2, 283, 567])
      const reopened = new Session(HwpCoreDocument.open(s.export(format)), format)
      reopened.select({ anchor: s.selection.head, head: s.selection.head })
      const r = tableProperties(reopened)!
      expect([r.repeatHeader, r.pageBreak, r.cellSpacing], format).toEqual([true, 2, 283])
      bus.run('edit:undo')
      expect(tableProperties(s)!.repeatHeader).toBe(false)
    }
  })

  it('cell properties apply to every selected cell as one undo step', () => {
    const { s, bus } = withTable()
    s.select({ anchor: cellPos(s, 0), head: cellPos(s, 4) })
    bus.run('table:cell-set-properties', {
      props: {
        verticalAlign: 1,
        fillType: 'solid',
        fillColor: '#ffeeaa',
        borderTop: { type: 8, width: 3, color: '#ff0000' },
      },
    })
    for (const c of [0, 1, 3, 4]) {
      const p = cellProperties(s, c)!
      expect(p.verticalAlign).toBe(1)
      expect(p.fillType).toBe('solid')
      expect(p.fillColor).toBe('#ffeeaa')
      expect(p.borderTop).toEqual({ type: 8, width: 3, color: '#ff0000' })
    }
    expect(cellProperties(s, 2)!.fillType).toBe('none')
    bus.run('edit:undo')
    for (const c of [0, 1, 3, 4]) expect(cellProperties(s, c)!.fillType).toBe('none')
  })

  it('cell size, padding and header flag round-trip through HWPX', () => {
    const { s, bus } = withTable()
    bus.run('table:cell-set-properties', { props: { height: 2835, paddingLeft: 283, isHeader: true } })
    const reopened = new Session(HwpCoreDocument.open(s.export('hwpx')), 'hwpx')
    reopened.select({ anchor: s.selection.head, head: s.selection.head })
    const p = cellProperties(reopened)!
    expect(p.paddingLeft).toBe(283)
    expect(p.isHeader).toBe(true)
    expect(Number(p.height)).toBeGreaterThanOrEqual(2835)
  })

  it('outside a table the commands are disabled', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    const bus = new CommandBus(s)
    expect(bus.isEnabled('table:set-properties', { props: {} })).toBe(false)
    expect(bus.isEnabled('table:cell-set-properties', { props: {} })).toBe(false)
    expect(tableProperties(s)).toBeNull()
  })
})
