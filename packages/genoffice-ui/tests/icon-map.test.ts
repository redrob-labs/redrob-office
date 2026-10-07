import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { iconNames } from '@redrob-labs/ui'
import { KIT_ICON_FALLBACKS, KIT_ICON_MAP, kitGlyph, type KitIconKey } from '../src/icon-map'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true

describe('KIT_ICON_MAP', () => {
  it('names only icons the pinned kit ships', () => {
    const known = new Set<string>(iconNames)
    const missing = Object.entries(KIT_ICON_MAP).filter(([, name]) => !known.has(name))
    expect(missing).toEqual([])
  })

  it('never lists a glyph as both mapped and an app-drawn fallback', () => {
    const both = Object.keys(KIT_ICON_FALLBACKS).filter((k) => k in KIT_ICON_MAP)
    expect(both).toEqual([])
  })

  it('gives every fallback a reason', () => {
    for (const reason of Object.values(KIT_ICON_FALLBACKS)) expect(reason.trim()).not.toBe('')
  })
})

describe('kitGlyph', () => {
  it('draws the mapped kit icon at the requested size, hidden from assistive tech', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const Bold = kitGlyph('IconBold' satisfies KitIconKey)
    expect(Bold.displayName).toBe('IconBold')
    act(() => root.render(createElement(Bold, { size: 20 })))
    const svg = host.querySelector('svg')!
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.closest('[aria-hidden="true"]') ?? svg.getAttribute('aria-hidden')).toBeTruthy()
    act(() => root.unmount())
    host.remove()
  })
})
