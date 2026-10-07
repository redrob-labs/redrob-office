import { act, createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EditorFrame,
  FormatChip,
  ModeMenu,
  PAGE_MIN,
  PANEL_MAX,
  PANEL_MIN,
  StatusBar,
  TOOLBAR_TIP_KEY,
  ToolbarSwitch,
  clampPanelWidth,
  filterTools,
  formatOf,
  frameLayout,
  frameShortcut,
  type EditorFrameProps,
  type FrameTool,
} from '../src/index'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  localStorage.clear()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})
const render = (el: ReactElement) => act(() => root.render(el))
const $ = <T extends Element = HTMLElement>(s: string) => host.querySelector<T>(s)
const $$ = <T extends Element = HTMLElement>(s: string) => Array.from(host.querySelectorAll<T>(s))
const key = (init: KeyboardEventInit, target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
  })

describe('frameLayout', () => {
  it('gives the panel what it asks for when the page keeps its minimum', () => {
    expect(frameLayout({ width: 1440, rail: 0, preferred: 380, open: true })).toEqual({
      panelOpen: true,
      panel: 380,
      page: 1060,
      constrained: false,
    })
  })
  it('clamps the panel between 320 and 720', () => {
    expect(clampPanelWidth(100)).toBe(PANEL_MIN)
    expect(clampPanelWidth(5000)).toBe(PANEL_MAX)
    expect(frameLayout({ width: 2000, rail: 0, preferred: 900, open: true }).panel).toBe(PANEL_MAX)
  })
  it('shrinks the panel first, then closes it, never the page under 460', () => {
    const shrunk = frameLayout({ width: 900, rail: 0, preferred: 600, open: true })
    expect(shrunk).toMatchObject({ panelOpen: true, panel: 900 - PAGE_MIN, constrained: true })
    expect(shrunk.page).toBe(PAGE_MIN)
    const closed = frameLayout({ width: 700, rail: 0, preferred: 380, open: true })
    expect(closed).toMatchObject({ panelOpen: false, panel: 0, page: 700, constrained: true })
    // the rail counts against the room too
    const withRail = frameLayout({ width: 1000, rail: 220, preferred: 380, open: true })
    expect(withRail.page).toBeGreaterThanOrEqual(PAGE_MIN)
  })
  it('a closed panel leaves the whole width to the page', () => {
    expect(frameLayout({ width: 1200, rail: 200, preferred: 380, open: false })).toMatchObject({
      panelOpen: false,
      page: 1000,
    })
  })
})

describe('frameShortcut', () => {
  const k = (o: Partial<KeyboardEvent>) =>
    frameShortcut({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o })
  it('maps Ctrl+F1, Ctrl+J, Cmd+J and Alt+Q', () => {
    expect(k({ key: 'F1', ctrlKey: true })).toBe('toggleToolbar')
    expect(k({ key: 'j', code: 'KeyJ', ctrlKey: true })).toBe('togglePanel')
    expect(k({ key: 'j', code: 'KeyJ', metaKey: true })).toBe('togglePanel')
    expect(k({ key: 'q', code: 'KeyQ', altKey: true })).toBe('search')
  })
  it('leaves everything else alone', () => {
    expect(k({ key: 'j' })).toBeNull()
    expect(k({ key: 'J', code: 'KeyJ', ctrlKey: true, shiftKey: true })).toBeNull()
    expect(k({ key: 'F1' })).toBeNull()
    expect(k({ key: 'q', code: 'KeyQ', ctrlKey: true })).toBeNull()
  })
})

const TOOLS: FrameTool[] = [
  { id: 'bold', label: 'Bold', keywords: ['strong'], group: 'Home', run: vi.fn() },
  { id: 'polish', label: 'Polish', group: 'Redrob', run: vi.fn() },
  { id: 'page-break', label: 'Page break', group: 'Insert', run: vi.fn() },
  { id: 'break-link', label: 'Remove link', keywords: ['break'], run: vi.fn() },
  { id: 'hidden', label: 'Protect', run: vi.fn(), disabled: true },
]

describe('filterTools', () => {
  it('finds by name, keyword or group, names that start with the query first', () => {
    expect(filterTools(TOOLS, 'bo').map((t) => t.id)).toEqual(['bold'])
    expect(filterTools(TOOLS, 'strong').map((t) => t.id)).toEqual(['bold'])
    expect(filterTools(TOOLS, 'break').map((t) => t.id)).toEqual(['page-break', 'break-link'])
    expect(filterTools(TOOLS, 'insert page').map((t) => t.id)).toEqual(['page-break'])
  })
  it('skips disabled tools and empty queries', () => {
    expect(filterTools(TOOLS, 'protect')).toEqual([])
    expect(filterTools(TOOLS, '  ')).toEqual([])
  })
})

describe('formats', () => {
  it('knows every format Office opens, older ones offering the newer', () => {
    for (const ext of ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.hwpx', '.hwp', '.md', '.pdf']) {
      expect(formatOf(`a${ext}`)?.ext).toBe(ext)
    }
    expect(formatOf('notes.markdown')?.ext).toBe('.md')
    expect(formatOf('x.doc')).toMatchObject({ tone: 'old', newer: '.docx' })
    expect(formatOf('x.txt')).toBeUndefined()
  })
  it('the chip states what the format keeps', () => {
    render(createElement(FormatChip, { file: 'Mutual NDA.docx' }))
    const chip = $('.go-fmtchip')!
    expect(chip.textContent).toBe('.docx')
    expect(chip.getAttribute('aria-label')).toContain('Word')
    expect(chip.getAttribute('title')).toContain('tracked changes')
  })
})

const TB_STRINGS = {
  label: 'Toolbar',
  simple: 'Simple',
  simpleHint: 'One row of the everyday tools',
  classic: 'Classic',
  classicHint: 'Every tool, in tabs',
  tipTitle: 'Want every tool?',
  tipBody: 'Switch to Classic for the full ribbon in tabs, or press Ctrl+F1.',
  tipDismiss: 'Got it',
}

describe('ToolbarSwitch', () => {
  it('is a labeled radio group with the one-time tip, which stays dismissed', () => {
    const onChange = vi.fn()
    render(createElement(ToolbarSwitch, { value: 'simple', onChange, strings: TB_STRINGS }))
    expect($('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('Toolbar')
    expect($('.go-tbswitch__label')!.textContent).toBe('Toolbar')
    expect($$('[role="radio"]').map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect($('.go-tbswitch__tip')).not.toBeNull()
    act(() => $<HTMLButtonElement>('.go-tbswitch__tip button')!.click())
    expect($('.go-tbswitch__tip')).toBeNull()
    expect(localStorage.getItem(TOOLBAR_TIP_KEY)).toBe('1')
    act(() => root.unmount())
    root = createRoot(host)
    render(createElement(ToolbarSwitch, { value: 'simple', onChange, strings: TB_STRINGS }))
    expect($('.go-tbswitch__tip')).toBeNull()
  })
  it('arrow keys switch to Classic', () => {
    const onChange = vi.fn()
    render(createElement(ToolbarSwitch, { value: 'simple', onChange, strings: TB_STRINGS, tip: false }))
    key({ key: 'ArrowRight' }, $$('[role="radio"]')[0]!)
    expect(onChange).toHaveBeenCalledWith('classic')
  })
})

const MODE_STRINGS = {
  label: 'Mode',
  editing: 'Editing',
  suggesting: 'Suggesting',
  viewing: 'Viewing',
  editingHint: 'Change the file directly.',
  suggestingHint: 'What you type is marked as your suggestion.',
  viewingHint: 'Read and comment.',
}

describe('ModeMenu', () => {
  it('opens a menu of three radio items and picks one; unavailable ones cannot be chosen', () => {
    const onChange = vi.fn()
    render(createElement(ModeMenu, { value: 'editing', onChange, strings: MODE_STRINGS, unavailable: ['suggesting'] }))
    const btn = $<HTMLButtonElement>('.go-modemenu__btn')!
    expect(btn.getAttribute('aria-label')).toBe('Mode: Editing')
    expect(btn.getAttribute('aria-haspopup')).toBe('menu')
    act(() => btn.click())
    const items = $$<HTMLButtonElement>('[role="menuitemradio"]')
    expect(items.map((i) => i.textContent)).toEqual([
      'EditingChange the file directly.',
      'SuggestingWhat you type is marked as your suggestion.',
      'ViewingRead and comment.',
    ])
    act(() => items[1]!.click())
    expect(onChange).not.toHaveBeenCalled()
    act(() => items[2]!.click())
    expect(onChange).toHaveBeenCalledWith('viewing')
    expect($('[role="menu"]')).toBeNull()
  })
})

describe('StatusBar', () => {
  it('says Online or Offline in words', () => {
    render(
      createElement(StatusBar, {
        label: 'Status',
        items: ['Page 1 of 3', '374 words'],
        connection: { online: false, onlineLabel: 'Online', offlineLabel: 'Offline' },
      }),
    )
    expect($('.go-statusbar__items')!.textContent).toBe('Page 1 of 3374 words')
    expect($('.go-statusbar__conn')!.textContent).toBe('Offline')
  })
})

function frame(over: Partial<EditorFrameProps> = {}): EditorFrameProps {
  return {
    strings: { titleBar: 'Title bar', undo: 'Undo', redo: 'Redo', resizePanel: 'Resize the Redrob panel', tools: 'Tools' },
    fileName: 'Mutual NDA.docx',
    search: {
      tools: TOOLS,
      strings: { placeholder: 'Search tools, or ask Redrob', shortcut: 'Alt Q', ask: (q) => `Ask Redrob: "${q}"`, results: 'Tools' },
      onAsk: vi.fn(),
    },
    toolbar: 'simple',
    onToolbarChange: vi.fn(),
    toolbarStrings: TB_STRINGS,
    simpleToolbar: createElement('div', { className: 'simple-tb' }, 'simple'),
    classicToolbar: createElement('div', { className: 'classic-tb' }, 'classic'),
    children: createElement('div', { className: 'page' }, 'page'),
    panel: createElement('div', { className: 'panel' }, 'Redrob'),
    panelOpen: true,
    onPanelOpenChange: vi.fn(),
    panelWidth: 380,
    onPanelWidthChange: vi.fn(),
    ...over,
  }
}

describe('EditorFrame', () => {
  it('shows the simplified toolbar by default and the classic one on demand', () => {
    render(createElement(EditorFrame, frame()))
    expect($('.simple-tb')).not.toBeNull()
    expect($('.classic-tb')).toBeNull()
    render(createElement(EditorFrame, frame({ toolbar: 'classic' })))
    expect($('.classic-tb')).not.toBeNull()
  })

  it('wires Ctrl+F1, Ctrl+J and Alt+Q', () => {
    const props = frame()
    render(createElement(EditorFrame, props))
    key({ key: 'F1', ctrlKey: true })
    expect(props.onToolbarChange).toHaveBeenCalledWith('classic')
    key({ key: 'j', code: 'KeyJ', ctrlKey: true })
    expect(props.onPanelOpenChange).toHaveBeenCalledWith(false)
    key({ key: 'q', code: 'KeyQ', altKey: true })
    expect(document.activeElement?.getAttribute('role')).toBe('combobox')
  })

  it('keeps the panel mounted while closed', () => {
    render(createElement(EditorFrame, frame({ panelOpen: false })))
    const panel = $('.go-frame__panel')!
    expect(panel.hidden).toBe(true)
    expect(panel.querySelector('.panel')).not.toBeNull()
  })

  it('resizes the panel from its left edge with the keyboard', () => {
    const props = frame()
    render(createElement(EditorFrame, props))
    const sep = $('[role="separator"]')!
    expect(sep.getAttribute('aria-label')).toBe('Resize the Redrob panel')
    expect(sep.getAttribute('aria-valuemin')).toBe('320')
    expect(sep.getAttribute('aria-valuemax')).toBe('720')
    key({ key: 'ArrowLeft' }, sep)
    expect(props.onPanelWidthChange).toHaveBeenLastCalledWith(396)
    key({ key: 'End' }, sep)
    expect(props.onPanelWidthChange).toHaveBeenLastCalledWith(320)
  })

  it('runs a tool from the title bar search, or asks Redrob', () => {
    const props = frame()
    render(createElement(EditorFrame, props))
    const input = $<HTMLInputElement>('[role="combobox"]')!
    act(() => {
      input.focus()
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(input, 'pol')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const opts = $$('[role="option"]').map((o) => o.textContent)
    expect(opts).toEqual(['Polish', 'Ask Redrob: "pol"'])
    key({ key: 'Enter' }, input)
    expect(TOOLS[1]!.run).toHaveBeenCalled()
    act(() => {
      input.focus()
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(input, 'tighten section 5')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    key({ key: 'Enter' }, input)
    expect(props.search.onAsk).toHaveBeenCalledWith('tighten section 5')
  })
})

describe('frame.css', () => {
  it('reads only tokens and is imported by theme.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/frame/frame.css'), 'utf8')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(readFileSync(join(process.cwd(), 'src/theme.css'), 'utf8')).toContain("@import './frame/frame.css'")
  })
})

describe('frame copy and the older-format banner', () => {
  it('builds every prop bundle in English, filling placeholders', async () => {
    const { frameCopy, frameT } = await import('../src/index')
    const copy = frameCopy('en')
    expect(copy.search.ask('polish')).toBe('Ask Redrob: "polish"')
    expect(copy.toolbar.label).toBe('Toolbar')
    expect(copy.mode.suggesting).toBe('Suggesting')
    expect(frameT('ko', 'online')).toBe('Online')
    expect(frameT('en', 'pageOf', { current: 1, total: 3 })).toBe('Page 1 of 3')
  })

  it('shows only for an older format, and offers the copy', async () => {
    const { OldFormatBanner } = await import('../src/index')
    const onSaveCopy = vi.fn()
    const base = { title: 'An older Word 97-2003 file', body: 'It opens as it is.', saveLabel: 'Save a .docx copy', keepLabel: 'Keep .doc', onSaveCopy, onKeep: vi.fn() }
    render(createElement(OldFormatBanner, { ...base, file: 'Contract.docx' }))
    expect($('.go-oldfmt')).toBeNull()
    render(createElement(OldFormatBanner, { ...base, file: 'Contract.doc' }))
    expect($('.go-oldfmt')!.getAttribute('aria-label')).toBe('An older Word 97-2003 file')
    act(() => $$<HTMLButtonElement>('.go-oldfmt button')[0]!.click())
    expect(onSaveCopy).toHaveBeenCalledOnce()
  })
})
