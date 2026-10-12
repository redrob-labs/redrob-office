/**
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, formFieldAt, formFields, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())
const P = (offset: number): Pos => ({ section: 0, para: 0, offset })

/** "성명: [field] 주소: [field]" with two empty click-here fields. */
function form() {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  const bus = new CommandBus(s)
  s.text.insert(P(0), '성명:  주소: ')
  s.select({ anchor: P(4), head: P(4) })
  bus.run('insert:field', { guide: '이름', name: 'who' })
  const end = s.doc.text(0, 0).length
  s.select({ anchor: P(end), head: P(end) })
  bus.run('insert:field', { guide: '주소', name: 'where' })
  const el = document.createElement('div')
  document.body.append(el)
  const view = new EditorView(el, s, bus, { painter: () => {} })
  return { s, view }
}
const key = (view: EditorView, k: string, shiftKey = false) => view.onKeyDown({ key: k, ctrlKey: false, metaKey: false, shiftKey, altKey: false, preventDefault: () => {} })
const text = (s: Session) => s.doc.text(0, 0)

describe('양식 모드 (form mode, task 2.6)', () => {
  it('only the click-here fields take typing; Tab and Shift+Tab go from field to field', () => {
    const { s, view } = form()
    const before = text(s)
    expect(formFields(s)).toHaveLength(2)
    view.run('view:form-mode')
    expect(view.bus.isActive('view:form-mode')).toBe(true)
    // outside a field nothing changes
    s.select({ anchor: P(1), head: P(1) })
    view.run('edit:insert-text', { text: 'X' })
    view.run('edit:split-paragraph')
    expect(text(s)).toBe(before)
    // Tab: the first field, then the second, then back to the first
    key(view, 'Tab')
    const [f1, f2] = formFields(s)
    expect(s.selection.head.offset).toBe(f1!.start)
    view.run('edit:insert-text', { text: '홍길동' })
    expect(formFields(s)[0]!.end - formFields(s)[0]!.start).toBe(3)
    key(view, 'Tab')
    expect(s.selection.anchor.offset).toBe(formFields(s)[1]!.start)
    view.run('edit:insert-text', { text: '서울' })
    key(view, 'Tab', true)
    expect(s.selection.anchor.offset).toBe(formFields(s)[0]!.start)
    expect(f2).toBeDefined()
    // Backspace at a field's start does not reach the label before it
    const g = formFields(s)[0]!
    s.select({ anchor: { ...P(g.start) }, head: { ...P(g.start) } })
    view.run('edit:delete-backward')
    expect(text(s).startsWith('성명:')).toBe(true)
    const filled = text(s)
    expect(filled).toContain('홍길동')
    expect(filled).toContain('서울')
    // off again, editing anywhere works
    view.run('view:form-mode')
    s.select({ anchor: P(0), head: P(0) })
    view.run('edit:insert-text', { text: '1. ' })
    expect(text(s).startsWith('1. 성명')).toBe(true)
  })

  it('a form laid out in a table: Tab goes through body and cell fields in reading order, and typing stays in the field', () => {
    const { s, view } = form()
    // A 2×2 table after the body paragraph, with a field in cells 0 and 3.
    // End the paragraph with text, so the table goes after the last body field.
    s.text.insert(P(text(s).length), ' 끝')
    const end = text(s).length
    s.select({ anchor: P(end), head: P(end) })
    view.run('table:create', { rows: 2, cols: 2 })
    const h = s.selection.head
    const cell = (c: number, offset = 0): Pos => ({ section: 0, para: h.para, offset, cell: { control: h.cell!.control, cell: c, para: 0 } })
    for (const c of [3, 0]) {
      s.select({ anchor: cell(c), head: cell(c) })
      view.run('insert:field', { guide: `칸${c}`, name: `cell${c}` })
    }
    expect(formFields(s).map((f) => f.name)).toEqual(['who', 'where', 'cell0', 'cell3'])

    view.run('view:form-mode')
    s.select({ anchor: P(0), head: P(0) })
    const names: string[] = []
    for (let i = 0; i < 5; i++) {
      key(view, 'Tab')
      names.push(formFieldAt(s, s.selection.anchor)!.name)
    }
    expect(names).toEqual(['who', 'where', 'cell0', 'cell3', 'who'])

    // In the cell field typing goes in; outside it in the same cell nothing changes.
    key(view, 'Tab')
    key(view, 'Tab')
    expect(s.selection.head.cell?.cell).toBe(0)
    view.run('edit:insert-text', { text: '김철수' })
    const inCell = () => s.text.text(cell(0))
    expect(inCell()).toContain('김철수')
    const c1 = cell(1)
    s.select({ anchor: c1, head: c1 })
    view.run('edit:insert-text', { text: 'X' })
    expect(s.text.text(cell(1))).not.toContain('X')
    key(view, 'Tab', true)
    expect(s.selection.head.cell?.cell).toBe(0)
  })
})
