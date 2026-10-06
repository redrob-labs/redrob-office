/**
 * @vitest-environment jsdom
 *
 * Updates' Shared files section: what other people did lately to shared
 * files, read from the reader's side, polled while shown.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareApi, SharedActivity } from '@genoffice/sync-client'
import { LocaleProvider } from '../src/renderer/src/locale'
import { ACTIVITY_POLL_MS, ActivitySection } from '../src/renderer/src/home/ActivitySection'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

const ID = '11111111-2222-4333-8444-555555555555'

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

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)))

const ev = (id: number, over: Partial<SharedActivity>): SharedActivity => ({
  id,
  fileId: ID,
  fileName: 'Plan.docx',
  by: 'Jae Gardner',
  kind: 'version',
  detail: {},
  you: false,
  at: '2026-10-06T09:00:00.000Z',
  localPath: null,
  ...over,
})

async function mount(api: Partial<ShareApi>, openPath = vi.fn()) {
  act(() => root.render(createElement(LocaleProvider, null, createElement(ActivitySection, { api, openPath }))))
  await flush()
  return openPath
}

const lines = () => Array.from(host.querySelectorAll('.activity__line')).map((n) => n.textContent)

describe('ActivitySection', () => {
  it('says each event as a sentence, with "you" when it is about the reader', async () => {
    await mount({
      shareActivity: vi.fn(async () => [
        ev(9, { kind: 'version', detail: { version: 4 }, localPath: 'C:\\work\\Plan.docx' }),
        ev(8, { kind: 'role', detail: { name: 'Min Park', role: 'comment' as const } }),
        ev(7, { kind: 'role', detail: { name: 'Me', role: 'edit' as const }, you: true }),
        ev(6, { kind: 'shared', detail: { name: 'Me' }, you: true }),
        ev(5, { kind: 'renamed', detail: { from: 'Old.docx' } }),
        ev(4, { kind: 'removed', detail: { name: 'Me' }, you: true }),
        ev(3, { kind: 'transferred', detail: { name: 'Min Park' } }),
        ev(2, { kind: 'comment', detail: { reply: true } }),
        ev(1, { kind: 'unshared' }),
      ]),
    })
    expect(lines()).toEqual([
      'Jae Gardner saved version 4 of Plan.docx.',
      'Jae Gardner changed what Min Park may do in Plan.docx: comment.',
      'Jae Gardner changed what you may do in Plan.docx: edit.',
      'Jae Gardner shared Plan.docx with you.',
      'Jae Gardner renamed Old.docx to Plan.docx.',
      'Jae Gardner took you off Plan.docx. Your copy stays on this computer.',
      'Jae Gardner made Min Park the owner of Plan.docx.',
      'Jae Gardner replied to a comment on Plan.docx.',
      'Jae Gardner stopped sharing Plan.docx. Your copy stays on this computer.',
    ])
    // nothing to open once the file is gone for the reader and no copy is here
    const rows = Array.from(host.querySelectorAll('.shared-row'))
    expect(rows[5]!.querySelector('button')).toBeNull()
    expect(rows[8]!.querySelector('button')).toBeNull()
    expect(rows[0]!.querySelector('button')).not.toBeNull()
  })

  it('opens the local copy, or downloads a file still shared', async () => {
    const openShared = vi.fn(async () => ({ ok: true as const, path: 'C:\\Shared\\Plan.docx' }))
    const openPath = await mount({
      shareActivity: vi.fn(async () => [ev(2, { localPath: 'C:\\work\\Plan.docx' }), ev(1, { kind: 'joined', fileId: ID })]),
      openShared,
    })
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.shared-row button'))
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Open Plan.docx')
    await act(async () => buttons[0]!.click())
    expect(openPath).toHaveBeenCalledWith('C:\\work\\Plan.docx')
    await act(async () => buttons[1]!.click())
    expect(openShared).toHaveBeenCalledWith(ID)
  })

  it('shows nothing when sharing is not set up, and asks again every minute', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const shareActivity = vi.fn(async (): Promise<SharedActivity[] | { error: string }> => ({ error: 'Sign in to Redrob in Settings, Sharing, to share files.' }))
    await mount({ shareActivity })
    expect(host.querySelector('.activity')).toBeNull()
    shareActivity.mockResolvedValue([ev(1, { detail: { version: 2 } })])
    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_POLL_MS)
    })
    await flush()
    expect(shareActivity).toHaveBeenCalledTimes(2)
    expect(lines()).toEqual(['Jae Gardner saved version 2 of Plan.docx.'])
  })
})
