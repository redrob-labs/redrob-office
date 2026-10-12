/**
 * @vitest-environment jsdom
 *
 * The 한글 ribbon on a real editor session (spec task 2.2): tabs, the
 * contextual 표 tab, pressed and disabled state from the command bus, and
 * buttons that change the document.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, type Pos } from '@genoffice/hwp-editor'
import { HangulRibbon, HangulSimpleToolbar, commandLabel, tabsFor } from '../src/renderer/next/HangulRibbon'
import { COMMAND_LABELS } from '../src/renderer/i18n/command-labels'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true

beforeAll(() => initHwpCoreNode())

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function editor(text = '대한민국 헌법'): EditorView {
  const doc = HwpCoreDocument.blank()
  doc.insertText(0, 0, 0, text)
  const s = new Session(doc, 'hwpx')
  const el = document.createElement('div')
  document.body.append(el)
  return new EditorView(el, s, new CommandBus(s), { painter: () => {} })
}

function render(view: EditorView, simple = false) {
  const props = { view, mac: false, readOnly: false, onRan: () => render(view, simple) }
  act(() => root.render(createElement(simple ? HangulSimpleToolbar : HangulRibbon, props)))
}

/** A button by its accessible name: aria-label, or the visible label of a large button. */
const byLabel = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.querySelector('.go-toolbar__label')?.textContent) === label) ?? null
const tab = (name: string) => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === name)!
const p = (para: number, offset: number): Pos => ({ section: 0, para, offset })

describe('Hangul ribbon', () => {
  it('shows 한글’s tabs, and 표 only while the caret is in a table', () => {
    const view = editor()
    expect(tabsFor(view)).toEqual(['edit', 'insert', 'format', 'page', 'review', 'view'])
    render(view)
    expect([...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Edit', 'Insert', 'Format', 'Page', 'Review', 'View'])
    view.run('table:create', { rows: 2, cols: 2 })
    render(view)
    expect(tabsFor(view)).toContain('table')
    act(() => tab('Table').click())
    expect(byLabel(commandLabel('table:insert-row-below', 'en'))).not.toBeNull()
  })

  it('bold at a bare caret is held for the next typing; on a selection it applies and shows pressed', () => {
    const view = editor()
    render(view)
    const label = commandLabel('format:bold', 'en')
    expect(byLabel(label)!.disabled).toBe(false)
    act(() => byLabel(label)!.click())
    render(view)
    expect(byLabel(label)!.getAttribute('aria-pressed')).toBe('true')
    expect(view.session.dirty).toBe(false)
    act(() => byLabel(label)!.click())
    view.session.select({ anchor: p(0, 0), head: p(0, 2) })
    render(view)
    act(() => byLabel(label)!.click())
    expect(view.session.text.charPropertiesAt(p(0, 0)).bold).toBe(true)
    expect(byLabel(label)!.getAttribute('aria-pressed')).toBe('true')
  })

  it('자간 and alignment buttons change the document, one undo step each', () => {
    const view = editor()
    view.session.select({ anchor: p(0, 0), head: p(0, 4) })
    render(view)
    act(() => byLabel(commandLabel('format:char-spacing-increase', 'en'))!.click())
    act(() => byLabel(commandLabel('format:align-center', 'en'))!.click())
    expect(view.session.text.charPropertiesAt(p(0, 0)).spacings).toEqual([1, 1, 1, 1, 1, 1, 1])
    expect(JSON.parse(view.session.doc.raw.getParaPropertiesAt(0, 0)).alignment).toBe('center')
    expect(byLabel(commandLabel('format:align-center', 'en'))!.getAttribute('aria-pressed')).toBe('true')
    view.run('edit:undo')
    expect(JSON.parse(view.session.doc.raw.getParaPropertiesAt(0, 0)).alignment).toBe('justify')
  })

  it('inserts a table from the size grid', () => {
    const view = editor()
    view.session.select({ anchor: p(0, 7), head: p(0, 7) })
    render(view)
    act(() => tab('Insert').click())
    act(() => byLabel(commandLabel('table:create', 'en'))!.click())
    act(() => byLabel('3 × 4 table')!.click())
    const h = view.session.selection.head
    expect(JSON.parse(view.session.doc.raw.getTableDimensions(0, h.para, h.cell!.control))).toMatchObject({ rowCount: 3, colCount: 4 })
  })

  it('zooms the view without touching the document', () => {
    const view = editor()
    render(view)
    act(() => tab('View').click())
    act(() => byLabel(commandLabel('view:zoom-in', 'en'))!.click())
    expect(view.pages.zoom).toBeGreaterThan(1)
    expect(view.session.changeSeq).toBe(0)
  })

  it('every button in a read-only view is disabled except view commands', () => {
    const view = editor()
    view.session.select({ anchor: p(0, 0), head: p(0, 2) })
    act(() => root.render(createElement(HangulRibbon, { view, mac: false, readOnly: true, onRan: () => {} })))
    expect(byLabel(commandLabel('format:bold', 'en'))!.disabled).toBe(true)
    act(() => tab('View').click())
    expect(byLabel(commandLabel('view:zoom-in', 'en'))!.disabled).toBe(false)
  })

  it('the simple toolbar carries the common commands', () => {
    const view = editor()
    render(view, true)
    for (const id of ['format:bold', 'format:italic', 'format:underline', 'format:align-left', 'format:align-center', 'format:align-right']) {
      expect(byLabel(commandLabel(id, 'en')), id).not.toBeNull()
    }
  })

  it('has Korean and English labels, without 한글’s menu mnemonics', () => {
    expect(commandLabel('format:char-ratio-increase', 'ko')).toBe('장평 늘리기')
    expect(commandLabel('edit:find', 'ko')).toBe('찾기')
    expect(commandLabel('edit:find', 'en')).toBe('Find')
    for (const [id, l] of Object.entries(COMMAND_LABELS)) {
      expect(l.ko, id).not.toMatch(/\([A-Z0-9]\)|\.\.\.$/)
      expect(l.en, id).toBeTruthy()
    }
  })
})
