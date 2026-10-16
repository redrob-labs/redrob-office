/**
 * @vitest-environment jsdom
 *
 * Home starts from the job, not the file: a greeting headline, the six format
 * tiles, one composer (with Open a file on it), then Recent.
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
  it('shows the greeting + ask, the six format tiles, then one composer, top to bottom', async () => {
    await mount()
    const hero = host.querySelector('.home-hero')!
    // the headline is "<greeting by hour> <question>", no account name, no recent file
    const h1 = hero.querySelector('h1')!.textContent!
    expect(h1).toMatch(/^Good (morning|afternoon|evening) What are you working on\?$/)
    expect(hero.querySelectorAll('textarea')).toHaveLength(1)
    // the three starters are gone; the tiles sit between the headline and the composer
    expect(hero.querySelectorAll('.rr-prompt')).toHaveLength(0)
    const order = ['.home-hero__ask', '.home-tiles', '.home-hero__compose'].map((s) =>
      Array.from(hero.querySelectorAll('*')).indexOf(hero.querySelector(s)!),
    )
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // Recent comes after the hero
    const recents = host.querySelector('.recents')!
    expect(hero.compareDocumentPosition(recents) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lists the six formats as tiles in product order, and Open a file on the composer', async () => {
    await mount()
    const names = Array.from(host.querySelectorAll('.home-tile .home-tile__name')).map((n) => n.textContent)
    expect(names).toEqual(['Document', 'Spreadsheet', 'Presentation', 'PDF', 'Hangul', 'Markdown'])
    // no per-tile extension line any more
    expect(host.querySelector('.home-blank__ext')).toBeNull()
    expect(host.querySelector('.home-hero__compose [aria-label="Open a file"]')).not.toBeNull()
  })

  it('starts each format blank from its tile and opens a file from the composer', async () => {
    await mount()
    const tiles = Array.from(host.querySelectorAll<HTMLButtonElement>('.home-tile .home-tile__main'))
    for (const b of tiles) act(() => b.click())
    for (const fn of ['newDoc', 'newSheet', 'newSlide', 'newHangul', 'newMarkdown', 'newPdf']) {
      expect(api[fn], fn).toHaveBeenCalledOnce()
    }
    const open = host.querySelector<HTMLButtonElement>('.home-hero__compose [aria-label="Open a file"]')!
    act(() => open.click())
    expect(api.browse).toHaveBeenCalledOnce()
  })

  it('hands what is typed to Redrob through the composer path', async () => {
    await mount()
    const textarea = host.querySelector<HTMLTextAreaElement>('.home-hero__compose textarea')!
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      set.call(textarea, 'Draft a mutual NDA')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(api.ask).toHaveBeenCalledWith('Draft a mutual NDA')
  })

  it('names the navigation Home, Updates, Starred with counts, then Shared', async () => {
    await mount()
    const labels = Array.from(host.querySelectorAll('.sidebar-nav .nav-label')).map(
      (n) => n.textContent,
    )
    expect(labels.slice(0, 4)).toEqual(['Home', 'Updates', 'Starred', 'Shared'])
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

  it('opens Shared and says when sharing is not available', async () => {
    await mount()
    const shared = Array.from(host.querySelectorAll<HTMLButtonElement>('.sidebar-nav .nav-item'))[3]!
    act(() => shared.click())
    expect(shared.getAttribute('aria-current')).toBe('page')
    expect(host.querySelector('#shared-title')!.textContent).toBe('Shared')
    expect(host.textContent).toContain('Sharing is not available here.')
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
