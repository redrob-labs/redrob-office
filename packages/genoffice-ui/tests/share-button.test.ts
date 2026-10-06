/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from '../src/share/ShareButton'

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

const api = (status: unknown) => ({
  shareStatus: vi.fn(async () => status),
  shareInvite: vi.fn(),
  shareRemove: vi.fn(),
  sharedWithMe: vi.fn(),
  openShared: vi.fn(),
})

describe('ShareButton', () => {
  it('is hidden when the build has no sync service', async () => {
    await act(async () => root.render(createElement(ShareButton, { path: '/a.pptx', fileName: 'a.pptx', api: api({ available: false, reason: 'no-service' }) as never })))
    expect(host.querySelector('button')).toBeNull()
  })

  it('is hidden outside the suite', async () => {
    await act(async () => root.render(createElement(ShareButton, { path: '/a.pptx', fileName: 'a.pptx', api: undefined })))
    expect(host.querySelector('button')).toBeNull()
  })

  it('opens the dialog, with the file-only note, when sharing is available', async () => {
    await act(async () =>
      root.render(createElement(ShareButton, { path: '/a.pdf', fileName: 'a.pdf', api: api({ available: true, shared: false }) as never, note: 'File only.' })),
    )
    const button = host.querySelector('button')!
    expect(button.textContent).toBe('Share')
    await act(async () => button.click())
    expect(document.body.textContent).toContain('File only.')
  })
})
