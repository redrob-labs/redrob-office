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
})
