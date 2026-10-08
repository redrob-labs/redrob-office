// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, cellProperties, objectProperties, styleAt, styleList, tableCells, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

const P = (para: number, offset = 0): Pos => ({ section: 0, para, offset })
const para = (s: Session, i = 0) => JSON.parse(s.doc.raw.getParaPropertiesAt(0, i)) as { headType: string; numberingId: number }

function doc(text = '첫째 항목', format: 'hwpx' | 'hwp' = 'hwpx') {
  const s = new Session(HwpCoreDocument.blank(), format)
  s.text.insert(P(0), text)
  return { s, bus: new CommandBus(s) }
}

function inTable(rows = 3, cols = 2) {
  const { s, bus } = doc()
  bus.run('table:create', { rows, cols })
  const h = s.selection.head
  const t = { section: 0, host: h.para, control: h.cell!.control }
  const at = (cell: number): Pos => ({ section: 0, para: t.host, offset: 0, cell: { control: t.control, cell, para: 0 } })
  return { s, bus, t, at }
}

describe('numbering, bullets and outline levels', () => {
  it('toggles numbering and bullets, survives both formats, undoes', () => {
    for (const format of ['hwpx', 'hwp'] as const) {
      const { s, bus } = doc('항목', format)
      bus.run('format:toggle-numbering')
      expect(para(s).headType).toBe('Number')
      expect(bus.isActive('format:toggle-numbering')).toBe(true)
      const back = new Session(HwpCoreDocument.open(s.export(format)), format)
      expect(para(back).headType, format).toBe('Number')
      bus.run('format:toggle-numbering')
      expect(para(s).headType).toBe('None')
      bus.run('format:toggle-bullet')
      expect(para(s).headType).toBe('Bullet')
      bus.run('edit:undo')
      expect(para(s).headType).toBe('None')
    }
  })

  it('moves between 개요 levels and stops at the ends', () => {
    const { s, bus } = doc()
    const outline = (n: number) => styleList(s).find((x) => x.name === `개요 ${n}`)!.id
    expect(bus.isEnabled('format:level-decrease')).toBe(false)
    bus.run('format:apply-style', { styleId: outline(1) })
    expect(bus.isEnabled('format:level-increase')).toBe(false)
    bus.run('format:level-decrease')
    expect(styleAt(s)).toBe(outline(2))
    bus.run('format:level-increase')
    expect(styleAt(s)).toBe(outline(1))
  })
})

describe('columns and header/footer', () => {
  it('sets one, two and three columns as undoable edits', () => {
    const { s, bus } = doc()
    const cols = () => (JSON.parse(s.doc.raw.getColumnDef(0)) as { columnCount: number }).columnCount
    bus.run('page:col-2')
    expect(cols()).toBe(2)
    expect(bus.isActive('page:col-2')).toBe(true)
    bus.run('page:col-3')
    expect(cols()).toBe(3)
    const back = new Session(HwpCoreDocument.open(s.export('hwp')), 'hwp')
    expect((JSON.parse(back.doc.raw.getColumnDef(0)) as { columnCount: number }).columnCount).toBe(3)
    bus.run('edit:undo')
    expect(cols()).toBe(2)
    bus.run('page:col-1')
    expect(cols()).toBe(1)
  })

  it('deletes the section’s header and footer', () => {
    const { s, bus } = doc()
    bus.run('page:header-create', { text: '머리말' })
    bus.run('page:footer-create', { text: '꼬리말' })
    const has = (header: boolean) => (JSON.parse(s.doc.raw.getHeaderFooter(0, header, 0)) as { exists: boolean }).exists
    expect([has(true), has(false)]).toEqual([true, true])
    bus.run('page:headerfooter-delete')
    expect([has(true), has(false)]).toEqual([false, false])
    bus.run('edit:undo')
    expect([has(true), has(false)]).toEqual([true, true])
  })
})

describe('table structure', () => {
  it('splits a table at the caret’s row and attaches it back', () => {
    const { s, bus, at } = inTable(4, 2)
    expect(bus.isEnabled('table:split')).toBe(false)
    s.select({ anchor: at(4), head: at(4) })
    bus.run('table:split')
    const h = s.selection.head
    const first = { section: 0, host: at(0).para, control: at(0).cell!.control }
    expect(tableCells(s, first)).toHaveLength(4)
    expect(h.para).not.toBe(first.host)
    s.select({ anchor: at(0), head: at(0) })
    bus.run('table:attach')
    expect(tableCells(s, first)).toHaveLength(8)
  })

  it('splits a merged cell back, and a plain cell into two', () => {
    const { s, bus, t, at } = inTable(2, 2)
    s.select({ anchor: at(0), head: at(1) })
    bus.run('table:cell-merge')
    expect(tableCells(s, t)).toHaveLength(3)
    s.select({ anchor: at(0), head: at(0) })
    bus.run('table:cell-split')
    expect(tableCells(s, t)).toHaveLength(4)
    bus.run('table:cell-split')
    expect(tableCells(s, t)).toHaveLength(5)
  })

  it('distributes heights evenly over the selected cells', () => {
    const { s, bus, at } = inTable(2, 1)
    s.select({ anchor: at(0), head: at(0) })
    bus.run('table:cell-set-properties', { props: { height: 4000 } })
    s.select({ anchor: at(0), head: at(1) })
    bus.run('table:cell-height-equal')
    const [a, b] = [cellProperties(s, 0)!.height, cellProperties(s, 1)!.height].map(Number)
    expect(Math.abs(a! - b!)).toBeLessThanOrEqual(1)
  })

  it('writes a formula result and a block sum', () => {
    const { s, bus, at } = inTable(3, 2)
    s.text.insert(at(0), '2')
    s.text.insert(at(2), '5')
    s.select({ anchor: at(1), head: at(1) })
    bus.run('table:formula', { formula: 'A1*10' })
    expect(s.text.text(at(1))).toBe('20')
    s.select({ anchor: at(0), head: at(2) })
    bus.run('table:block-formula')
    expect(s.text.text(at(4))).toBe('7')
  })

  it('toggles a table caption', () => {
    const { s, bus, t } = inTable()
    bus.run('table:caption-toggle')
    expect(JSON.parse(s.doc.raw.getTableProperties(0, t.host, t.control)).hasCaption).toBe(true)
    bus.run('table:caption-toggle')
    expect(JSON.parse(s.doc.raw.getTableProperties(0, t.host, t.control)).hasCaption).toBe(false)
  })
})

describe('objects, delete and memos', () => {
  it('rotates and flips the selected shape; inserts a text box', () => {
    const { s, bus } = doc()
    bus.run('insert:shape', { shapeType: 'rectangle' })
    bus.run('insert:rotate-cw')
    expect(objectProperties(s)!.rotationAngle).toBe(90)
    bus.run('insert:rotate-ccw')
    bus.run('insert:rotate-ccw')
    expect(objectProperties(s)!.rotationAngle).toBe(270)
    bus.run('insert:flip-horz')
    expect(objectProperties(s)!.horzFlip).toBe(true)
    s.select(s.selection)
    bus.run('insert:textbox')
    expect(s.object?.kind).toBe('shape')
    expect(objectProperties(s)!.tbMarginLeft).toBeDefined()
  })

  it('edit:delete removes the selection', () => {
    const { s, bus } = doc('가나다라')
    s.select({ anchor: P(0, 1), head: P(0, 3) })
    bus.run('edit:delete')
    expect(s.doc.text(0, 0)).toBe('가라')
  })

  it('moves between memos and deletes the one at the caret', () => {
    const { s, bus } = doc('하나 둘 셋 넷')
    s.doc.addMemo({ section: 0, para: 0, cellPath: [] }, 0, 2, '갑', '첫 메모')
    s.doc.addMemo({ section: 0, para: 0, cellPath: [] }, 5, 6, '을', '둘째 메모')
    s.select({ anchor: P(0, 0), head: P(0, 0) })
    bus.run('review:memo-next')
    expect(s.selection.head.offset).toBe(5)
    expect(bus.isEnabled('review:memo-next')).toBe(false)
    bus.run('review:memo-previous')
    expect(s.selection.head.offset).toBe(0)
    bus.run('review:memo-delete')
    expect(s.doc.memos()).toHaveLength(1)
    bus.run('edit:undo')
    expect(s.doc.memos()).toHaveLength(2)
  })
})

describe('display toggles', () => {
  it('paragraph marks, control codes and transparent borders change no bytes and no history', () => {
    const { s, bus } = doc()
    new EditorView(document.createElement('div'), s, bus, { painter: () => {} })
    const seq = s.changeSeq
    for (const id of ['view:para-mark', 'view:ctrl-mark', 'view:border-transparent']) {
      expect(bus.isActive(id)).toBe(false)
      bus.run(id)
      expect(bus.isActive(id)).toBe(true)
    }
    expect(s.changeSeq).toBe(seq)
    expect(s.canUndo).toBe(false)
  })
})

describe('format painter, outline, pages and table numbers', () => {
  it('copies the shape at the caret and pastes it onto a selection, as one undo step', () => {
    const { s, bus } = doc('굵게 보통')
    s.select({ anchor: P(0, 0), head: P(0, 2) })
    bus.run('format:bold')
    s.select({ anchor: P(0, 1), head: P(0, 1) })
    bus.run('edit:format-copy')
    expect(bus.isEnabled('edit:format-paste')).toBe(true)
    s.select({ anchor: P(0, 3), head: P(0, 5) })
    bus.run('edit:format-paste')
    expect(s.text.charPropertiesAt(P(0, 4)).bold).toBe(true)
    bus.run('edit:undo')
    expect(s.text.charPropertiesAt(P(0, 4)).bold).toBe(false)
  })

  it('toggles the character outline', () => {
    const { s, bus } = doc('외곽선')
    s.select({ anchor: P(0, 0), head: P(0, 3) })
    bus.run('format:outline')
    expect(bus.isActive('format:outline')).toBe(true)
    expect(Number(s.text.charPropertiesAt(P(0, 1)).outlineType)).not.toBe(0)
    bus.run('format:outline')
    expect(Number(s.text.charPropertiesAt(P(0, 1)).outlineType)).toBe(0)
  })

  it('goes to a page, restarts page numbers and inserts page-number fields', () => {
    const { s, bus } = doc('첫 쪽')
    s.select({ anchor: P(0, 3), head: P(0, 3) })
    bus.run('page:break')
    s.text.insert(s.selection.head, '둘째 쪽')
    expect(s.doc.pageCount()).toBe(2)
    bus.run('edit:goto-page', { page: 2 })
    expect(s.text.cursorRect(s.selection.head).pageIndex).toBe(1)
    bus.run('edit:goto-page', { page: 1 })
    expect(s.text.cursorRect(s.selection.head).pageIndex).toBe(0)
    bus.run('edit:goto-page', { page: 2 })
    bus.run('page:new-page-num', { start: 7 })
    expect(s.doc.pageInfo(1).pageNumber).toBe(7)
    bus.run('page:insert-field-pagenum')
    bus.run('page:insert-field-totalpage')
    const back = new Session(HwpCoreDocument.open(s.export('hwpx')), 'hwpx')
    expect(back.doc.pageInfo(1).pageNumber).toBe(7)
  })

  it('adds and removes thousands separators in the selected cells', () => {
    const { s, bus, at } = inTable(2, 1)
    s.text.insert(at(0), '1234567.5')
    s.text.insert(at(1), '-98765')
    s.select({ anchor: at(0), head: at(1) })
    bus.run('table:thousand-sep')
    expect([s.text.text(at(0)), s.text.text(at(1))]).toEqual(['1,234,567.5', '-98,765'])
    bus.run('table:decimal-remove')
    expect([s.text.text(at(0)), s.text.text(at(1))]).toEqual(['1234567.5', '-98765'])
  })

  it('zoom-set sets the view zoom', () => {
    const { s, bus } = doc()
    const v = new EditorView(document.createElement('div'), s, bus, { painter: () => {} })
    bus.run('view:zoom-set', { percent: 150 })
    expect(v.pages.zoom).toBe(1.5)
  })
})
