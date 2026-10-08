import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())
const B = (para: number, offset: number): Pos => ({ section: 0, para, offset })
const hfText = (s: Session, header = true) => (JSON.parse(s.doc.raw.getHeaderFooter(0, header, 0)) as { text?: string }).text ?? ''

function doc(format: 'hwpx' | 'hwp' = 'hwpx') {
  const s = new Session(HwpCoreDocument.blank(), format)
  s.text.insert(B(0, 0), '본문 첫 문단')
  return { s, bus: new CommandBus(s) }
}

describe('headers and footers (task 1.7)', () => {
  it('enters a new header, types, splits, deletes, leaves, and survives both formats', () => {
    for (const f of ['hwpx', 'hwp'] as const) {
      const { s, bus } = doc(f)
      bus.run('page:headerfooter-edit', { kind: 'header' })
      expect(s.selection.head.story?.kind).toBe('header')
      for (const ch of '계약서') bus.run('edit:insert-text', { text: ch })
      bus.run('edit:split-paragraph')
      bus.run('edit:insert-text', { text: '초안 X' })
      bus.run('edit:delete-backward')
      bus.run('edit:delete-backward')
      expect(s.text.paragraphCount({ section: 0, story: s.selection.head.story })).toBe(2)
      expect(s.text.text({ ...s.selection.head, para: 1, offset: 0 })).toBe('초안')
      // Backspace at the start of the second paragraph joins it to the first.
      s.select({ anchor: { ...s.selection.head, para: 1, offset: 0 }, head: { ...s.selection.head, para: 1, offset: 0 } })
      bus.run('edit:delete-backward')
      expect(hfText(s)).toBe('계약서초안')
      bus.run('page:headerfooter-close')
      expect(s.selection.head.story).toBeUndefined()
      // Back where the caret was in the body before entering.
      expect(s.selection.head).toEqual(B(0, 0))
      expect(s.doc.text(0, 0)).toBe('본문 첫 문단')
      const back = new Session(HwpCoreDocument.open(s.export(f)), f)
      expect(hfText(back), f).toBe('계약서초안')
    }
  })

  it('undo reverts header typing; moves stay inside the header', () => {
    const { s, bus } = doc()
    bus.run('page:headerfooter-edit', { kind: 'footer' })
    bus.run('edit:insert-text', { text: '꼬리말' })
    bus.run('move:left')
    bus.run('move:up')
    expect(s.selection.head.story?.kind).toBe('footer')
    expect(s.selection.head.offset).toBe(0)
    bus.run('edit:undo')
    expect(hfText(s, false)).toBe('')
  })

  it('selects text in a header and makes it bold', () => {
    const { s, bus } = doc()
    bus.run('page:header-create', { text: '머리말 글' })
    bus.run('page:headerfooter-edit', { kind: 'header' })
    const end = s.selection.head
    s.select({ anchor: { ...end, offset: 0 }, head: { ...end, offset: 3 } })
    expect(s.text.selectionRects(s.selection.anchor, s.selection.head).length).toBeGreaterThan(0)
    bus.run('format:bold')
    expect(s.text.charPropertiesAt({ ...end, offset: 1 }).bold).toBe(true)
    expect(s.text.charPropertiesAt({ ...end, offset: 4 }).bold).toBe(false)
  })

  it('steps to the next page’s header', () => {
    const { s, bus } = doc()
    s.select({ anchor: B(0, 3), head: B(0, 3) })
    bus.run('page:break')
    bus.run('page:header-create', { text: '머리말' })
    s.select({ anchor: B(0, 0), head: B(0, 0) })
    bus.run('page:headerfooter-edit', { kind: 'header' })
    const st = s.selection.head.story!
    expect(st.kind !== 'note' && st.page).toBe(0)
    bus.run('page:headerfooter-next')
    const st2 = s.selection.head.story!
    expect(st2.kind !== 'note' && st2.page).toBe(1)
  })
})

describe('notes (task 1.7)', () => {
  it('enters the footnote near the caret, edits it, and leaves after its marker', () => {
    for (const f of ['hwpx', 'hwp'] as const) {
      const { s, bus } = doc(f)
      s.select({ anchor: B(0, 2), head: B(0, 2) })
      bus.run('insert:footnote', { text: '각주' })
      s.select({ anchor: B(0, 3), head: B(0, 3) })
      expect(bus.isEnabled('insert:note-edit')).toBe(true)
      bus.run('insert:note-edit')
      const st = s.selection.head.story!
      expect(st.kind).toBe('note')
      const control = st.kind === 'note' ? st.control : -1
      const before = s.text.text({ ...s.selection.head, offset: 0 })
      bus.run('edit:insert-text', { text: ' 설명' })
      expect(s.text.text({ ...s.selection.head, offset: 0 })).toBe(`${before} 설명`)
      bus.run('insert:note-close')
      expect(s.selection.head.story).toBeUndefined()
      const back = new Session(HwpCoreDocument.open(s.export(f)), f)
      const info = JSON.parse(back.doc.raw.getFootnoteInfo(0, 0, control)) as { texts: string[] }
      expect(info.texts.join(''), f).toContain('설명')
    }
  })
})

describe('header and footer fields', () => {
  it('inserts page number, total pages and file name fields in a footer', () => {
    const { s, bus } = doc()
    expect(bus.isEnabled('page:insert-field-filename')).toBe(false)
    bus.run('page:headerfooter-edit', { kind: 'footer' })
    bus.run('page:insert-field-pagenum')
    bus.run('edit:insert-text', { text: ' / ' })
    bus.run('page:insert-field-totalpage')
    bus.run('edit:insert-text', { text: ' ' })
    bus.run('page:insert-field-filename')
    // Three field markers plus " / " and " ".
    const count = () => (JSON.parse(s.doc.raw.getHeaderFooterParaInfo(0, false, 0, 0)) as { charCount: number }).charCount
    expect(count()).toBe(7)
    // The page paints "1 / 1": the fields are live numbers, not text.
    expect(s.doc.pageSvg(0)).toMatch(/>1<\/text>[\s\S]*>\/<\/text>[\s\S]*>1<\/text>|1 \/ 1/)
    // On save the file name field takes the document's file name, as 한글 does.
    s.doc.raw.setFileName('계약서.hwpx')
    const back = new Session(HwpCoreDocument.open(s.export('hwpx')), 'hwpx')
    expect(hfText(back, false)).toContain('계약서')
  })
})
