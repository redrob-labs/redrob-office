/**
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, constrainDraw, objectBox, type Pos, type ShapeKind } from '../src'

beforeAll(() => initHwpCoreNode())
const P = (para: number, offset = 0): Pos => ({ section: 0, para, offset })

function setup(opts: { readOnly?: boolean } = {}) {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  for (let i = 0; i < 5; i++) s.text.split(s.text.insert(P(i), `${i + 1}번째 문단`))
  const el = document.createElement('div')
  document.body.append(el)
  const tools: Array<ShapeKind | null> = []
  const view = new EditorView(el, s, new CommandBus(s), { painter: () => {}, onDrawToolChange: (t) => tools.push(t), ...opts })
  // Client coordinates are page 0's coordinates here; jsdom has no layout.
  view.pages.pageAt = (x: number, y: number) => ({ page: 0, x, y })
  return { s, view, el, tools }
}
const mouse = (type: string, x: number, y: number, extra: MouseEventInit = {}) => new MouseEvent(type, { clientX: x, clientY: y, button: 0, detail: 1, bubbles: true, ...extra })
const near = (a: number, b: number) => Math.abs(a - b) <= 1.5

describe('the drawing tool (task 2.4)', () => {
  it('arms from the ribbon command, draws with press-drag-release, then goes back to clicks', () => {
    const { s, view, el, tools } = setup()
    expect(view.bus.isEnabled('view:draw-shape', { shapeType: 'rectangle' })).toBe(true)
    view.run('view:draw-shape', { shapeType: 'rectangle' })
    expect(view.drawTool).toBe('rectangle')
    expect(el.classList.contains('hwp-drawing')).toBe(true)
    expect(view.bus.isActive('view:draw-shape')).toBe(true)
    const textBefore = s.doc.text(0, 0)

    view.onMouseDown(mouse('mousedown', 150, 120))
    view.onMouseMove(mouse('mousemove', 250, 170))
    // The outline follows the pointer; nothing is in the document yet.
    expect(s.object).toBeNull()
    view.onMouseMove(mouse('mousemove', 330, 200))
    view.onMouseUp(mouse('mouseup', 330, 200))

    const b = objectBox(s, s.object!)!
    expect([near(b.x, 150), near(b.y, 120), near(b.width, 180), near(b.height, 80)]).toEqual([true, true, true, true])
    // The press did not move the caret or select text, and the tool let go after one shape.
    expect(s.doc.text(0, 0)).toBe(textBefore)
    expect(view.drawTool).toBeNull()
    expect(el.classList.contains('hwp-drawing')).toBe(false)
    expect(tools).toEqual(['rectangle', null])
    // One undo step removes the shape.
    const o = s.object!
    view.run('edit:undo')
    expect(objectBox(s, o)).toBeNull()
  })

  it('the same button again, or Escape, disarms without drawing', () => {
    const { s, view } = setup()
    view.run('view:draw-shape', { shapeType: 'ellipse' })
    view.run('view:draw-shape', { shapeType: 'ellipse' })
    expect(view.drawTool).toBeNull()
    view.run('view:draw-shape', { shapeType: 'line' })
    view.run('view:draw-shape', { shapeType: 'rectangle' })
    expect(view.drawTool).toBe('rectangle')
    view.onMouseDown(mouse('mousedown', 100, 100))
    view.onKeyDown({ key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault: () => {} })
    expect(view.drawTool).toBeNull()
    view.onMouseUp(mouse('mouseup', 200, 200))
    expect(s.object).toBeNull()
  })

  it('Shift while drawing keeps the box square', () => {
    const { s, view } = setup()
    view.run('view:draw-shape', { shapeType: 'ellipse' })
    view.onMouseDown(mouse('mousedown', 100, 100))
    view.onMouseMove(mouse('mousemove', 260, 160, { shiftKey: true }))
    view.onMouseUp(mouse('mouseup', 260, 160, { shiftKey: true }))
    const b = objectBox(s, s.object!)!
    expect([near(b.width, 160), near(b.height, 160)]).toEqual([true, true])
  })

  it('a read-only document cannot arm the tool', () => {
    const { view } = setup({ readOnly: true })
    expect(view.bus.isEnabled('view:draw-shape', { shapeType: 'rectangle' })).toBe(false)
    view.run('view:draw-shape', { shapeType: 'rectangle' })
    expect(view.drawTool).toBeNull()
  })

  it('form mode turns drawing off', () => {
    const { view } = setup()
    view.run('view:form-mode')
    expect(view.bus.isEnabled('view:draw-shape', { shapeType: 'rectangle' })).toBe(false)
  })
})

describe('constrainDraw', () => {
  it('snaps a line to 45° and a box to a square, in any direction', () => {
    const l = { x0: 0, y0: 0, x1: 100, y1: 90 }
    constrainDraw(l, true)
    expect([Math.round(l.x1), Math.round(l.y1)]).toEqual([95, 95])
    const h = { x0: 0, y0: 0, x1: 100, y1: 8 }
    constrainDraw(h, true)
    expect([Math.round(h.x1), Math.round(h.y1)]).toEqual([100, 0])
    const r = { x0: 50, y0: 50, x1: 10, y1: 80 }
    constrainDraw(r, false)
    expect([r.x1, r.y1]).toEqual([10, 90])
  })
})
