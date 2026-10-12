import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, lastCreatedStyle, styleAt, styleDetail, styleList, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())
const P = (para: number, offset = 0): Pos => ({ section: 0, para, offset })

function doc(format: 'hwpx' | 'hwp' = 'hwpx') {
  const s = new Session(HwpCoreDocument.blank(), format)
  s.text.insert(P(0), '제1조(목적)')
  return { s, bus: new CommandBus(s) }
}

describe('style editor (task 2.3)', () => {
  it('creates a style with its shapes, applies it, and survives both formats', () => {
    for (const format of ['hwpx', 'hwp'] as const) {
      const { s, bus } = doc(format)
      bus.run('style:create', { name: '조항 제목', englishName: 'Article', char: { fontSize: 1400, bold: true }, para: { alignment: 'center' } })
      const id = lastCreatedStyle(s)
      const st = styleList(s).find((x) => x.id === id)!
      expect([st.name, st.englishName, st.nextStyleId]).toEqual(['조항 제목', 'Article', id])
      bus.run('format:apply-style', { styleId: id })
      expect(styleAt(s, P(0))).toBe(id)
      expect(s.text.charPropertiesAt(P(0, 1)).bold).toBe(true)
      const back = new Session(HwpCoreDocument.open(s.export(format)), format)
      const again = styleList(back).find((x) => x.name === '조항 제목')!
      expect(styleDetail(back, again.id).charProps.fontSize, format).toBe(1400)
      expect(styleAt(back, P(0)), format).toBe(again.id)
    }
  })

  it('editing a style restyles its paragraphs, as one undo step', () => {
    const { s, bus } = doc()
    bus.run('format:apply-style', { styleId: 1 })
    bus.run('style:update', { styleId: 1, char: { fontSize: 1600 }, para: { alignment: 'center' } })
    expect(s.text.charPropertiesAt(P(0, 1)).fontSize).toBe(1600)
    bus.run('edit:undo')
    expect(s.text.charPropertiesAt(P(0, 1)).fontSize).toBe(1000)
    expect(styleDetail(s, 1).charProps.fontSize).toBe(1000)
  })

  it('renames, refuses duplicate or empty names, and deletes to 바탕글', () => {
    const { s, bus } = doc()
    bus.run('style:create', { name: '별표' })
    const id = lastCreatedStyle(s)
    expect(() => bus.run('style:create', { name: '별표' })).toThrow(/already exists/)
    expect(() => bus.run('style:update', { styleId: id, name: '본문' })).toThrow(/already exists/)
    expect(() => bus.run('style:create', { name: '  ' })).toThrow(/needs a name/)
    bus.run('style:update', { styleId: id, name: '별표 제목' })
    expect(styleList(s).find((x) => x.id === id)!.name).toBe('별표 제목')
    bus.run('format:apply-style', { styleId: id })
    bus.run('style:delete', { styleId: id })
    expect(styleList(s).some((x) => x.name === '별표 제목')).toBe(false)
    expect(styleAt(s, P(0))).toBe(0)
    expect(bus.isEnabled('style:delete', { styleId: 0 })).toBe(false)
  })
})
