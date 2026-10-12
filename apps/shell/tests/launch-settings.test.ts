/**
 * @vitest-environment jsdom
 *
 * The launch screen (once a session, reduced motion honored) and Settings'
 * Redrob AI pane and toolbar choice (handoff 10-launch, 09-settings).
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi, OfficePrefs } from '../src/shared/home-api'
import { DEFAULT_OFFICE_PREFS } from '@genoffice/electron-utils/office-prefs'
import { LocaleProvider } from '../src/renderer/src/locale'
import { Launch } from '../src/renderer/src/Launch'
import { SettingsModal } from '../src/renderer/src/SettingsModal'
import { shouldShowLaunch } from '../src/main/launch'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

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
  vi.useRealTimers()
})

describe('shouldShowLaunch', () => {
  it('plays once per app session', () => {
    expect(shouldShowLaunch({ shown: false })).toBe(true)
    expect(shouldShowLaunch({ shown: true })).toBe(false)
  })
  it('can be turned off for tooling that captures Home', () => {
    expect(shouldShowLaunch({ shown: false, env: 'skip' })).toBe(false)
  })
})

describe('Launch', () => {
  const render = (onDone: () => void, reducedMotion: boolean) =>
    act(() => {
      root.render(
        createElement(LocaleProvider, { initial: 'en' }, createElement(Launch, { onDone, reducedMotion })),
      )
    })

  it('shows the Redrob lockup, then the Office icon and name, still under reduced motion', async () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(onDone, true)
    const splash = host.querySelector('.rs-splash')!
    expect(splash.classList.contains('rs-splash--still')).toBe(true)
    // beat 1: the universal lockup
    expect(host.querySelector('.rs-splash__brand img.rs-splash__art')).not.toBeNull()
    expect((host.querySelector('.rs-splash__product') as HTMLElement).hidden).toBe(true)
    await act(async () => vi.advanceTimersByTimeAsync(800))
    // beat 2: the product icon with its name
    expect((host.querySelector('.rs-splash__product') as HTMLElement).hidden).toBe(false)
    expect(host.querySelector('.rs-splash__product svg.rs-icon--office')).not.toBeNull()
    expect(host.querySelector('.rs-splash__name')!.textContent).toBe('Redrob Office')
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('plays the mark when motion is allowed, and any key skips it', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    render(onDone, false)
    expect(host.querySelector('.launch--still')).toBeNull()
    expect(host.querySelector('.rs-splash--still')).toBeNull()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDone).toHaveBeenCalledOnce()
    // never twice, even when the cap fires later
    act(() => vi.advanceTimersByTime(5000))
    expect(onDone).toHaveBeenCalledOnce()
  })
})

describe('Settings', () => {
  let stored: OfficePrefs
  let setOfficePrefs: ReturnType<typeof vi.fn>

  async function open() {
    stored = { ...DEFAULT_OFFICE_PREFS }
    setOfficePrefs = vi.fn(async (patch: Partial<OfficePrefs>) => (stored = { ...stored, ...patch }))
    window.aiOffice = {
      getTheme: async () => 'system',
      getDefaultSaveDir: async () => '',
      getAnalyticsEnabled: async () => true,
      setAnalyticsEnabled: async () => true,
      getUpdateChannel: async () => 'stable',
      getAppVersion: async () => '1.0.0',
      githubStars: async () => null,
      getAiSettings: async () => ({ provider: 'genspark', providers: { genspark: { apiKey: '', model: '' } } }),
      getOfficePrefs: async () => stored,
      setOfficePrefs,
      onOfficePrefsChanged: () => () => {},
    } as unknown as HomeApi
    await act(async () => {
      root.render(
        createElement(
          LocaleProvider,
          { initial: 'en' },
          createElement(SettingsModal, {
            status: null,
            loggingOut: false,
            loginWaiting: false,
            loginUrl: null,
            urlCopied: false,
            onOpenLoginUrl: vi.fn(),
            onCopyLoginUrl: vi.fn(),
            onClose: vi.fn(),
            onLogin: vi.fn(),
            onLogout: vi.fn(),
          }),
        ),
      )
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('lists Redrob AI, Sharing, General and About, and opens on Redrob AI', async () => {
    await open()
    const nav = Array.from(host.querySelectorAll('.set-nav-item')).map((b) => b.textContent)
    expect(nav).toEqual(['Redrob AI', 'Sharing', 'General', 'About'])
    expect(host.querySelector('.set-pane-title')!.textContent).toBe('Redrob AI')
  })

  it('shows every Redrob setting, with privacy read-only and honest about this computer', async () => {
    await open()
    const titles = Array.from(host.querySelectorAll('.set-row .set-field-label')).map(
      (n) => n.textContent,
    )
    expect(titles).toEqual([
      'Model for new files',
      'Privacy protection',
      'Memory',
      'Fact check',
      'Challenge',
      'Plan or Run',
      'How Redrob Auto chooses',
    ])
    const privacy = host.querySelectorAll('.set-row')[1]!
    expect(privacy.querySelector('button, input')).toBeNull()
    expect(privacy.textContent).toContain('Set by your admin')
    expect(privacy.textContent).toContain('Not on this computer yet')
    // not connected: says so, and opens For developers where the key goes
    expect(host.textContent).toContain('Redrob is not connected yet')
    expect(host.textContent).toContain('For developers')
  })

  it('stores a Memory change through main', async () => {
    await open()
    const memory = host.querySelectorAll('.set-row')[2]!.querySelector<HTMLInputElement>('input')!
    await act(async () => {
      memory.click()
      await Promise.resolve()
    })
    expect(setOfficePrefs).toHaveBeenCalledWith({ memory: false })
  })

  it('offers the toolbar choice in General', async () => {
    await open()
    const general = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-nav-item')).find((b) =>
      b.textContent?.includes('General'),
    )!
    await act(async () => {
      general.click()
      await Promise.resolve()
    })
    const label = host.querySelector('label[for="set-toolbar"]')
    expect(label?.textContent).toBe('Toolbar')
    expect(host.querySelector('#set-toolbar')!.textContent).toContain('Simple')
  })
})
