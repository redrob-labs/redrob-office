/**
 * @vitest-environment jsdom
 *
 * 글자 모양 / 문단 모양 dialogs (spec task 2.3) on a real session: the units
 * match the engine, applying writes only what changed as one undo step, and
 * the result survives a save.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, type Pos } from '@genoffice/hwp-editor'
import { CharShapeDialog, ParaShapeDialog } from '../src/renderer/next/ShapeDialogs'
import { lineSpacingToEngine, paraLengthToEngine, pxToPt, setPerScript } from '../src/renderer/next/shape-units'

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
  document.body.innerHTML = ''
})

const p = (para: number, offset: number): Pos => ({ section: 0, para, offset })

function editor(text = '대한민국 헌법 제1조'): EditorView {
  const doc = HwpCoreDocument.blank()
  doc.insertText(0, 0, 0, text)
  const s = new Session(doc, 'hwpx')
  const el = document.createElement('div')
  document.body.append(el)
  return new EditorView(el, s, new CommandBus(s), { painter: () => {} })
}

/** Set a controlled React input's value the way a person typing would. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function field(label: string): HTMLInputElement {
  const el = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(label))
  const id = el?.getAttribute('for')
  const input = (id ? document.getElementById(id) : el?.querySelector('input')) as HTMLInputElement | null
  if (!input) throw new Error(`no field "${label}"; labels: ${[...document.querySelectorAll('label')].map((l) => l.textContent).join(' | ')}`)
  return input
}

const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!

describe('units measured against the engine', () => {
  it('converts dialog points to the engine’s write units', () => {
    const d = HwpCoreDocument.blank()
    d.insertText(0, 0, 0, '가')
    d.raw.applyParaFormat(0, 0, JSON.stringify({ marginLeft: paraLengthToEngine('marginLeft', 10), spacingBefore: paraLengthToEngine('spacingBefore', 10) }))
    const props = d.paraPropertiesAt(0, 0)
    expect(pxToPt(props.marginLeft)).toBe(10)
    expect(pxToPt(props.spacingBefore)).toBe(10)
    d.raw.applyParaFormat(0, 0, JSON.stringify({ lineSpacingType: 'Fixed', lineSpacing: lineSpacingToEngine('Fixed', 12) }))
    expect(pxToPt(d.paraPropertiesAt(0, 0).lineSpacing)).toBe(12)
  })

  it('sets one script or all of them', () => {
    expect(setPerScript([100, 100, 100, 100, 100, 100, 100], 0, 90)).toEqual([90, 100, 100, 100, 100, 100, 100])
    expect(setPerScript([100, 100, 100, 100, 100, 100, 100], 'all', 90)).toEqual([90, 90, 90, 90, 90, 90, 90])
  })
})

describe('글자 모양', () => {
  it('applies size, 장평, 자간 and attributes as one undo step, and they survive a save', () => {
    const view = editor()
    view.session.select({ anchor: p(0, 0), head: p(0, 4) })
    let closed = false
    act(() => root.render(createElement(CharShapeDialog, { view, onClose: () => (closed = true), onApplied: () => {} })))
    type(field('Base size'), '14')
    type(field('Width'), '90')
    type(field('Spacing'), '-5')
    act(() => (field('Superscript') as HTMLInputElement).click())
    act(() => button('Apply').click())
    expect(closed).toBe(true)
    const back = HwpCoreDocument.open(view.session.export('hwpx'))
    const c = back.charPropertiesAt(0, 0, 0)
    expect(c.fontSize).toBe(1400)
    expect(c.ratios).toEqual([90, 90, 90, 90, 90, 90, 90])
    expect(c.spacings).toEqual([-5, -5, -5, -5, -5, -5, -5])
    expect(c.superscript).toBe(true)
    expect(back.charPropertiesAt(0, 0, 6).fontSize).toBe(1000) // outside the selection
    expect(view.session.changeSeq).toBe(1)
    view.run('edit:undo')
    expect(view.session.text.charPropertiesAt(p(0, 0)).fontSize).toBe(1000)
  })

  it('changes nothing when nothing was changed', () => {
    const view = editor()
    view.session.select({ anchor: p(0, 0), head: p(0, 2) })
    act(() => root.render(createElement(CharShapeDialog, { view, onClose: () => {}, onApplied: () => {} })))
    act(() => button('Apply').click())
    expect(view.session.changeSeq).toBe(0)
  })
})

describe('문단 모양', () => {
  it('applies margins, indent, spacing and pagination options in points', () => {
    const view = editor()
    act(() => root.render(createElement(ParaShapeDialog, { view, onClose: () => {}, onApplied: () => {} })))
    type(field('Left margin'), '20')
    type(field('First line'), '10')
    type(field('Space before'), '6')
    type(field('Value'), '200')
    act(() => (field('Keep with next') as HTMLInputElement).click())
    act(() => button('Apply').click())
    const back = HwpCoreDocument.open(view.session.export('hwpx')).paraPropertiesAt(0, 0)
    expect(pxToPt(back.marginLeft)).toBe(20)
    expect(pxToPt(back.indent)).toBe(10)
    expect(pxToPt(back.spacingBefore)).toBe(6)
    expect(back.lineSpacing).toBe(200)
    expect(back.keepWithNext).toBe(true)
    expect(view.session.changeSeq).toBe(1)
  })
})
