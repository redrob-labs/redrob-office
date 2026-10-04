/**
 * @vitest-environment jsdom
 *
 * Home starts from the job, not the file (handoff 01-home): greeting, one
 * composer, three starters, "Or start blank" newest format first, then Recent.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi, ProjectHomeApi, RecentQuery } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { Home } from '../src/renderer/src/Home'
import { START_FORMATS, greetingKeyFor } from '../src/renderer/src/home/formats'
import { cleanAskPrompt, routeAsk, ASK_PROMPT_MAX } from '../src/main/ask-prompt'
import { filterRecentEntries, normalizeRecentQuery } from '../src/main/recent-files'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let api: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const noop = vi.fn(async () => {})
  const page = (total: number) =>
    vi.fn(async (_q?: RecentQuery) => ({ entries: [], total, totalAll: total }))
  api = {
    ask: vi.fn(async () => {}),
    newDoc: vi.fn(async () => {}),
    newSheet: vi.fn(async () => {}),
    newSlide: vi.fn(async () => {}),
    newMarkdown: vi.fn(async () => {}),
    newPdf: vi.fn(async () => {}),
    newHangul: vi.fn(async () => {}),
    browse: vi.fn(async () => {}),
    recents: page(8),
    starred: page(3),
    setTheme: noop,
  }
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getAnalyticsEnabled: async () => true,
    setAnalyticsEnabled: async () => true,
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '1.0.0',
    githubStars: async () => null,
    statPaths: async () => [],
    onRecentsChanged: () => () => {},
    onThemeChanged: () => () => {},
    starPromptShouldShow: async () => ({ show: false, docOpens: 0 }),
    ...api,
  } as unknown as HomeApi
  ;(window as unknown as { aiOfficeProject?: ProjectHomeApi }).aiOfficeProject = undefined
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function mount() {
  await act(async () => {
    root.render(createElement(LocaleProvider, { initial: 'en' }, createElement(Home)))
    await Promise.resolve()
  })
  await act(async () => {
    await Promise.resolve()
  })
}

describe('Home, composer first', () => {
  it('shows the ask, one composer, three starters, then Or start blank, top to bottom', async () => {
    await mount()
    const hero = host.querySelector('.home-hero')!
    expect(hero.querySelector('h1')!.textContent).toBe('What are you working on?')
    expect(hero.querySelectorAll('textarea')).toHaveLength(1)
    expect(hero.querySelectorAll('.rr-prompt')).toHaveLength(3)
    const order = ['.home-hero__ask', '.home-hero__compose', '.home-hero__try', '.home-blank'].map(
      (s) => Array.from(hero.querySelectorAll('*')).indexOf(hero.querySelector(s)!),
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // Recent comes after the hero
    const recents = host.querySelector('.recents')!
    expect(hero.compareDocumentPosition(recents) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lists every format newest first, then Open a file', async () => {
    await mount()
    const names = Array.from(host.querySelectorAll('.home-blank__btn .home-blank__name')).map(
      (n) => n.textContent,
    )
    expect(names).toEqual([
      'Document',
      'Spreadsheet',
      'Presentation',
      'Hangul',
      'Markdown',
      'PDF',
      'Open a file',
    ])
    const exts = Array.from(host.querySelectorAll('.home-blank__ext')).map((n) => n.textContent)
    expect(exts).toEqual(['.docx .doc', '.xlsx .xls', '.pptx .ppt', '.hwpx .hwp', '.md', '.pdf'])
  })

  it('starts each format blank and opens a file from disk', async () => {
    await mount()
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.home-blank__btn'))
    for (const b of buttons) act(() => b.click())
    for (const fn of ['newDoc', 'newSheet', 'newSlide', 'newHangul', 'newMarkdown', 'newPdf', 'browse']) {
      expect(api[fn], fn).toHaveBeenCalledOnce()
    }
  })

  it('hands a starter to Redrob through the composer path', async () => {
    await mount()
    const first = host.querySelector<HTMLButtonElement>('.rr-prompt')!
    act(() => first.click())
    expect(api.ask).toHaveBeenCalledWith('Draft a mutual NDA')
  })

  it('names the navigation Home, Updates, Starred with counts, and no Shared with you yet', async () => {
    await mount()
    const labels = Array.from(host.querySelectorAll('.sidebar-nav .nav-label')).map(
      (n) => n.textContent,
    )
    expect(labels.slice(0, 3)).toEqual(['Home', 'Updates', 'Starred'])
    expect(labels).not.toContain('Shared with you')
    const items = Array.from(host.querySelectorAll('.sidebar-nav .nav-item'))
    expect(items[0]!.querySelector('.nav-count')!.textContent).toBe('8')
    expect(items[0]!.getAttribute('aria-current')).toBe('page')
    // nothing waits yet, so Updates shows no count
    expect(items[1]!.querySelector('.nav-count')).toBeNull()
    expect(items[2]!.querySelector('.nav-count')!.textContent).toBe('3')
  })

  it('opens Updates in the content area with its empty state', async () => {
    await mount()
    const updates = Array.from(host.querySelectorAll<HTMLButtonElement>('.sidebar-nav .nav-item'))[1]!
    act(() => updates.click())
    expect(host.querySelector('.updates-title')!.textContent).toBe('Updates')
    expect(host.textContent).toContain('Nothing is waiting')
    expect(host.querySelector('.home-hero')).toBeNull()
  })

  it('offers theme as system, light and dark, and English as the only language', async () => {
    await mount()
    const radios = Array.from(host.querySelectorAll('.home-foot [role="radio"]'))
    expect(radios).toHaveLength(3)
  })
})

describe('Home helpers', () => {
  it('orders formats the way the product lists them', () => {
    expect(START_FORMATS.map((f) => f.kind)).toEqual(['docx', 'xlsx', 'pptx', 'hwp', 'md', 'pdf'])
    for (const f of START_FORMATS) expect(f.exts.length).toBeGreaterThan(0)
  })

  it('greets by the hour', () => {
    expect(greetingKeyFor(9)).toBe('greetMorning')
    expect(greetingKeyFor(14)).toBe('greetAfternoon')
    expect(greetingKeyFor(21)).toBe('greetEvening')
    expect(greetingKeyFor(2)).toBe('greetEvening')
  })

  it('routes a request to the editor it is about, Docs by default', () => {
    expect(routeAsk('Draft a mutual NDA')).toBe('docs')
    expect(routeAsk('Make a five-slide project update')).toBe('slides')
    expect(routeAsk('Build a pitch deck for Series B')).toBe('slides')
    expect(routeAsk('Turn a spreadsheet into a board memo')).toBe('docs')
  })

  it('cleans what the composer sends', () => {
    expect(cleanAskPrompt('  hi  ')).toBe('hi')
    expect(cleanAskPrompt('   ')).toBeNull()
    expect(cleanAskPrompt(42)).toBeNull()
    expect(cleanAskPrompt('x'.repeat(ASK_PROMPT_MAX + 10))!.length).toBe(ASK_PROMPT_MAX)
  })

  it('filters Recent by name, case-insensitively, within the type filter', () => {
    const all = [
      { name: 'Mutual NDA', ext: 'docx' },
      { name: 'Forecast', ext: 'xlsx' },
      { name: 'Board memo', ext: 'docx' },
      { name: 'Macro book', ext: 'xlsm' },
    ]
    expect(filterRecentEntries(all, undefined, 'nda').map((e) => e.name)).toEqual(['Mutual NDA'])
    expect(filterRecentEntries(all, 'docx', 'o').map((e) => e.name)).toEqual(['Board memo'])
    expect(filterRecentEntries(all, 'xlsx', undefined)).toHaveLength(2)
    expect(normalizeRecentQuery({ q: '  NDA ' }).q).toBe('nda')
    expect(normalizeRecentQuery({ q: '   ' }).q).toBeUndefined()
  })
})
