/**
 * @vitest-environment jsdom
 *
 * Presence in a shared file: the live room mirrored over IPC, and the faces.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { PresenceFaces } from '@genoffice/ui'
import type { LiveApi, LiveJoin, LivePeer } from '@genoffice/sync-client'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { FROM_ROOM, LIVE_STRINGS, facesFor, presenceAt, useLive } from '../src/renderer/live/useLive'

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
const FILE = '11111111-2222-4333-8444-555555555555'
const kim: LivePeer = { clientId: 2, id: 'kim', name: 'Kim Jae', at: { block: 1, text: 'Payment terms' }, cursor: null }

function makeEditor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [
        { type: 'docParagraph', content: [{ type: 'text', text: 'Intro' }] },
        { type: 'docParagraph', content: [{ type: 'text', text: 'Payment   terms are net 30 days from the invoice date, always' }] },
      ],
    },
  })
}

function fakeApi(join: LiveJoin) {
  const handlers: { update?: (f: string, u: Uint8Array) => void; peers?: (f: string, p: LivePeer[]) => void } = {}
  const api = {
    liveJoin: vi.fn(async () => join),
    livePull: vi.fn(async () => ({ ok: false as const })),
    liveUpdate: vi.fn(),
    livePresence: vi.fn(),
    liveLeave: vi.fn(),
    onLiveUpdate: vi.fn((h: (f: string, u: Uint8Array) => void) => {
      handlers.update = h
      return () => delete handlers.update
    }),
    onLivePeers: vi.fn((h: (f: string, p: LivePeer[]) => void) => {
      handlers.peers = h
      return () => delete handlers.peers
    }),
  } satisfies LiveApi
  return { api, handlers }
}

describe('presence helpers', () => {
  it('presenceAt names the top-level block and its opening words', () => {
    const editor = makeEditor()
    const second = editor.state.doc.child(0).nodeSize + 3
    expect(presenceAt(editor.state.doc, second)).toEqual({ block: 1, text: 'Payment terms are net 30 days from the i' })
    expect(presenceAt(editor.state.doc, 0)).toEqual({ block: 0, text: 'Intro' })
    editor.destroy()
  })

  it('facesFor shows one face per account', () => {
    expect(facesFor([kim, { ...kim, clientId: 3, at: null }, { ...kim, clientId: 4, id: 'lee', name: 'Lee' }])).toEqual([
      { key: 'kim', name: 'Kim Jae', where: 'Payment terms' },
      { key: 'lee', name: 'Lee', where: 'Payment terms' },
    ])
  })

  it('PresenceFaces names each person and where they are, and collapses the rest', () => {
    const strings = { label: LIVE_STRINGS.facesLabel, person: LIVE_STRINGS.person, personHere: LIVE_STRINGS.personHere, more: LIVE_STRINGS.more }
    const people = ['Ann', 'Bo', 'Cy', 'Di', 'Ed'].map((n) => ({ key: n, name: n }))
    people[0] = { key: 'kim', name: 'Kim Jae', where: 'Payment terms' } as never
    act(() => root.render(createElement(PresenceFaces, { people, strings })))
    const list = host.querySelector('ul.go-faces')!
    expect(list.getAttribute('aria-label')).toBe('People in this file')
    const faces = [...list.querySelectorAll('li')]
    expect(faces).toHaveLength(4)
    expect(faces[0]!.textContent).toContain('KJ')
    expect(faces[0]!.querySelector('.go-face__sr')!.textContent).toBe('Kim Jae, near "Payment terms"')
    expect(faces[3]!.textContent).toContain('+2')
    expect(faces[3]!.querySelector('.go-face__sr')!.textContent).toBe('Di is here, Ed is here')
  })
})

describe('PresenceFaces announcements', () => {
  it('tells a screen reader who opened the file and who left, not every move', async () => {
    const strings = {
      label: LIVE_STRINGS.facesLabel,
      person: LIVE_STRINGS.person,
      personHere: LIVE_STRINGS.personHere,
      more: LIVE_STRINGS.more,
      joined: LIVE_STRINGS.joined,
      left: LIVE_STRINGS.left,
    }
    const status = () => host.querySelector('[role="status"]')!.textContent
    act(() => root.render(createElement(PresenceFaces, { people: [], strings })))
    expect(status()).toBe('')
    act(() => root.render(createElement(PresenceFaces, { people: [{ key: 'kim', name: 'Kim' }], strings })))
    expect(status()).toBe('Kim opened this file')
    act(() => root.render(createElement(PresenceFaces, { people: [{ key: 'kim', name: 'Kim', where: 'Payment terms' }], strings })))
    expect(status()).toBe('Kim opened this file')
    act(() => root.render(createElement(PresenceFaces, { people: [], strings })))
    expect(status()).toBe('Kim left')
    expect(host.querySelector('ul.go-faces')).toBeNull()
  })
})

describe('useLive', () => {
  let seen: ReturnType<typeof useLive> | null = null
  function Probe(props: Parameters<typeof useLive>[0]) {
    seen = useLive(props)
    return null
  }

  it('joins a shared file, mirrors updates both ways, lists peers and tells the room where this person is', async () => {
    const room = new Y.Doc()
    room.getText('t').insert(0, 'from the room')
    const { api, handlers } = fakeApi({ ok: true, fileId: FILE, role: 'edit', readOnly: false, version: 1, state: Y.encodeStateAsUpdate(room), peers: [kim] })
    const editor = makeEditor()
    act(() => root.render(createElement(Probe, { api, path: 'C:\\x\\Plan.docx', editor })))
    await flush()
    expect(seen!.state.kind).toBe('live')
    const doc = (seen!.state as { doc: Y.Doc }).doc
    expect(doc.getText('t').toString()).toBe('from the room')
    expect(seen!.faces).toEqual([{ key: 'kim', name: 'Kim Jae', where: 'Payment terms' }])
    expect(api.livePresence).toHaveBeenCalledWith(FILE, { at: { block: 0, text: 'Intro' } })

    // a local change goes to the room; one from the room does not echo back
    doc.getText('t').insert(0, '> ')
    expect(api.liveUpdate).toHaveBeenCalledTimes(1)
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc))
    let u: Uint8Array | null = null
    remote.on('update', (x: Uint8Array) => (u = x))
    remote.getText('t').insert(remote.getText('t').length, '!')
    act(() => handlers.update!(FILE, u!))
    expect(doc.getText('t').toString()).toBe('> from the room!')
    expect(api.liveUpdate).toHaveBeenCalledTimes(1)

    act(() => handlers.peers!(FILE, []))
    expect(seen!.faces).toEqual([])

    act(() => root.render(createElement(Probe, { api, path: null, editor })))
    expect(api.liveLeave).toHaveBeenCalledWith(FILE)
    expect(seen!.state.kind).toBe('off')
    editor.destroy()
  })

  it('stays off for a file that is not shared, and says when the room cannot be reached', async () => {
    const off = fakeApi({ ok: false, reason: 'not-shared' })
    act(() => root.render(createElement(Probe, { api: off.api, path: 'C:\\x\\a.docx', editor: null })))
    await flush()
    expect(seen!.state).toEqual({ kind: 'off' })
    const down = fakeApi({ ok: false, reason: 'unreachable' })
    act(() => root.render(createElement(Probe, { api: down.api, path: 'C:\\x\\b.docx', editor: null })))
    await flush()
    expect(seen!.state).toEqual({ kind: 'unavailable', reason: 'unreachable' })
    expect(FROM_ROOM).toBeTypeOf('symbol')
  })
})
