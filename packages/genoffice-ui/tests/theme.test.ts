import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyUiTheme } from '../src/theme'

type Listener = () => void

/** A controllable prefers-color-scheme: dark media query. */
function stubSystem(initiallyDark: boolean) {
  let dark = initiallyDark
  const listeners = new Set<Listener>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return dark
      },
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    })),
  )
  return {
    set(next: boolean) {
      dark = next
      for (const l of listeners) l()
    },
    listenerCount: () => listeners.size,
  }
}

describe('applyUiTheme', () => {
  let el: HTMLElement

  beforeEach(() => {
    el = document.createElement('html')
  })

  afterEach(() => {
    applyUiTheme('light', el) // detach any system listener
    vi.unstubAllGlobals()
  })

  it('writes an explicit choice as both the mode and the rendered theme', () => {
    stubSystem(false)
    applyUiTheme('dark', el)
    expect(el.getAttribute('data-theme-mode')).toBe('dark')
    expect(el.getAttribute('data-theme')).toBe('dark')
    applyUiTheme('light', el)
    expect(el.getAttribute('data-theme')).toBe('light')
  })

  it('resolves system to a concrete data-theme, because the kit tokens need one', () => {
    stubSystem(true)
    applyUiTheme('system', el)
    expect(el.getAttribute('data-theme-mode')).toBe('system')
    expect(el.getAttribute('data-theme')).toBe('dark')
  })

  it('follows the OS while in system mode', () => {
    const os = stubSystem(false)
    applyUiTheme('system', el)
    expect(el.getAttribute('data-theme')).toBe('light')
    os.set(true)
    expect(el.getAttribute('data-theme')).toBe('dark')
    os.set(false)
    expect(el.getAttribute('data-theme')).toBe('light')
  })

  it('stops following the OS once an explicit theme is chosen', () => {
    const os = stubSystem(false)
    applyUiTheme('system', el)
    expect(os.listenerCount()).toBe(1)
    applyUiTheme('light', el)
    expect(os.listenerCount()).toBe(0)
    os.set(true)
    expect(el.getAttribute('data-theme')).toBe('light')
  })

  it('never stacks listeners across repeated system applications', () => {
    const os = stubSystem(false)
    applyUiTheme('system', el)
    applyUiTheme('system', el)
    applyUiTheme('system', el)
    expect(os.listenerCount()).toBe(1)
  })
})
