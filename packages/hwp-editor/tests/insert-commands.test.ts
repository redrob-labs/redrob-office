import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, bookmarks, pictureSize, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

const PNG_1PX = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

function open(text = '본문 텍스트'): { s: Session; bus: CommandBus } {
  const doc = HwpCoreDocument.blank()
  doc.insertText(0, 0, 0, text)
  const s = new Session(doc, 'hwpx')
  const end: Pos = { section: 0, para: 0, offset: 2 }
  s.select({ anchor: end, head: end })
  return { s, bus: new CommandBus(s) }
}

const kinds = (d: HwpCoreDocument) => (d.outline().sections[0]!.paragraphs[0]!.controls ?? []).map((c) => c.kind)
const reopen = (s: Session, fmt: 'hwp' | 'hwpx' = 'hwpx') => HwpCoreDocument.open(s.export(fmt))

describe('insert flows (task 2.4)', () => {
  it('footnote with text survives both formats', () => {
    const { s, bus } = open()
    bus.run('insert:footnote', { text: '각주 내용' })
    for (const fmt of ['hwp', 'hwpx'] as const) {
      const back = reopen(s, fmt)
      const fn = back.outline().sections[0]!.paragraphs[0]!.controls!.find((c) => c.kind === 'footnote')!
      expect(fn.paragraphs![0]!.preview).toContain('각주 내용')
    }
    expect(s.selection.head.offset).toBe(3)
  })

  it('endnote and equation', () => {
    const { s, bus } = open()
    bus.run('insert:endnote')
    bus.run('insert:equation', { script: 'a over b' })
    expect(kinds(reopen(s))).toEqual(expect.arrayContaining(['endnote', 'equation']))
    expect(bus.run('insert:equation', { script: '  ' })).toBeNull()
  })

  it('picture sized at 96 dpi and shrunk to the body width', () => {
    const { s, bus } = open()
    expect(pictureSize(s, 96, 48)).toEqual({ width: 7200, height: 3600 })
    const huge = pictureSize(s, 4000, 2000)
    const def = JSON.parse(s.doc.raw.getPageDef(0))
    expect(huge.width).toBe(def.width - def.marginLeft - def.marginRight)
    bus.run('insert:image', { bytes: PNG_1PX, extension: 'png', widthPx: 96, heightPx: 48 })
    expect(kinds(reopen(s))).toContain('picture')
    expect(kinds(reopen(s, 'hwp'))).toContain('picture')
  })

  it('bookmark by name', () => {
    const { s, bus } = open()
    bus.run('insert:bookmark', { name: '제1조' })
    expect(bookmarks(s).map((b) => b.name)).toEqual(['제1조'])
    expect(JSON.parse(reopen(s).raw.getBookmarks()).map((b: { name: string }) => b.name)).toEqual(['제1조'])
  })

  it('header and footer are created once and appended to', () => {
    const { s, bus } = open()
    bus.run('page:header-create', { text: '기관명' })
    bus.run('page:header-create', { text: ' 문서번호' })
    bus.run('page:footer-create', { text: '- 1 -' })
    const back = reopen(s)
    expect(JSON.parse(back.raw.getHeaderFooter(0, true, 0)).text).toBe('기관명 문서번호')
    expect(JSON.parse(back.raw.getHeaderFooter(0, false, 0)).text).toBe('- 1 -')
  })

  it('each insert is one undo step, and inserts need a body caret', () => {
    const { s, bus } = open()
    bus.run('insert:footnote')
    bus.run('edit:undo')
    expect(kinds(s.doc)).not.toContain('footnote')
    bus.run('table:create', { rows: 1, cols: 1 })
    expect(bus.isEnabled('insert:footnote')).toBe(false)
  })
})
