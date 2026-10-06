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
    shareCommentAdd: vi.fn(async () => ({ ok: true as const, id: '123456789' })),
    shareCommentUpdate: vi.fn(async () => ({ ok: true as const })),
    openShared: vi.fn(async () => ({ ok: false as const, error: 'no' })),
    shareVersions: vi.fn(async () => null),
    shareRestoreVersion: vi.fn(async () => ({ ok: false as const, error: 'no' })),
    shareTransfer: vi.fn(async () => ({ ok: true as const, status })),
    shareLeave: vi.fn(async () => ({ ok: true as const, status: { available: true as const, shared: false as const } })),
    shareActivity: vi.fn(async () => []),
    shareLinkCreate: vi.fn(async () => ({ ok: false as const, error: 'no' })),
    shareLinks: vi.fn(async () => null),
    shareLinkRevoke: vi.fn(async () => ({ ok: true as const })),
    shareLinkPeek: vi.fn(async () => ({ ok: false as const, error: 'no' })),
    shareLinkJoin: vi.fn(async () => ({ ok: false as const, error: 'no' })),
    onShareJoinRequest: vi.fn(() => () => undefined),
    shareTakeJoinRequest: vi.fn(async () => null),
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

  it('the owner makes an editor the owner after confirming, and becomes an editor', async () => {
    const after: ShareStatus = {
      available: true,
      shared: true,
      role: 'edit',
      members: [{ sub: 'me', name: 'Me', role: 'edit' }, { sub: 'kim', name: 'Kim', role: 'owner' }],
    }
    const a = api(
      { available: true, shared: true, role: 'owner', members: [{ sub: 'me', name: 'Me', role: 'owner' }, { sub: 'kim', name: 'Kim', role: 'edit' }, { sub: 'min', name: 'Min', role: 'view' }] },
      { shareTransfer: vi.fn(async () => ({ ok: true as const, status: after })) },
    )
    await render({ api: a })
    const byLabel = (label: string) => document.querySelector<HTMLButtonElement>(`.doc-share button[aria-label="${label}"]`)
    // only an editor can be handed the file
    expect(byLabel('Make Kim the owner')).not.toBeNull()
    expect(byLabel('Make Min the owner')).toBeNull()
    act(() => byLabel('Make Kim the owner')!.click())
    expect(document.body.textContent).toContain('Kim becomes the owner')
    expect(a.shareTransfer).not.toHaveBeenCalled()
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('.doc-share button')].find((b) => b.textContent === 'Make Kim the owner')!
    await act(async () => confirm.click())
    await flush()
    expect(a.shareTransfer).toHaveBeenCalledWith(PATH, 'kim')
    // now an editor: no invite form, and Leave is offered
    expect(document.querySelector('.doc-share form')).toBeNull()
    expect(document.body.textContent).toContain(SHARE_STRINGS.leave)
  })

  it('someone who is not the owner leaves after confirming; the owner is never offered it', async () => {
    const a = api({ available: true, shared: true, role: 'view', members: [{ sub: 'kim', name: 'Kim', role: 'owner' }, { sub: 'me', name: 'Me', role: 'view' }] })
    await render({ api: a })
    const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.doc-share button')].find((b) => b.textContent === label)
    act(() => button(SHARE_STRINGS.leave)!.click())
    expect(document.body.textContent).toContain(SHARE_STRINGS.leaveWhy)
    await act(async () => button(SHARE_STRINGS.leaveConfirm)!.click())
    await flush()
    expect(a.shareLeave).toHaveBeenCalledWith(PATH)
    expect(document.body.textContent).toContain(SHARE_STRINGS.notShared)

    await render({ api: api({ available: true, shared: true, role: 'owner', members: [{ sub: 'me', name: 'Me', role: 'owner' }] }) })
    expect(button(SHARE_STRINGS.leave)).toBeUndefined()
  })

  it('the owner makes an invite link, sees it once to copy, and can revoke links', async () => {
    const shared: ShareStatus = { available: true, shared: true, role: 'owner', members: [{ sub: 'me', name: 'Me', role: 'owner' }] }
    const link = { id: '22222222-2222-4333-8444-555555555555', role: 'comment' as const, createdAt: 'x', expiresAt: '2099-01-01T00:00:00.000Z', uses: 1 }
    const a = api(shared, {
      shareLinks: vi.fn(async () => [link]),
      shareLinkCreate: vi.fn(async () => ({ ok: true as const, url: `redrob-office://join/${'z'.repeat(43)}`, link })),
      shareLinkRevoke: vi.fn(async () => ({ ok: true as const })),
    })
    await render({ api: a })
    expect(document.body.textContent).toContain(SHARE_STRINGS.linkTitle)
    expect(document.querySelector('.doc-share__linklist')!.textContent).toContain('used once')
    const selects = document.querySelectorAll<HTMLSelectElement>('.doc-share__links select')
    act(() => {
      selects[0]!.value = 'comment'
      selects[0]!.dispatchEvent(new Event('change', { bubbles: true }))
      selects[1]!.value = '30'
      selects[1]!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const create = [...document.querySelectorAll<HTMLButtonElement>('.doc-share button')].find((b) => b.textContent === SHARE_STRINGS.linkCreate)!
    await act(async () => create.click())
    await flush()
    expect(a.shareLinkCreate).toHaveBeenCalledWith(PATH, 'comment', 30)
    expect((document.querySelector('.doc-share__made input') as HTMLInputElement).value).toBe(`redrob-office://join/${'z'.repeat(43)}`)
    expect(document.body.textContent).toContain(SHARE_STRINGS.linkMade)
    const revoke = document.querySelector<HTMLButtonElement>('.doc-share__linklist button')!
    expect(revoke.getAttribute('aria-label')).toMatch(/^Revoke the Comment link until /)
    await act(async () => revoke.click())
    expect(a.shareLinkRevoke).toHaveBeenCalledWith(PATH, link.id)
    expect(document.querySelector('.doc-share__linklist')).toBeNull()
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
