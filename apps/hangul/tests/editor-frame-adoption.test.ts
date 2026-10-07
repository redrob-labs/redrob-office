/**
 * @vitest-environment jsdom
 *
 * Hangul in the shared EditorFrame (handoff 07-hangul): the Redrob panel
 * fails closed, the content stays Korean, and the frame wraps the studio.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HangulPanel } from '../src/renderer/HangulEditor'
import { applyStudioTheme } from '../src/renderer/studio-theme'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(() => host.remove())

describe('HangulPanel', () => {
  it('says Redrob cannot work on this file yet, and offers no composer', () => {
    const root = createRoot(host)
    const onClose = vi.fn()
    act(() => root.render(createElement(HangulPanel, { onClose })))
    expect(host.textContent).toContain('Editing tools for Hangul files are not ready yet')
    expect(host.querySelector('textarea')).toBeNull()
    const close = host.querySelector<HTMLButtonElement>('button[aria-label="Close the Redrob panel"]')!
    act(() => close.click())
    expect(onClose).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })
})

describe('Korean content', () => {
  it('marks the studio document Korean whatever the interface language', () => {
    const studio = document.implementation.createHTMLDocument('studio')
    document.documentElement.setAttribute('lang', 'en')
    applyStudioTheme(studio, document.documentElement)
    expect(studio.documentElement.lang).toBe('ko')
  })

  it('marks the studio container Korean in the frame', () => {
    const src = readFileSync(join(__dirname, '../src/renderer/HangulEditor.tsx'), 'utf8')
    expect(src).toContain('<EditorFrame')
    expect(src).toMatch(/className="hangul-studio-container" lang="ko"/)
  })
})
