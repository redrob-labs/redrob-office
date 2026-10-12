import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, fieldAt, hyperlinkAt, hyperlinksIn, normalizeUri, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

const P = (offset: number): Pos => ({ section: 0, para: 0, offset })

function doc(text: string, format: 'hwpx' | 'hwp' = 'hwpx') {
  const s = new Session(HwpCoreDocument.blank(), format)
  s.text.insert(P(0), text)
  return { s, bus: new CommandBus(s) }
}

describe('hyperlinks (task 2.4)', () => {
  it('links the selected text, and survives a save in both formats', () => {
    for (const format of ['hwpx', 'hwp'] as const) {
      const { s, bus } = doc('레드롭 홈페이지 바로가기', format)
      s.select({ anchor: P(0), head: P(8) })
      bus.run('insert:hyperlink', { uri: 'redrob.ai' })
      expect(hyperlinkAt(s, P(3))).toMatchObject({ start: 0, end: 8, text: '레드롭 홈페이지', uri: 'https://redrob.ai/' })
      const back = new Session(HwpCoreDocument.open(s.export(format)), format)
      expect(hyperlinksIn(back, P(0)).map((l) => l.uri), format).toEqual(['https://redrob.ai/'])
      expect(back.doc.text(0, 0)).toBe('레드롭 홈페이지 바로가기')
    }
  })

  it('with nothing selected, inserts the shown text and links it as one undo step', () => {
    const { s, bus } = doc('보기: ')
    s.select({ anchor: P(4), head: P(4) })
    bus.run('insert:hyperlink', { uri: 'https://example.com/a', text: '예시' })
    expect(s.doc.text(0, 0)).toBe('보기: 예시')
    expect(hyperlinkAt(s, P(5))).toMatchObject({ start: 4, end: 6, uri: 'https://example.com/a' })
    expect(s.selection.head.offset).toBe(6)
    bus.run('edit:undo')
    expect(s.doc.text(0, 0)).toBe('보기: ')
    expect(hyperlinksIn(s, P(0))).toEqual([])
  })

  it('edits the address and text, and removes the link keeping the text', () => {
    const { s, bus } = doc('링크 문장')
    s.select({ anchor: P(0), head: P(2) })
    bus.run('insert:hyperlink', { uri: 'https://a.example' })
    s.select({ anchor: P(1), head: P(1) })
    bus.run('hyperlink:edit', { uri: 'https://b.example', text: '새 링크' })
    expect(hyperlinkAt(s, P(1))).toMatchObject({ text: '새 링크', uri: 'https://b.example/' })
    expect(s.doc.text(0, 0)).toBe('새 링크 문장')
    bus.run('hyperlink:remove')
    expect(hyperlinksIn(s, P(0))).toEqual([])
    expect(s.doc.text(0, 0)).toBe('새 링크 문장')
  })

  it('accepts only web and mail addresses', () => {
    expect(normalizeUri('redrob.ai/docs')).toBe('https://redrob.ai/docs')
    expect(normalizeUri('mailto:help@redrob.ai')).toBe('mailto:help@redrob.ai')
    expect(normalizeUri('file:///C:/Windows/system32/cmd.exe')).toBeNull()
    expect(normalizeUri('javascript:alert(1)')).toBeNull()
    expect(normalizeUri('  ')).toBeNull()
    const { s, bus } = doc('글')
    s.select({ anchor: P(0), head: P(1) })
    expect(() => bus.run('insert:hyperlink', { uri: 'file:///etc/passwd' })).toThrow(/web address/)
    expect(hyperlinksIn(s, P(0))).toEqual([])
  })
})

describe('누름틀 fields (task 2.4)', () => {
  it('inserts a click-here field with its guide, survives both formats, and removes', () => {
    for (const format of ['hwpx', 'hwp'] as const) {
      const { s, bus } = doc('성명: ', format)
      s.select({ anchor: P(4), head: P(4) })
      bus.run('insert:field', { guide: '이름을 입력하세요', memo: '본인 성명', name: 'applicant' })
      const f = fieldAt(s, P(4))!
      expect([f.fieldType, f.guide, f.name]).toEqual(['clickhere', '이름을 입력하세요', 'applicant'])
      const back = new Session(HwpCoreDocument.open(s.export(format)), format)
      expect(fieldAt(back, P(4))?.guide, format).toBe('이름을 입력하세요')
      s.select({ anchor: P(4), head: P(4) })
      bus.run('field:remove')
      expect(fieldAt(s, P(4))).toBeNull()
    }
  })

  it('removing a filled field keeps what was typed as plain text, in one undo step', () => {
    const { s, bus } = doc('성명: ')
    s.select({ anchor: P(4), head: P(4) })
    bus.run('insert:field', { guide: '이름', name: 'who' })
    bus.run('field:edit-apply', { value: '홍길동' })
    s.select({ anchor: P(5), head: P(5) })
    bus.run('field:remove')
    expect(s.doc.text(0, 0)).toBe('성명: 홍길동')
    expect(fieldAt(s, P(5))).toBeNull()
    bus.run('edit:undo')
    expect(fieldAt(s, P(5))).toMatchObject({ name: 'who', value: '홍길동' })
  })
})

describe('fields and links in table cells', () => {
  /** A 2×2 table after the body text, with '성명: ' typed in the first cell; the caret ends there. */
  function table(format: 'hwpx' | 'hwp' = 'hwpx') {
    const d = doc('신청서', format)
    d.s.select({ anchor: P(3), head: P(3) })
    d.bus.run('table:create', { rows: 2, cols: 2 })
    const h = d.s.selection.head
    const cell = (c: number, offset: number): Pos => ({ section: 0, para: h.para, offset, cell: { control: h.cell!.control, cell: c, para: 0 } })
    d.s.text.insert(cell(0, 0), '성명: ')
    return { ...d, cell }
  }
  const cellText = (s: Session, c: Pos) => s.text.text({ ...c, offset: 0 })

  it('inserts a 누름틀 in a cell, finds it, fills it and removes it, in both formats', () => {
    for (const format of ['hwpx', 'hwp'] as const) {
      const { s, bus, cell } = table(format)
      s.select({ anchor: cell(0, 4), head: cell(0, 4) })
      expect(bus.isEnabled('insert:field', { guide: '이름' })).toBe(true)
      bus.run('insert:field', { guide: '이름', name: 'who' })
      const f = fieldAt(s, cell(0, 4))
      expect(f, format).toMatchObject({ name: 'who', guide: '이름', cell: { cell: 0, para: 0 } })
      // Not reported for the same offset in the body or in another cell.
      expect(fieldAt(s, P(3))).toBeNull()
      expect(fieldAt(s, cell(1, 0))).toBeNull()

      s.select({ anchor: cell(0, 4), head: cell(0, 4) })
      bus.run('field:edit-apply', { value: '홍길동' })
      expect(cellText(s, cell(0, 0)), format).toContain('홍길동')

      const back = new Session(HwpCoreDocument.open(s.export(format)), format)
      expect(fieldAt(back, cell(0, 5)), `${format} reopened`).toMatchObject({ name: 'who' })

      s.select({ anchor: cell(0, 5), head: cell(0, 5) })
      expect(bus.isEnabled('field:remove')).toBe(true)
      bus.run('field:remove')
      expect(fieldAt(s, cell(0, 5))).toBeNull()
      expect(cellText(s, cell(0, 0)), 'typed text stays').toBe('성명: 홍길동')
      bus.run('edit:undo')
      expect(fieldAt(s, cell(0, 5)), 'undo brings the field back').toMatchObject({ name: 'who' })
    }
  })

  it('links text in a cell, edits and removes the link, and keeps it through save', () => {
    for (const format of ['hwpx', 'hwp'] as const) {
      const { s, bus, cell } = table(format)
      s.select({ anchor: cell(0, 0), head: cell(0, 2) })
      expect(bus.isEnabled('insert:hyperlink', { uri: 'x' })).toBe(true)
      bus.run('insert:hyperlink', { uri: 'redrob.ai' })
      expect(hyperlinkAt(s, cell(0, 1)), format).toMatchObject({ start: 0, end: 2, text: '성명', uri: 'https://redrob.ai/' })
      expect(hyperlinksIn(s, P(0)), 'not in the body').toEqual([])

      const back = new Session(HwpCoreDocument.open(s.export(format)), format)
      expect(hyperlinksIn(back, cell(0, 0)).map((l) => l.uri), `${format} reopened`).toEqual(['https://redrob.ai/'])

      s.select({ anchor: cell(0, 1), head: cell(0, 1) })
      bus.run('hyperlink:edit', { uri: 'https://example.com/' })
      expect(hyperlinkAt(s, cell(0, 1))?.uri).toBe('https://example.com/')
      bus.run('hyperlink:remove')
      expect(hyperlinkAt(s, cell(0, 1))).toBeNull()
      expect(cellText(s, cell(0, 0)).startsWith('성명: ')).toBe(true)
    }
  })

  it('does not link across two cells or two paragraphs of a cell', () => {
    const { s, bus, cell } = table()
    s.select({ anchor: cell(0, 0), head: cell(1, 0) })
    expect(bus.isEnabled('insert:hyperlink', { uri: 'x' })).toBe(false)
    s.select({ anchor: cell(0, 0), head: { ...cell(0, 0), cell: { ...cell(0, 0).cell!, para: 1 } } })
    expect(bus.isEnabled('insert:hyperlink', { uri: 'x' })).toBe(false)
  })
})
