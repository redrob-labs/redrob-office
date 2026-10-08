/**
 * @vitest-environment jsdom
 *
 * Accessibility and locale pass over the owned editor's chrome (spec task 2.5).
 * Every surface is rendered on a real session in English and Korean and checked
 * for the rules that matter for a keyboard and screen-reader user:
 *
 * - every button and field has an accessible name (text, label, aria-label,
 *   aria-labelledby or title), and every aria-labelledby/for target exists;
 * - a dialog is named and modal; a tab list has selected state; a toolbar is named;
 * - ids are unique, so labels point at one control;
 * - in Korean, no English words remain in visible text or accessible names
 *   (units, font names, file extensions and the product name excepted).
 *
 * The string tables are checked too: en and ko carry the same keys, the same
 * {placeholders}, and no empty values.
 */
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Lang } from '@genoffice/i18n'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, objectsOnPage, type Pos } from '@genoffice/hwp-editor'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { strings } from '../src/renderer/i18n/strings'
import { HangulRibbon, HangulSimpleToolbar, type RibbonTab } from '../src/renderer/next/HangulRibbon'
import { CharShapeDialog, ParaShapeDialog } from '../src/renderer/next/ShapeDialogs'
import { FindDialog, PageSetupDialog } from '../src/renderer/next/FindPageDialogs'
import { InsertPromptDialog, type InsertKind } from '../src/renderer/next/InsertDialogs'
import { TableCellDialog } from '../src/renderer/next/TableDialogs'
import { ObjectPropertiesDialog } from '../src/renderer/next/ObjectDialogs'
import { ClickHereDialog, HyperlinkDialog } from '../src/renderer/next/FieldDialogs'
import { StyleDialog } from '../src/renderer/next/StyleDialog'
import { ChartDialog } from '../src/renderer/next/ChartDialog'
import { AboutDialog, PageHideDialog } from '../src/renderer/next/InfoDialogs'
import * as More from '../src/renderer/next/MoreDialogs'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true
;(window as unknown as { hangulApi: unknown }).hangulApi = { onLanguageChanged: () => () => {} }

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
  document.body.innerHTML = ''
})

const P = (offset: number): Pos => ({ section: 0, para: 0, offset })
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))

function editor(setup?: (s: Session, bus: CommandBus) => void): EditorView {
  const doc = HwpCoreDocument.blank()
  doc.insertText(0, 0, 0, '대한민국 헌법 제1조')
  const s = new Session(doc, 'hwpx')
  const bus = new CommandBus(s)
  setup?.(s, bus)
  const el = document.createElement('div')
  document.body.append(el)
  return new EditorView(el, s, bus, { painter: () => {}, inputLabel: '문서 본문' })
}

function render(lang: Lang, node: ReactElement): void {
  act(() => root.render(createElement(LocaleProvider, { initial: lang, children: node })))
}

const noop = () => {}

/** Every surface, built fresh on its own session. */
const SURFACES: Array<[string, () => ReactElement]> = [
  ...(['edit', 'insert', 'format', 'page', 'review', 'view'] as RibbonTab[]).map(
    (tab) => [`ribbon ${tab}`, () => createElement(RibbonAt, { tab, view: editor() })] as [string, () => ReactElement],
  ),
  ['ribbon table', () => createElement(RibbonAt, { tab: 'table', view: editor((s, bus) => bus.run('table:create', { rows: 2, cols: 2 })) })],
  ['ribbon object', () => createElement(RibbonAt, { tab: 'object', view: editor((s, bus) => bus.run('insert:shape', { shapeType: 'rectangle' })) })],
  ['simple toolbar', () => createElement(HangulSimpleToolbar, { view: editor(), mac: false, readOnly: false, onRan: noop, onCommand: noop })],
  ['char shape', () => createElement(CharShapeDialog, { view: editor(), onClose: noop, onApplied: noop })],
  ['para shape', () => createElement(ParaShapeDialog, { view: editor(), onClose: noop, onApplied: noop })],
  ['find', () => createElement(FindDialog, { view: editor(), replace: false, onClose: noop, onApplied: noop })],
  ['replace', () => createElement(FindDialog, { view: editor(), replace: true, onClose: noop, onApplied: noop })],
  ['page setup', () => createElement(PageSetupDialog, { view: editor(), onClose: noop, onApplied: noop })],
  ...(
    [
      ['insert rows/cols', More.InsertRowsColsDialog, true],
      ['delete rows/cols', More.DeleteRowsColsDialog, true],
      ['columns', More.ColumnSettingsDialog, false],
      ['section', More.SectionSettingsDialog, false],
      ['page border', More.PageBorderDialog, false],
      ['endnote shape', More.EndnoteShapeDialog, false],
      ['hf template', More.HeaderFooterTemplateDialog, false],
      ['numbering shape', More.NumberingShapeDialog, false],
      ['bullet shape', More.BulletShapeDialog, false],
      ['symbols', More.SymbolsDialog, false],
      ['field edit', More.FieldEditDialog, false],
    ] as Array<[string, (p: { view: EditorView; onClose: () => void; onApplied: () => void }) => ReactElement, boolean]>
  ).map(([name, C, table]) => [name, () => createElement(C, { view: editor(table ? (s, bus) => bus.run('table:create', { rows: 2, cols: 2 }) : undefined), onClose: noop, onApplied: noop })] as [string, () => ReactElement]),
  ['grid', () => createElement(More.GridSettingsDialog, { size: 20, onSize: noop, onClose: noop })],
  ['about', () => createElement(AboutDialog, { engine: 'rhwp 0.8.7', onClose: noop })],
  ['page hide', () => createElement(PageHideDialog, { view: editor(), onClose: noop, onApplied: noop })],
  ['table borders tab', () => createElement(TableCellDialog, { view: editor((s, bus) => bus.run('table:create', { rows: 2, cols: 2 })), initialTab: 'border', onClose: noop, onApplied: noop })],
  ...(['insert:equation', 'insert:footnote', 'insert:bookmark', 'page:header-create', 'page:footer-create', 'edit:goto-page', 'view:zoom-set', 'page:new-page-num', 'table:formula'] as InsertKind[]).map(
    (kind) => [kind, () => createElement(InsertPromptDialog, { view: editor(), kind, onClose: noop, onApplied: noop })] as [string, () => ReactElement],
  ),
  ['table/cell', () => createElement(TableCellDialog, { view: editor((s, bus) => bus.run('table:create', { rows: 2, cols: 2 })), onClose: noop, onApplied: noop })],
  ['shape properties', () => createElement(ObjectPropertiesDialog, { view: editor((s, bus) => bus.run('insert:shape', { shapeType: 'ellipse' })), onClose: noop, onApplied: noop })],
  [
    'picture properties',
    () =>
      createElement(ObjectPropertiesDialog, {
        view: editor((s, bus) => {
          bus.run('insert:image', { bytes: PNG, extension: 'png', widthPx: 1, heightPx: 1 })
          s.selectObject(objectsOnPage(s, 0).find((o) => o.kind === 'picture')!)
        }),
        onClose: noop,
        onApplied: noop,
      }),
  ],
  ['hyperlink', () => createElement(HyperlinkDialog, { view: editor((s) => s.select({ anchor: P(0), head: P(4) })), onClose: noop, onApplied: noop })],
  ['click-here', () => createElement(ClickHereDialog, { view: editor(), onClose: noop, onApplied: noop })],
  ['styles', () => createElement(StyleDialog, { view: editor(), onClose: noop, onApplied: noop })],
  ['insert chart', () => createElement(ChartDialog, { view: editor(), onClose: noop, onApplied: noop })],
  [
    'chart data',
    () =>
      createElement(ChartDialog, {
        view: editor((s, bus) => bus.run('insert:chart', { chart: { kind: 'column', categories: ['가', '나'], series: [{ name: '매출', values: [1, 2] }] } })),
        onClose: noop,
        onApplied: noop,
      }),
  ],
]

/** The ribbon with a given tab already chosen (tabs are buttons in a tab list). */
function RibbonAt({ tab, view }: { tab: RibbonTab; view: EditorView }): ReactElement {
  return createElement(HangulRibbon, { view, mac: false, readOnly: false, onRan: noop, onCommand: noop, initialTab: tab })
}

// ── Rules ─────────────────────────────────────────────────────────────

const text = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

function nameOf(el: Element): string {
  const by = el.getAttribute('aria-labelledby')
  if (by) return by.split(/\s+/).map((id) => text(document.getElementById(id))).join(' ').trim()
  const aria = el.getAttribute('aria-label')
  if (aria?.trim()) return aria.trim()
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const id = el.id
    const forLabel = id ? [...document.querySelectorAll('label')].find((l) => l.htmlFor === id) ?? null : null
    const wrap = el.closest('label')
    const t = text(forLabel) || text(wrap)
    if (t) return t
    if (el instanceof HTMLInputElement && (el.type === 'button' || el.type === 'submit')) return el.value
  } else {
    const t = text(el)
    if (t) return t
  }
  return el.getAttribute('title')?.trim() ?? ''
}

const hidden = (el: Element): boolean => !!el.closest('[hidden],[aria-hidden="true"]') || (el instanceof HTMLInputElement && el.type === 'hidden')

/** English words a Korean screen may keep: units, formats, product, fonts and sample data. */
const KO_ALLOWED = new Set(['mm', 'pt', 'px', 'https', 'http', 'mailto', 'hwp', 'hwpx', 'redrob', 'noto', 'sans', 'serif', 'kr', 'pretendard', 'hy', 'ctrl', 'alt', 'shift', 'enter', 'tab', 'esc', 'png', 'svg', 'rhwp',
  // paper sizes 한글 itself names in English
  'letter', 'legal'])

function problems(lang: Lang): string[] {
  const out: string[] = []
  const controls = document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], input, select, textarea, [role="combobox"], [role="listbox"]')
  for (const el of controls) {
    if (hidden(el)) continue
    const name = nameOf(el)
    if (!name) out.push(`unnamed ${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}: ${el.outerHTML.slice(0, 160)}`)
    else if (lang === 'ko') out.push(...english(name).map((w) => `English "${w}" in name "${name}"`))
  }
  for (const el of document.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls],label[for]')) {
    for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for']) {
      for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) if (!document.getElementById(id)) out.push(`${attr}="${id}" points nowhere`)
    }
  }
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id)
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) out.push(`duplicate id "${id}"`)
  for (const d of document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog')) {
    if (!nameOf(d)) out.push('unnamed dialog')
    if (d.getAttribute('aria-modal') !== 'true' && d.tagName !== 'DIALOG') out.push('dialog is not aria-modal')
  }
  for (const tl of document.querySelectorAll('[role="tablist"]')) {
    const tabs = tl.querySelectorAll('[role="tab"]')
    if (tabs.length && ![...tabs].some((tb) => tb.getAttribute('aria-selected') === 'true')) out.push('tab list without a selected tab')
  }
  for (const tb of document.querySelectorAll('[role="toolbar"]')) if (!nameOf(tb)) out.push('unnamed toolbar')
  if (lang === 'ko') {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement
      if (!parent || hidden(parent) || parent.closest('select, option, code, [data-sample]')) continue
      out.push(...english(n.textContent ?? '').map((w) => `English "${w}" in text "${text(parent).slice(0, 60)}"`))
    }
  }
  return [...new Set(out)]
}

/** Words of three or more Latin letters that are not on the Korean allowlist. */
function english(s: string): string[] {
  return (s.match(/[A-Za-z]{3,}/g) ?? []).filter((w) => !KO_ALLOWED.has(w.toLowerCase()))
}

describe('string tables (task 2.5)', () => {
  const en = strings.en as Record<string, string>
  const ko = strings.ko as Record<string, string>
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

  it('en and ko carry the same keys, the same placeholders and no empty values', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(en).filter((k) => ph(en[k]!) !== ph(ko[k]!))).toEqual([])
    expect(Object.keys(ko).filter((k) => !ko[k]!.trim() || !en[k]!.trim())).toEqual([])
  })

  it('Korean strings are authored, not copies of the English', () => {
    // The product name and the Hancom attribution are the same in both by design.
    const same = Object.keys(en).filter((k) => ko[k] === en[k] && /[A-Za-z]{3}/.test(en[k]!))
    // Number-format samples (I, II, III; A, B, C) read the same in every language.
    expect(same.filter((k) => !['panelTitle', 'nextAttribution'].includes(k) && !/^next(Fmt|Num)/.test(k))).toEqual([])
  })
})

describe('accessibility and Korean chrome (task 2.5)', () => {
  for (const [name, make] of SURFACES) {
    for (const lang of ['en', 'ko'] as const) {
      it(`${name} (${lang})`, () => {
        render(lang, make())
        const found = problems(lang)
        if (found.length && process.env.A11Y_DUMP) for (const f of found) console.error(`A11Y ${name} (${lang}): ${f}`)
        expect(found).toEqual([])
      })
    }
  }
})
