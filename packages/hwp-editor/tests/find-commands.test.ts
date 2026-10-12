import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, HWPUNIT_PER_MM, Session, countMatches, pageDef } from '../src'

beforeAll(() => initHwpCoreNode())

function open(): { s: Session; bus: CommandBus } {
  const doc = HwpCoreDocument.blank()
  doc.insertText(0, 0, 0, '사과 배 사과 감')
  doc.raw.splitParagraph(0, 0, 9)
  doc.insertText(0, 1, 0, '사과나무')
  const s = new Session(doc, 'hwpx')
  s.select({ anchor: { section: 0, para: 0, offset: 0 }, head: { section: 0, para: 0, offset: 0 } })
  return { s, bus: new CommandBus(s) }
}
const body = (s: Session) => [0, 1].map((p) => s.doc.text(0, p))
const sel = (s: Session) => s.text.textBetween(s.selection.anchor, s.selection.head)

describe('find and replace', () => {
  it('finds forward through paragraphs and selects each match', () => {
    const { s, bus } = open()
    expect(countMatches(s, '사과')).toBe(3)
    bus.run('edit:find-next', { query: '사과' })
    expect(s.selection.anchor).toEqual({ section: 0, para: 0, offset: 0 })
    expect(sel(s)).toBe('사과')
    bus.run('edit:find-next', { query: '사과' })
    expect(s.selection.anchor.offset).toBe(5)
    bus.run('edit:find-next', { query: '사과' })
    expect(s.selection.anchor).toEqual({ section: 0, para: 1, offset: 0 })
  })

  it('replace replaces the selected match and moves on, one undo step each', () => {
    const { s, bus } = open()
    bus.run('edit:replace', { query: '사과', replacement: '귤' }) // first press only finds
    expect(s.changeSeq).toBe(0)
    bus.run('edit:replace', { query: '사과', replacement: '귤' })
    expect(body(s)).toEqual(['귤 배 사과 감', '사과나무'])
    expect(sel(s)).toBe('사과')
    bus.run('edit:undo')
    expect(body(s)[0]).toBe('사과 배 사과 감')
  })

  it('replace all is one undo step', () => {
    const { s, bus } = open()
    bus.run('edit:replace-all', { query: '사과', replacement: '귤' })
    expect(body(s)).toEqual(['귤 배 귤 감', '귤나무'])
    expect(s.changeSeq).toBe(1)
    bus.run('edit:undo')
    expect(body(s)).toEqual(['사과 배 사과 감', '사과나무'])
    expect(bus.run('edit:replace-all', { query: '없음', replacement: 'x' })).toBeNull()
  })
})

describe('page setup', () => {
  it('sets landscape and margins as one undo step, and they survive a save', () => {
    const { s, bus } = open()
    const before = pageDef(s)
    bus.run('page:setup-apply', { props: { landscape: true, marginLeft: Math.round(20 * HWPUNIT_PER_MM) } })
    const back = HwpCoreDocument.open(s.export('hwp'))
    const def = JSON.parse(back.raw.getPageDef(0))
    expect(def.landscape).toBe(true)
    expect(Math.round(def.marginLeft / HWPUNIT_PER_MM)).toBe(20)
    expect(back.pageInfo(0).width).toBeGreaterThan(back.pageInfo(0).height)
    bus.run('edit:undo')
    expect(pageDef(s)).toEqual(before)
  })
})
