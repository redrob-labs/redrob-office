/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionsButton } from '../src/versions/VersionsButton'

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

describe('VersionsButton', () => {
  it('is just the status outside the suite (no versions API)', async () => {
    await act(async () => root.render(createElement(VersionsButton, { path: '/a.xlsx', fileName: 'a.xlsx', api: undefined }, 'Saved')))
    expect(host.querySelector('button')).toBeNull()
    expect(host.textContent).toBe('Saved')
  })

  it('opens the history for the document and lists its versions', async () => {
    const listVersions = vi.fn(async () => [
      { id: 'v2', at: '2026-10-06T10:00:00Z', by: 'me' },
      { id: 'v1', at: '2026-10-05T10:00:00Z', by: 'me' },
    ])
    await act(async () =>
      root.render(createElement(VersionsButton, { path: '/a.xlsx', fileName: 'a.xlsx', api: { listVersions } }, 'Saved')),
    )
    await act(async () => host.querySelector('button')!.click())
    expect(listVersions).toHaveBeenCalledWith('/a.xlsx')
    expect(document.body.textContent).toContain('Restore')
  })
})
