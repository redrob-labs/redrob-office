/**
 * @vitest-environment jsdom
 *
 * Contract for the canonical Redrob brand mark used in every editor's AI panel
 * and ribbon. There is ONE component (@genoffice/ui RedrobMark) with the
 * official gradient artwork, not five copied monochrome paths. This test locks:
 *   - the mark renders the brand GRADIENT (not a flat currentColor glyph),
 *   - two instances get distinct gradient ids (no id collision), and
 *   - each editor's GensparkMark wrapper delegates to the shared RedrobMark.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RedrobMark } from '@genoffice/ui'

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), 'utf8')

describe('RedrobMark canonical brand component', () => {
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
  })

  it('renders the official gradient artwork, not a monochrome currentColor glyph', () => {
    act(() => root.render(createElement(RedrobMark, { size: 24 })))
    const svg = host.querySelector('svg')!
    expect(svg).toBeTruthy()
    // the brand gradient stops are present
    const stops = Array.from(svg.querySelectorAll('stop')).map((s) => s.getAttribute('stop-color'))
    expect(stops).toEqual(['#3E7BFF', '#2B58F0', '#101C63'])
    // the mark path is filled with the gradient, never currentColor
    const path = svg.querySelector('path')!
    expect(path.getAttribute('fill')).toMatch(/^url\(#/)
    expect(svg.innerHTML).not.toContain('currentColor')
  })

  it('gives each instance a unique gradient id so two marks do not collide', () => {
    act(() =>
      root.render(
        createElement('div', null, createElement(RedrobMark), createElement(RedrobMark)),
      ),
    )
    const ids = Array.from(host.querySelectorAll('linearGradient')).map((g) => g.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('editor AI marks delegate to the one canonical component', () => {
  const editors = [
    'apps/docs/src/renderer/components/icons.tsx',
    'apps/slides/src/renderer/components/icons.tsx',
    'apps/sheets/src/renderer/ribbon-icons.tsx',
    'apps/markdown/src/renderer/ai/AiPanel.tsx',
    'apps/pdf/src/renderer/ai/AiPanel.tsx',
  ]

  for (const rel of editors) {
    it(`${rel} renders RedrobMark and holds no copied brand path`, () => {
      const src = read(rel)
      expect(src).toContain('RedrobMark')
      // the old ad-hoc monochrome path must be gone from every copy
      expect(src).not.toContain('fill="currentColor"\n      />')
      // no inline brand mark path duplicated here anymore
      expect(src).not.toContain('M19.4887 7.59543V3.9548')
    })
  }
})
