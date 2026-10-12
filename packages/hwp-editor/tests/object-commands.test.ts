import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, HU_PER_PX, Session, cellProperties, colorRefToCss, cssToColorRef, draggedBox, objectAt, objectBox, objectProperties, objectsOnPage, selectedCells, tableCells, tableProperties, type Pos } from '../src'

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

describe('pictures and drawing objects (tasks 2.3, 2.4)', () => {
  const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))

  it('insert:shape adds a rectangle anchored to its paragraph and selects it', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    const bus = new CommandBus(s)
    bus.run('insert:shape', { shapeType: 'rectangle' })
    expect(s.object?.kind).toBe('shape')
    const p = objectProperties(s)!
    expect([p.width, p.vertRelTo, p.horzRelTo]).toEqual([14173, 'Para', 'Para'])
    const box = objectBox(s, s.object!)!
    expect(box.width).toBeGreaterThan(100)
    expect(objectAt(s, box.page, box.x + 5, box.y + 5)).toMatchObject({ kind: 'shape', control: s.object!.control })
    bus.run('edit:undo')
    expect(s.object).toBeNull()
    expect(objectsOnPage(s, 0)).toHaveLength(0)
  })

  it('shape line, fill and size apply as one undo step and survive both formats', () => {
    for (const format of ['hwpx', 'hwp'] as const) {
      const s = new Session(HwpCoreDocument.blank(), format)
      const bus = new CommandBus(s)
      bus.run('insert:shape', { shapeType: 'ellipse' })
      const ref = s.object!
      bus.run('object:set-properties', { props: { width: 20000, height: 10000, borderColor: cssToColorRef('#cc0000'), borderWidth: 100, fillType: 'solid', fillBgColor: cssToColorRef('#ffcc00') } })
      const p = objectProperties(s)!
      expect([p.width, p.height, colorRefToCss(p.borderColor), colorRefToCss(p.fillBgColor)]).toEqual([20000, 10000, '#cc0000', '#ffcc00'])
      const reopened = new Session(HwpCoreDocument.open(s.export(format)), format)
      const r = objectProperties(reopened, ref)!
      expect([r.width, colorRefToCss(r.fillBgColor)], format).toEqual([20000, '#ffcc00'])
      s.selectObject(ref)
      bus.run('edit:undo')
      expect(objectProperties(s, ref)!.width).toBe(14173)
    }
  })

  it('picture size, effect and wrap apply; delete removes the picture', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    const bus = new CommandBus(s)
    bus.run('insert:image', { bytes: PNG, extension: 'png', widthPx: 1, heightPx: 1 })
    const pic = objectsOnPage(s, 0).find((o) => o.kind === 'picture')!
    s.selectObject(pic)
    bus.run('object:set-properties', { props: { width: 14400, height: 14400, effect: 'GrayScale', textWrap: 'TopAndBottom' } })
    const p = objectProperties(s)!
    expect([p.width, p.effect, p.textWrap]).toEqual([14400, 'GrayScale', 'TopAndBottom'])
    bus.run('insert:picture-delete')
    expect(s.object).toBeNull()
    expect(objectsOnPage(s, 0).filter((o) => o.kind === 'picture')).toHaveLength(0)
  })

  it('z-order moves the selected object in front of the other', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    const bus = new CommandBus(s)
    bus.run('insert:shape', { shapeType: 'rectangle' })
    const first = s.object!
    s.select(s.selection)
    bus.run('insert:shape', { shapeType: 'ellipse' })
    const z = (o: { control: number }) => objectsOnPage(s, 0).find((b) => b.control === o.control)!.zOrder
    expect(z(first)).toBeLessThan(z(s.object!))
    const second = s.object!
    s.selectObject(first)
    bus.run('insert:arrange-front')
    expect(z(first)).toBeGreaterThan(z(second))
  })

  it('Shift+click adds objects; 개체 묶기 groups them, 개체 풀기 takes the group apart, and both undo', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    const bus = new CommandBus(s)
    bus.run('insert:shape', { shapeType: 'rectangle' })
    const first = s.object!
    s.select(s.selection)
    bus.run('insert:shape', { shapeType: 'ellipse' })
    const second = s.object!
    expect(bus.isEnabled('insert:group-shapes')).toBe(false)
    s.selectObject(first)
    s.toggleObject(second)
    expect(s.selectedObjects()).toEqual([first, second])
    // a second Shift+click takes it out again
    s.toggleObject(second)
    expect(s.selectedObjects()).toEqual([first])
    s.toggleObject(second)
    expect(bus.isEnabled('insert:group-shapes')).toBe(true)
    const kinds = () => objectsOnPage(s, 0).map((o) => (o.group ? 'group' : o.kind)).sort()
    const before = kinds()
    bus.run('insert:group-shapes')
    expect(kinds()).toContain('group')
    expect(kinds()).toHaveLength(1)
    expect(s.selectedObjects()).toHaveLength(1)
    expect(bus.isEnabled('insert:ungroup-shapes')).toBe(true)
    bus.run('insert:ungroup-shapes')
    expect(kinds()).toEqual(before)
    bus.run('edit:undo')
    expect(kinds()).toContain('group')
    bus.run('edit:undo')
    expect(kinds()).toEqual(before)
  })

  it('colour conversion matches HWP COLORREF byte order', () => {
    expect(cssToColorRef('#112233')).toBe(0x332211)
    expect(colorRefToCss(0x332211)).toBe('#112233')
  })

  it('object commands are disabled with no object selected; moving the caret clears it', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    const bus = new CommandBus(s)
    expect(bus.isEnabled('object:set-properties', { props: {} })).toBe(false)
    bus.run('insert:shape', { shapeType: 'rectangle' })
    expect(bus.isEnabled('insert:picture-delete')).toBe(true)
    s.select(s.selection)
    expect(s.object).toBeNull()
  })
})

describe('moving and resizing objects (task 1.7)', () => {
  it('draggedBox moves, and resizes from each handle without going below the minimum', () => {
    const b = { x: 10, y: 20, width: 100, height: 50 }
    expect(draggedBox(b, 'move', 5, -5)).toEqual({ x: 15, y: 15, width: 100, height: 50 })
    expect(draggedBox(b, 'se', 10, 10)).toEqual({ x: 10, y: 20, width: 110, height: 60 })
    expect(draggedBox(b, 'nw', 10, 10)).toEqual({ x: 20, y: 30, width: 90, height: 40 })
    expect(draggedBox(b, 'e', -500, 0).width).toBe(4)
  })

  it('a drag moves a floating shape and resizes it, each one undo step, and survives both formats', () => {
    for (const f of ['hwpx', 'hwp'] as const) {
      const s = new Session(HwpCoreDocument.blank(), f)
      const bus = new CommandBus(s)
      bus.run('insert:shape', { shapeType: 'rectangle' })
      const p0 = objectProperties(s)!
      bus.run('object:drag', { handle: 'move', dx: 40, dy: 20 })
      const p1 = objectProperties(s)!
      expect(Number(p1.horzOffset) - Number(p0.horzOffset)).toBe(40 * HU_PER_PX)
      expect(Number(p1.vertOffset) - Number(p0.vertOffset)).toBe(20 * HU_PER_PX)
      bus.run('object:drag', { handle: 'se', dx: 30, dy: 10 })
      const p2 = objectProperties(s)!
      expect([Number(p2.width), Number(p2.height)]).toEqual([Number(p0.width) + 30 * HU_PER_PX, Number(p0.height) + 10 * HU_PER_PX])
      const ref = s.object!
      const back = new Session(HwpCoreDocument.open(s.export(f)), f)
      expect(Number(objectProperties(back, ref)!.width), f).toBe(Number(p2.width))
      s.selectObject(ref)
      bus.run('edit:undo')
      expect(Number(objectProperties(s, ref)!.width)).toBe(Number(p0.width))
    }
  })

  it('a picture placed as a character resizes but does not move', () => {
    const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    const bus = new CommandBus(s)
    bus.run('insert:image', { bytes: PNG, extension: 'png', widthPx: 100, heightPx: 100 })
    s.selectObject(objectsOnPage(s, 0).find((o) => o.kind === 'picture')!)
    bus.run('object:set-properties', { props: { treatAsChar: true } })
    const p0 = objectProperties(s)!
    expect(bus.run('object:drag', { handle: 'move', dx: 50, dy: 50 })).toBeNull()
    bus.run('object:drag', { handle: 'e', dx: 20, dy: 0 })
    expect(Number(objectProperties(s)!.width)).toBe(Number(p0.width) + 20 * HU_PER_PX)
  })
})
