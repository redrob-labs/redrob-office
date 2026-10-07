import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, type Change, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

function open(text = ''): { s: Session; bus: CommandBus } {
  const doc = HwpCoreDocument.blank()
  if (text) doc.insertText(0, 0, 0, text)
  const s = new Session(doc, 'hwpx')
  const end: Pos = { section: 0, para: 0, offset: doc.paragraphLength(0, 0) }
  s.select({ anchor: end, head: end })
  return { s, bus: new CommandBus(s) }
}

const caret = (s: Session, p: Pos) => s.select({ anchor: p, head: p })
const body = (s: Session) => Array.from({ length: s.doc.paragraphCount(0) }, (_, p) => s.doc.text(0, p))

describe('typing and deleting', () => {
  it('inserts, splits on newline and deletes backward across a paragraph break', () => {
    const { s, bus } = open()
    bus.run('edit:insert-text', { text: '가나다\n라마' })
    expect(body(s)).toEqual(['가나다', '라마'])
    expect(s.selection.head).toEqual({ section: 0, para: 1, offset: 2 })
    caret(s, { section: 0, para: 1, offset: 0 })
    bus.run('edit:delete-backward')
    expect(body(s)).toEqual(['가나다라마'])
    expect(s.selection.head).toEqual({ section: 0, para: 0, offset: 3 })
  })

  it('replaces a selection when typing', () => {
    const { s, bus } = open('대한민국 정부')
    s.select({ anchor: { section: 0, para: 0, offset: 5 }, head: { section: 0, para: 0, offset: 7 } })
    bus.run('edit:insert-text', { text: '국회' })
    expect(body(s)).toEqual(['대한민국 국회'])
  })

  it('counts code points, not UTF-16 units', () => {
    const { s, bus } = open()
    bus.run('edit:insert-text', { text: 'a😀b' })
    expect(s.selection.head.offset).toBe(3)
    bus.run('edit:delete-backward')
    bus.run('edit:delete-backward')
    expect(body(s)).toEqual(['a'])
  })

  it('does nothing at the start of the document', () => {
    const { s, bus } = open('가')
    caret(s, { section: 0, para: 0, offset: 0 })
    expect(bus.run('edit:delete-backward')).toBeNull()
    expect(s.changeSeq).toBe(0)
  })
})

describe('history and dirty state', () => {
  it('one undo step per command, and undo back to the saved state clears dirty', () => {
    const { s, bus } = open('원본')
    caret(s, { section: 0, para: 0, offset: 2 })
    s.markSaved()
    expect(s.dirty).toBe(false)
    bus.run('edit:insert-text', { text: ' 수정' })
    bus.run('edit:insert-text', { text: '\n둘째' })
    expect(s.dirty).toBe(true)
    bus.run('edit:undo')
    expect(body(s)).toEqual(['원본 수정'])
    bus.run('edit:undo')
    expect(body(s)).toEqual(['원본'])
    expect(s.dirty).toBe(false)
    bus.run('edit:redo')
    expect(body(s)).toEqual(['원본 수정'])
    expect(s.dirty).toBe(true)
  })

  it('a failed command leaves the document unchanged and records nothing', () => {
    const { s } = open('그대로')
    expect(() =>
      s.edit('test:fail', () => {
        s.text.insert({ section: 0, para: 0, offset: 0 }, '앞')
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(body(s)).toEqual(['그대로'])
    expect(s.canUndo).toBe(false)
    expect(s.dirty).toBe(false)
  })

  it('a new edit clears redo', () => {
    const { s, bus } = open()
    bus.run('edit:insert-text', { text: 'a' })
    bus.run('edit:undo')
    expect(s.canRedo).toBe(true)
    bus.run('edit:insert-text', { text: 'b' })
    expect(s.canRedo).toBe(false)
  })
})

describe('change stream (E2)', () => {
  it('emits one change per command with the touched node ids and the origin', () => {
    const { s, bus } = open('하나')
    const seen: Change[] = []
    s.onChange((c) => seen.push(c))
    caret(s, { section: 0, para: 0, offset: 2 })
    const first = s.nodeAt(s.selection.head)!
    bus.run('edit:split-paragraph')
    bus.run('edit:insert-text', { text: '둘' }, 'ai')
    expect(seen.map((c) => [c.seq, c.command, c.origin])).toEqual([
      [1, 'edit:split-paragraph', 'user'],
      [2, 'edit:insert-text', 'ai'],
    ])
    const second = s.nodeAt({ section: 0, para: 1, offset: 0 })!
    expect(seen[0]!.nodes).toEqual(expect.arrayContaining([first, second]))
    expect(seen[1]!.nodes).toEqual([second])
  })
})

describe('formatting', () => {
  it('toggles bold on a selection and reports it as active', () => {
    const { s, bus } = open('굵게 할 글')
    s.select({ anchor: { section: 0, para: 0, offset: 0 }, head: { section: 0, para: 0, offset: 2 } })
    expect(bus.isActive('format:bold')).toBe(false)
    bus.run('format:bold')
    expect(bus.isActive('format:bold')).toBe(true)
    expect(s.text.charPropertiesAt({ section: 0, para: 0, offset: 3 }).bold).toBe(false)
    bus.run('format:bold')
    expect(bus.isActive('format:bold')).toBe(false)
  })

  it('is disabled with a collapsed selection', () => {
    const { bus } = open('글')
    expect(bus.isEnabled('format:bold')).toBe(false)
    expect(bus.run('format:bold')).toBeNull()
  })
})

describe('tables', () => {
  it('types, splits and deletes inside a cell, and the cell content round-trips', () => {
    const { s, bus } = open('표 앞')
    s.doc.raw.splitParagraph(0, 0, 3)
    s.doc.raw.createTable(0, 1, 0, 2, 2)
    const cell: Pos = { section: 0, para: 1, offset: 0, cell: { control: 0, cell: 3, para: 0 } }
    caret(s, cell)
    bus.run('edit:insert-text', { text: '셀\n내용' })
    expect(s.text.paragraphCount({ section: 0, cell: { host: 1, control: 0, cell: 3 } })).toBe(2)
    caret(s, { ...cell, cell: { ...cell.cell!, para: 1 }, offset: 0 })
    bus.run('edit:delete-backward')
    expect(s.text.text(cell)).toBe('셀내용')
    // Backspace at the start of a cell stays in the cell.
    caret(s, cell)
    expect(bus.run('edit:delete-backward')).toBeNull()
    const back = HwpCoreDocument.open(s.export('hwpx'))
    expect(back.raw.getTextInCell(0, 1, 0, 3, 0, 0, 3)).toBe('셀내용')
  })
})

describe('caret movement', () => {
  it('moves across paragraph breaks and extends the selection', () => {
    const { s, bus } = open('ab')
    bus.run('edit:split-paragraph')
    caret(s, { section: 0, para: 0, offset: 2 })
    bus.run('move:right')
    expect(s.selection.head).toEqual({ section: 0, para: 1, offset: 0 })
    bus.run('move:left', { extend: true })
    expect(s.selection.anchor).toEqual({ section: 0, para: 1, offset: 0 })
    expect(s.selection.head).toEqual({ section: 0, para: 0, offset: 2 })
    expect(s.text.textBetween(s.selection.anchor, s.selection.head)).toBe('\n')
  })

  it('moves down a line through the engine layout', () => {
    const { s, bus } = open('가나다라 마바사 아자차카타파하 '.repeat(8))
    caret(s, { section: 0, para: 0, offset: 3 })
    bus.run('move:down')
    expect(s.selection.head.para).toBe(0)
    expect(s.selection.head.offset).toBeGreaterThan(30)
    bus.run('move:up')
    expect(s.selection.head.offset).toBe(3)
  })

  it('select all covers the document', () => {
    const { s, bus } = open('하나')
    bus.run('edit:insert-text', { text: '\n둘' })
    bus.run('edit:select-all')
    expect(s.text.textBetween(s.selection.anchor, s.selection.head)).toBe('하나\n둘')
  })
})
