/**
 * @vitest-environment jsdom
 *
 * Joining from an invite link: a link from outside the app opens the dialog,
 * which says who shares what, and nothing is joined until the person says so.
 */
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../src/renderer/src/locale'
import { useJoinLink, type JoinApi } from '../src/renderer/src/home/JoinLink'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

const LINK = `redrob-office://join/${'k'.repeat(43)}`

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

let openBlank: () => void = () => undefined
function Harness({ api }: { api: JoinApi }): ReactElement | null {
  const j = useJoinLink(api)
  openBlank = j.openBlank
  return j.dialog
}

async function mount(api: JoinApi) {
  act(() => root.render(createElement(LocaleProvider, null, createElement(Harness, { api }))))
  await flush()
}

const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === label)

describe('useJoinLink', () => {
  it('a link opened from outside shows who shares what; Join uses it and opens the file', async () => {
    let push: (l: string) => void = () => undefined
    const api: JoinApi = {
      shareTakeJoinRequest: vi.fn(async () => null),
      onShareJoinRequest: vi.fn((h: (l: string) => void) => {
        push = h
        return () => undefined
      }),
      shareLinkPeek: vi.fn(async () => ({
        ok: true as const,
        preview: { fileName: 'Plan.docx', ownerName: 'Felix Kim', role: 'edit' as const, expiresAt: '2026-10-14T00:00:00.000Z', alreadyHave: null },
      })),
      shareLinkJoin: vi.fn(async () => ({ ok: true as const, path: 'C:\\Shared\\Plan.docx' })),
    }
    await mount(api)
    expect(document.querySelector('.join-link')).toBeNull()
    await act(async () => push(LINK))
    await flush()
    expect(api.shareLinkPeek).toHaveBeenCalledWith(LINK)
    expect(document.body.textContent).toContain('Felix Kim shares Plan.docx.')
    expect(document.body.textContent).toContain('With this link you can edit.')
    expect(api.shareLinkJoin).not.toHaveBeenCalled()
    await act(async () => button('Join and open')!.click())
    await flush()
    expect(api.shareLinkJoin).toHaveBeenCalledWith(LINK)
    expect(document.querySelector('.join-link')).toBeNull()
  })

  it('takes a link that arrived before Home loaded, and Cancel joins nothing', async () => {
    const api: JoinApi = {
      shareTakeJoinRequest: vi.fn(async () => LINK),
      shareLinkPeek: vi.fn(async () => ({
        ok: true as const,
        preview: { fileName: 'Plan.docx', ownerName: 'Felix Kim', role: 'view' as const, expiresAt: 'x', alreadyHave: 'comment' as const },
      })),
      shareLinkJoin: vi.fn(),
    }
    await mount(api)
    await flush()
    expect(document.body.textContent).toContain('You already have this file and can comment.')
    expect(button('Open')).toBeDefined()
    act(() => button('Cancel')!.click())
    expect(api.shareLinkJoin).not.toHaveBeenCalled()
    expect(document.querySelector('.join-link')).toBeNull()
  })

  it('a pasted link is checked first; a link that does not work says so', async () => {
    const api: JoinApi = {
      shareLinkPeek: vi.fn(async () => ({ ok: false as const, error: 'This link does not work any more. Ask the owner for a new one.' })),
      shareLinkJoin: vi.fn(),
    }
    await mount(api)
    act(() => openBlank())
    const input = document.querySelector<HTMLInputElement>('.join-link input')!
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      set.call(input, LINK)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => document.querySelector<HTMLFormElement>('.join-link form')!.requestSubmit())
    await flush()
    expect(api.shareLinkPeek).toHaveBeenCalledWith(LINK)
    expect(document.body.textContent).toContain('This link does not work any more.')
    expect(button('Join and open')).toBeUndefined()
  })
})
