/**
 * @vitest-environment jsdom
 *
 * The Home quick-create cards must show the FULL editor product name
 * ("Redrob Docs", "Redrob Sheets", "Redrob Slides", "Redrob Markdown",
 * "Redrob PDF", "Redrob Hangul") at the normal window width. The title used to
 * ellipsize to "Redrob …". The fix wraps the title to two lines (no ellipsis
 * clipping the brand) and adds a title/aria-label accessibility fallback, with
 * the AI chip moved to the card corner so it does not steal title width.
 *
 * These tests cover the accessible name (title/aria-label) via a jsdom render,
 * and lock the layout intent (wrapping, corner chip) at the source level so a
 * regression to ellipsis is caught.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi, ProjectHomeApi } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { Home } from '../src/renderer/src/Home'

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const src = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), 'utf8')

const EDITOR_CARD_NAMES = [
  'Redrob Docs',
  'Redrob Sheets',
  'Redrob Slides',
  'Redrob Markdown',
  'Redrob PDF',
  'Redrob Hangul',
]

describe('Home quick-create cards show full editor names', () => {
  const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  actEnv.IS_REACT_ACT_ENVIRONMENT = true
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    // minimal HomeApi so Home mounts without touching real IPC
    const noop = async () => {}
    const emptyPage = async () => ({ entries: [], total: 0, totalAll: 0 })
    window.aiOffice = {
      getTheme: async () => 'system',
      getDefaultSaveDir: async () => '',
      getAnalyticsEnabled: async () => true,
      setAnalyticsEnabled: async () => true,
      getUpdateChannel: async () => 'stable',
      getAppVersion: async () => '1.0.0',
      githubStars: async () => null,
      recents: emptyPage,
      starred: emptyPage,
      statPaths: async () => [],
      onRecentsChanged: () => () => {},
      onThemeChanged: () => () => {},
      newDoc: noop,
      newSheet: noop,
      newSlide: noop,
      newMarkdown: noop,
      newPdf: noop,
      newHangul: noop,
      browse: noop,
      starPromptShouldShow: async () => ({ show: false, docOpens: 0 }),
    } as unknown as HomeApi
    ;(window as unknown as { aiOfficeProject?: ProjectHomeApi }).aiOfficeProject = undefined
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('gives each editor card an accessible name with the full product name', async () => {
    await act(async () => {
      root.render(createElement(LocaleProvider, { initial: 'en' }, createElement(Home)))
      await Promise.resolve()
    })

    const cards = Array.from(host.querySelectorAll<HTMLButtonElement>('.quick-card'))
    const accessibleNames = cards.map(
      (c) => c.getAttribute('aria-label') ?? c.getAttribute('title') ?? '',
    )
    for (const name of EDITOR_CARD_NAMES) {
      expect(accessibleNames, `missing accessible card name "${name}"`).toContain(name)
    }
    // Open Local File card also has an accessible name
    expect(accessibleNames.some((n) => /Open Local File/i.test(n))).toBe(true)

    // the visible title text carries the full name too (not a truncated string)
    const titleText = Array.from(host.querySelectorAll('.quick-title')).map(
      (n) => n.textContent ?? '',
    )
    for (const name of EDITOR_CARD_NAMES) {
      expect(titleText, `card title text missing "${name}"`).toContain(name)
    }
  })
})

describe('quick-card title layout locks (no ellipsis truncation of the brand)', () => {
  const css = () => src('apps/shell/src/renderer/src/home.css')

  it('the title wraps to two lines instead of nowrap+ellipsis', () => {
    const text = css()
    const block = /\.quick-title \{([^}]*)\}/.exec(text)?.[1] ?? ''
    expect(block).toContain('white-space: normal')
    expect(block).toContain('-webkit-line-clamp: 2')
    expect(block).not.toContain('white-space: nowrap')
  })

  it('the AI chip is positioned in the card corner so it does not shrink the title', () => {
    const text = css()
    expect(text).toContain('.ai-chip-corner')
    const block = /\.ai-chip-corner \{([^}]*)\}/.exec(text)?.[1] ?? ''
    expect(block).toContain('position: absolute')
  })

  it('Home renders title + aria-label on the quick cards', () => {
    const home = src('apps/shell/src/renderer/src/Home.tsx')
    expect(home).toContain('title={item.title}')
    expect(home).toContain('aria-label={item.title}')
    expect(home).toContain('ai-chip ai-chip-corner')
  })
})
