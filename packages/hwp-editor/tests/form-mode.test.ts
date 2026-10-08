/**
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, formFields, type Pos } from '../src'

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
})
