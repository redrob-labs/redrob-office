// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, fromEngine, objectBox, tableAt } from '../src'

beforeAll(() => initHwpCoreNode())

function withTextBox(format: 'hwpx' | 'hwp' = 'hwpx') {
  const s = new Session(HwpCoreDocument.blank(), format)
  const bus = new CommandBus(s)
  bus.run('insert:shape', { shapeType: 'textbox' })
  const o = s.object!
  const b = objectBox(s, o)!
  const at = fromEngine(s.doc.hitTest(b.page, b.x + 10, b.y + 10))
  s.select({ anchor: at, head: at })
  return { s, bus, o, at }
}

describe('editing inside a text box (task 1.7)', () => {
  it('a click inside places the caret in the box’s text, not a table', () => {
    const { s, at } = withTextBox()
    expect(at.cell?.textBox).toBe(true)
    expect(tableAt(s)).toBeNull()
  })

  it('types, splits, deletes and undoes in the box, and survives both formats', () => {
    for (const f of ['hwpx', 'hwp'] as const) {
      const { s, bus, o } = withTextBox(f)
      for (const ch of '글상자 안') bus.run('edit:insert-text', { text: ch })
      bus.run('edit:split-paragraph')
      bus.run('edit:insert-text', { text: '둘째 줄' })
      const p0 = { section: 0, para: o.para, offset: 0, cell: { control: o.control, cell: 0, para: 0, textBox: true } }
      const p1 = { ...p0, cell: { ...p0.cell, para: 1 } }
      expect([s.text.text(p0), s.text.text(p1)]).toEqual(['글상자 안', '둘째 줄'])
      bus.run('edit:delete-backward')
      expect(s.text.text(p1)).toBe('둘째 ')
      const back = new Session(HwpCoreDocument.open(s.export(f)), f)
      expect(back.text.text(p0), f).toBe('글상자 안')
      bus.run('edit:undo')
      expect(s.text.text(p1)).toBe('둘째 줄')
    }
  })

  it('table commands stay off in a text box', () => {
    const { bus } = withTextBox()
    expect(bus.isEnabled('table:insert-row-below')).toBe(false)
    expect(bus.isEnabled('table:set-properties', { props: {} })).toBe(false)
  })
})
