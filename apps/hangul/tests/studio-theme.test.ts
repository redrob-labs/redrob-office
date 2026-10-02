import { afterEach, describe, expect, it } from 'vitest'
import {
  applyStudioTheme,
  STUDIO_TOKEN_MAP,
  studioThemeCss,
  syncStudioTheme,
} from '../src/renderer/studio-theme'

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
  document.body.innerHTML = ''
})

function hostWithTokens(): HTMLElement {
  const root = document.documentElement
  root.style.setProperty('--surface-base', '#ffffff')
  root.style.setProperty('--action-primary', '#2b52ff')
  root.style.setProperty('--ink-primary', '#0a0b0c')
  return root
}

describe('rhwp-studio theme', () => {
  it('maps studio chrome properties to resolved kit token values', () => {
    const css = studioThemeCss(hostWithTokens())
    expect(css).toContain('--ui-surface: #ffffff;')
    expect(css).toContain('--accent-primary: #2b52ff;')
    expect(css).toContain('--ui-menu-open: #2b52ff;')
    expect(css).toContain('--ui-text: #0a0b0c;')
    // outranks the studio's own skin and dark-mode blocks
    expect(css.startsWith(':root:root')).toBe(true)
  })

  it('leaves out tokens the host does not define', () => {
    const css = studioThemeCss(hostWithTokens())
    expect(css).not.toContain('--ui-danger:')
  })

  it('only maps studio chrome to kit tokens, never page colours', () => {
    for (const [prop, token] of Object.entries(STUDIO_TOKEN_MAP)) {
      expect(prop).not.toMatch(/^--doc-paper|^--caret|^--selection-fill/)
      expect(token.startsWith('--')).toBe(true)
    }
  })

  it('writes one style element and follows the host theme', () => {
    const host = hostWithTokens()
    host.setAttribute('data-theme', 'dark')
    const studio = document.implementation.createHTMLDocument('studio')
    applyStudioTheme(studio, host)
    applyStudioTheme(studio, host)
    expect(studio.querySelectorAll('#redrob-studio-theme')).toHaveLength(1)
    expect(studio.documentElement.dataset.themeEffective).toBe('dark')
  })

  it('re-themes a same-origin frame when the app theme changes', async () => {
    const host = hostWithTokens()
    host.setAttribute('data-theme', 'light')
    const container = document.createElement('div')
    const frame = document.createElement('iframe')
    container.appendChild(frame)
    document.body.appendChild(container)
    const stop = syncStudioTheme(container, host)
    const doc = frame.contentDocument!
    expect(doc.getElementById('redrob-studio-theme')).not.toBeNull()
    host.setAttribute('data-theme', 'dark')
    await new Promise((r) => setTimeout(r, 0))
    expect(doc.documentElement.dataset.themeEffective).toBe('dark')
    stop()
  })
})
