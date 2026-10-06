/**
 * @vitest-environment jsdom
 *
 * Share: who has the file and what each may do.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareApi, ShareStatus } from '@genoffice/sync-client'
import { SHARE_STRINGS, ShareDialog } from '@genoffice/ui'

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

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)))
const PATH = 'C:\\Docs\\NDA.docx'

function api(status: ShareStatus, over: Partial<ShareApi> = {}): ShareApi {
  return {
    shareStatus: vi.fn(async () => status),
    shareInvite: vi.fn(async () => ({ ok: true as const, status })),
    shareRemove: vi.fn(async () => ({ ok: true as const, status })),
    shareStop: vi.fn(async () => ({ ok: true as const, status: { available: true as const, shared: false as const } })),
    sharedWithMe: vi.fn(async () => []),
    sharedByMe: vi.fn(async () => []),
    openShared: vi.fn(async () => ({ ok: false as const, error: 'no' })),
    ...over,
  }
}

function type(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const render = async (props: Partial<Parameters<typeof ShareDialog>[0]>) => {
  act(() => root.render(createElement(ShareDialog, { open: true, onClose: vi.fn(), path: PATH, fileName: 'NDA.docx', api: undefined, ...props })))
  await flush()
}

describe('ShareDialog', () => {
  it('says why sharing is unavailable', async () => {
    await render({ api: undefined })
    expect(document.body.textContent).toContain(SHARE_STRINGS.noService)
    await render({ api: api({ available: false, reason: 'signed-out' }) })
    expect(document.body.textContent).toContain(SHARE_STRINGS.signedOut)
    await render({ api: api({ available: true, shared: false }), path: null })
    expect(document.body.textContent).toContain(SHARE_STRINGS.unsaved)
  })

  it('the owner invites an account with a role and sees who has access', async () => {
    const after: ShareStatus = {
      available: true,
      shared: true,
      role: 'owner',
      members: [
        { sub: 'me', name: 'Me', role: 'owner' },
        { sub: 'kim@redrob.io', name: 'kim@redrob.io', role: 'comment' },
      ],
    }
    const a = api({ available: true, shared: false }, { shareInvite: vi.fn(async () => ({ ok: true as const, status: after })) })
    await render({ api: a })
    expect(document.body.textContent).toContain(SHARE_STRINGS.notShared)
    type(document.querySelector('.doc-share input') as HTMLInputElement, 'kim@redrob.io')
    const select = document.querySelector('.doc-share select') as HTMLSelectElement
    act(() => {
      select.value = 'comment'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const form = document.querySelector('.doc-share form') as HTMLFormElement
    await act(async () => form.requestSubmit())
    await flush()
    expect(a.shareInvite).toHaveBeenCalledWith(PATH, 'kim@redrob.io', 'comment')
    const people = [...document.querySelectorAll('.doc-share__people li')].map((li) => li.textContent)
    expect(people[1]).toContain('kim@redrob.io')
    expect(people[1]).toContain(SHARE_STRINGS.roleComment)
    // the owner may remove anyone but themselves
    expect(document.querySelectorAll('.doc-share__people button')).toHaveLength(1)
  })

  it('a failed invite shows the error and keeps the account typed', async () => {
    const a = api(
      { available: true, shared: false },
      { shareInvite: vi.fn(async () => ({ ok: false as const, error: 'The sync service could not be reached. Nothing changed.' })) },
    )
    await render({ api: a })
    const input = document.querySelector('.doc-share input') as HTMLInputElement
    type(input, 'kim')
    await act(async () => (document.querySelector('.doc-share form') as HTMLFormElement).requestSubmit())
    await flush()
    expect(document.body.textContent).toContain('The sync service could not be reached. Nothing changed.')
    expect(input.value).toBe('kim')
  })

  it('the owner stops sharing only after confirming what it does', async () => {
    const a = api({ available: true, shared: true, role: 'owner', members: [{ sub: 'me', name: 'Me', role: 'owner' }, { sub: 'kim', name: 'Kim', role: 'edit' }] })
    await render({ api: a })
    const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.doc-share button')].find((b) => b.textContent === label)
    act(() => button(SHARE_STRINGS.stop)!.click())
    expect(document.body.textContent).toContain(SHARE_STRINGS.stopWhy)
    act(() => button(SHARE_STRINGS.stopCancel)!.click())
    expect(a.shareStop).not.toHaveBeenCalled()
    act(() => button(SHARE_STRINGS.stop)!.click())
    await act(async () => button(SHARE_STRINGS.stopConfirm)!.click())
    await flush()
    expect(a.shareStop).toHaveBeenCalledWith(PATH)
    expect(document.body.textContent).toContain(SHARE_STRINGS.notShared)
    expect(button(SHARE_STRINGS.stop)).toBeUndefined()
  })

  it('the owner sees invites nobody has taken up and can cancel one', async () => {
    const a = api({
      available: true,
      shared: true,
      role: 'owner',
      members: [{ sub: 'me', name: 'Me', role: 'owner' }],
      pending: [{ email: 'mina@example.com', role: 'view' }],
    })
    await render({ api: a })
    expect(document.body.textContent).toContain(SHARE_STRINGS.pending)
    const cancel = document.querySelector<HTMLButtonElement>('.doc-share__pending button')!
    expect(cancel.getAttribute('aria-label')).toBe('Cancel the invite to mina@example.com')
    await act(async () => cancel.click())
    expect(a.shareRemove).toHaveBeenCalledWith(PATH, 'mina@example.com')
  })

  it('someone who is not the owner sees the people but cannot invite or remove', async () => {
    await render({
      api: api({ available: true, shared: true, role: 'edit', members: [{ sub: 'kim', name: 'Kim', role: 'owner' }, { sub: 'me', name: 'Me', role: 'edit' }] }),
    })
    expect(document.querySelector('.doc-share form')).toBeNull()
    expect(document.querySelectorAll('.doc-share__people li')).toHaveLength(2)
    expect(document.querySelectorAll('.doc-share__people button')).toHaveLength(0)
  })
})
