/**
 * @vitest-environment jsdom
 *
 * Home's Shared view: "Shared with you" and "Shared by you", each opened
 * through the shell, with a plain message when the service is not there.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareApi } from '@genoffice/sync-client'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SharedView } from '../src/renderer/src/home/SharedView'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

const A = '11111111-2222-4333-8444-555555555555'
const B = '99999999-2222-4333-8444-555555555555'

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

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)))

async function mount(api: Partial<ShareApi>) {
  act(() => root.render(createElement(LocaleProvider, null, createElement(SharedView, { api }))))
  await flush()
}

const names = () => Array.from(host.querySelectorAll('.shared-row .updf__n')).map((n) => n.textContent)
const details = () => Array.from(host.querySelectorAll('.shared-row .updf__dir')).map((n) => n.textContent)

describe('SharedView', () => {
  it('lists files shared with you, then the ones you share, with how many others have each', async () => {
    const api: Partial<ShareApi> = {
      sharedWithMe: vi.fn(async () => [{ id: A, name: 'Budget.xlsx', role: 'comment' as const, localPath: null }]),
      sharedByMe: vi.fn(async () => [
        { id: B, name: 'Plan.docx', localPath: 'C:\\work\\Plan.docx', people: 2 },
        { id: A, name: 'Notes.md', localPath: null, people: 1 },
      ]),
      openShared: vi.fn(async () => ({ ok: true as const, path: 'C:\\work\\Plan.docx' })),
    }
    await mount(api)
    expect(names()).toEqual(['Budget.xlsx'])
    expect(details()).toEqual(['You can comment'])

    const byMe = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((b) => b.textContent === 'Shared by you')!
    act(() => byMe.click())
    await flush()
    expect(names()).toEqual(['Plan.docx', 'Notes.md'])
    expect(details()).toEqual(['2 other people', '1 other person'])
    expect(host.querySelector('.shared-row .updf__s')!.textContent).toBe('On this computer')

    const open = host.querySelector<HTMLButtonElement>('.shared-row button')!
    await act(async () => open.click())
    expect(api.openShared).toHaveBeenCalledWith(B)
  })

  it('says so when nothing is shared, and shows a service error with a retry', async () => {
    const sharedByMe = vi.fn(async () => ({ error: 'The sync service could not be reached. Nothing changed.' }))
    await mount({ sharedWithMe: vi.fn(async () => []), sharedByMe })
    expect(host.textContent).toContain('Nothing is shared with you yet')
    const byMe = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((b) => b.textContent === 'Shared by you')!
    act(() => byMe.click())
    await flush()
    expect(host.textContent).toContain('The sync service could not be reached.')
    const retry = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Try again')!
    act(() => retry.click())
    await flush()
    expect(sharedByMe).toHaveBeenCalledTimes(2)
  })
})
