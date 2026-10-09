import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, objectAt, objectBox, objectProperties, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())
const P = (para: number, offset = 0): Pos => ({ section: 0, para, offset })

/** Ten paragraphs of text, so a shape can be drawn over the middle of a page. */
function doc(format: 'hwpx' | 'hwp' = 'hwpx') {
  const s = new Session(HwpCoreDocument.blank(), format)
  for (let i = 0; i < 9; i++) s.text.split(s.text.insert(P(i), `${i + 1}번째 문단입니다.`))
  return { s, bus: new CommandBus(s) }
}
const near = (a: number, b: number) => Math.abs(a - b) <= 1.5

describe('drawing a shape by dragging (task 2.4)', () => {
  it('lands where it was drawn, in front of the text, and stays there after save', () => {
    for (const format of ['hwpx', 'hwp'] as const) {
      const { s, bus } = doc(format)
      bus.run('insert:shape-draw', { shapeType: 'rectangle', page: 0, x0: 200, y0: 180, x1: 360, y1: 260 })
      const o = s.object!
      expect(o.kind).toBe('shape')
      const b = objectBox(s, o)!
      expect([b.page, near(b.x, 200), near(b.y, 180), near(b.width, 160), near(b.height, 80)], format).toEqual([0, true, true, true, true])
      expect(objectProperties(s)).toMatchObject({ treatAsChar: false, textWrap: 'InFrontOfText', vertRelTo: 'Para', horzRelTo: 'Paper' })
      // Text is not pushed aside: the paragraphs stay on one page as before.
      expect(s.doc.pageCount()).toBe(1)
      const back = new Session(HwpCoreDocument.open(s.export(format)), format)
      const again = objectBox(back, o)!
      expect([near(again.x, 200), near(again.y, 180), near(again.width, 160), near(again.height, 80)], `${format} reopened`).toEqual([true, true, true, true])
    }
  })

  it('a drag up and to the left gives the same box', () => {
    const { s, bus } = doc()
    bus.run('insert:shape-draw', { shapeType: 'ellipse', page: 0, x0: 360, y0: 260, x1: 200, y1: 180 })
    const b = objectBox(s, s.object!)!
    expect([near(b.x, 200), near(b.y, 180), near(b.width, 160), near(b.height, 80)]).toEqual([true, true, true, true])
  })

  it('moves down with the paragraph it was drawn over', () => {
    const { s, bus } = doc()
    bus.run('insert:shape-draw', { shapeType: 'rectangle', page: 0, x0: 200, y0: 220, x1: 300, y1: 260 })
    const o = s.object!
    const before = objectBox(s, o)!.y
    // A new paragraph at the top pushes everything below it down.
    s.selectObject(null)
    s.select({ anchor: P(0), head: P(0) })
    bus.run('edit:split-paragraph')
    s.settle()
    const moved = objectBox(s, { ...o, para: o.para + 1 })!
    expect(moved.y).toBeGreaterThan(before + 5)
  })

  it('a line runs from the press to the release in either direction, and can be selected', () => {
    const { s, bus } = doc()
    bus.run('insert:shape-draw', { shapeType: 'line', page: 0, x0: 300, y0: 150, x1: 200, y1: 250 })
    const o = s.object!
    const b = objectBox(s, o)!
    expect([near(b.x, 200), near(b.y, 150), near(b.width, 100), near(b.height, 100)]).toEqual([true, true, true, true])
    const c = (JSON.parse(s.doc.raw.getPageControlLayout(0)) as { controls: Array<{ type: string; x1: number; y1: number; x2: number; y2: number }> }).controls.find((x) => x.type === 'line')!
    expect([c.x1, c.y1, c.x2, c.y2].map(Math.round)).toEqual([300, 150, 200, 250])
    // A line is an object like any other: a click on it selects it.
    expect(objectAt(s, 0, 250, 200)).toMatchObject({ kind: 'shape', para: o.para, control: o.control })
  })

  it('a horizontal line, 0 px tall, can still be clicked', () => {
    const { s, bus } = doc()
    bus.run('insert:shape-draw', { shapeType: 'line', page: 0, x0: 150, y0: 300, x1: 350, y1: 300 })
    const o = s.object!
    expect(objectBox(s, o)!.height).toBeLessThan(1)
    expect(objectAt(s, 0, 250, 302)).toMatchObject({ para: o.para, control: o.control })
    expect(objectAt(s, 0, 250, 310)).toBeNull()
  })

  it('a click without a drag places the default size there; one undo removes it', () => {
    const { s, bus } = doc()
    bus.run('insert:shape-draw', { shapeType: 'rectangle', page: 0, x0: 150, y0: 200, x1: 151, y1: 201 })
    const o = s.object!
    const b = objectBox(s, o)!
    expect([near(b.x, 150), near(b.y, 200), near(b.width, 14173 / 75), near(b.height, 7087 / 75)]).toEqual([true, true, true, true])
    bus.run('edit:undo')
    expect(objectBox(s, o)).toBeNull()
  })

  it('a text box drawn on the page floats where it was drawn', () => {
    const { s, bus } = doc()
    bus.run('insert:shape-draw', { shapeType: 'textbox', page: 0, x0: 250, y0: 300, x1: 450, y1: 360 })
    const b = objectBox(s, s.object!)!
    expect([near(b.x, 250), near(b.y, 300), near(b.width, 200), near(b.height, 60)]).toEqual([true, true, true, true])
    expect(objectProperties(s)).toMatchObject({ treatAsChar: false })
  })
})
