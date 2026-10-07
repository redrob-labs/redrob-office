/**
 * @vitest-environment jsdom
 *
 * The shared live hooks: the room mirror over the shell's IPC, and the
 * base-version handshake for an editor bound to the shared text.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { prosemirrorToYXmlFragment } from 'y-prosemirror'
import { LIVE_BASE_KEY, LIVE_META, type LiveApi, type LiveJoin, type LivePeer } from '@genoffice/sync-client'
import { FRAGMENT, LIVE_STRINGS, facesFor, presenceAt, useLiveEditor, useLiveRoom, type LiveEditorDeps, type LiveState } from '../src'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true
const FILE = '11111111-2222-4333-8444-555555555555'
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)))

let host: HTMLDivElement
let root: Root
const editors: Editor[] = []
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  for (const e of editors.splice(0)) e.destroy()
})

function editorWith(text: string) {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({ element, extensions: [StarterKit], content: `<p>${text}</p>` })
  editors.push(editor)
  return editor
}

function liveOf(doc: Y.Doc, version: number, readOnly = false): LiveState {
  return { kind: 'live', fileId: FILE, role: readOnly ? 'view' : 'edit', readOnly, version, doc }
}

function Probe({ deps }: { deps: LiveEditorDeps }) {
  useLiveEditor(deps)
  return null
}

function deps(over: Partial<LiveEditorDeps> & Pick<LiveEditorDeps, 'editor' | 'live'>): LiveEditorDeps {
  return {
    peers: [],
    api: { livePull: vi.fn(async () => ({ ok: true as const, bytes: new Uint8Array([5]), version: 5 })), livePresence: vi.fn() },
    path: 'C:\\work\\Plan.md',
    loadBytes: vi.fn(async () => true),
    setStatus: vi.fn(),
    protectedBlocks: ['paragraph'],
    ...over,
  }
}

describe('useLiveEditor', () => {
  it('the first writer in an empty room loads the latest shared version, seeds the text and records the base', async () => {
    const editor = editorWith('local copy')
    const doc = new Y.Doc()
    const d = deps({ editor, live: liveOf(doc, 2) })
    act(() => root.render(createElement(Probe, { deps: d })))
    await flush()
    await flush()
    expect(d.loadBytes).toHaveBeenCalledWith(new Uint8Array([5]))
    expect(doc.getMap(LIVE_META).get(LIVE_BASE_KEY)).toBe(5)
    expect(doc.getXmlFragment(FRAGMENT).length).toBeGreaterThan(0)
  })

  it('a later joiner on an older version rebases when it has to, and takes the shared text either way', async () => {
    const seededBy = editorWith('shared words')
    const doc = new Y.Doc()
    prosemirrorToYXmlFragment(seededBy.state.doc, doc.getXmlFragment(FRAGMENT))
    doc.getMap(LIVE_META).set(LIVE_BASE_KEY, 5)
    const editor = editorWith('stale words')
    const rebase = vi.fn(async () => true)
    const d = deps({ editor, live: liveOf(doc, 2), rebase })
    act(() => root.render(createElement(Probe, { deps: d })))
    await flush()
    await flush()
    expect(rebase).toHaveBeenCalledWith(new Uint8Array([5]))
    expect(d.loadBytes).not.toHaveBeenCalled()
    expect(editor.state.doc.textContent).toBe('shared words')
  })

  it("someone else's save moves the base: the view rebases and says so", async () => {
    const editor = editorWith('words')
    const doc = new Y.Doc()
    const rebase = vi.fn(async () => true)
    const d = deps({
      editor,
      live: liveOf(doc, 5),
      rebase,
      api: { livePull: vi.fn(async () => ({ ok: true as const, bytes: new Uint8Array([7]), version: 7 })), livePresence: vi.fn() },
    })
    act(() => root.render(createElement(Probe, { deps: d })))
    await flush()
    await flush()
    // the empty room was seeded at the pulled version; now the service moves it on
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc))
    remote.getMap(LIVE_META).set(LIVE_BASE_KEY, 9)
    await act(async () => Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'room'))
    await flush()
    expect(rebase).toHaveBeenLastCalledWith(new Uint8Array([7]))
    expect(d.setStatus).toHaveBeenCalledWith(LIVE_STRINGS.rebased)
  })

  it('a viewer in an empty room waits and never seeds', async () => {
    const editor = editorWith('mine')
    const doc = new Y.Doc()
    const d = deps({ editor, live: liveOf(doc, 2, true) })
    act(() => root.render(createElement(Probe, { deps: d })))
    await flush()
    expect(doc.getXmlFragment(FRAGMENT).length).toBe(0)
    expect(d.loadBytes).not.toHaveBeenCalled()
  })
})

describe('useLiveRoom', () => {
  function RoomProbe({ api, path, seen }: { api: Partial<LiveApi>; path: string | null; seen: (s: LiveState, p: LivePeer[]) => void }) {
    const r = useLiveRoom({ api, path })
    seen(r.state, r.peers)
    return null
  }

  it('mirrors the room: the join state, updates both ways without echo, peers, and leave on unmount', async () => {
    const room = new Y.Doc()
    room.getText('t').insert(0, 'hello')
    let remote: ((fileId: string, u: Uint8Array) => void) | null = null
    const sent: Uint8Array[] = []
    const peer: LivePeer = { clientId: 9, id: 'jae', name: 'Jae', at: null, cursor: null }
    const api: Partial<LiveApi> = {
      liveJoin: vi.fn(async (): Promise<LiveJoin> => ({ ok: true, fileId: FILE, role: 'edit', readOnly: false, version: 3, state: Y.encodeStateAsUpdate(room), peers: [peer] })),
      liveUpdate: vi.fn((_f: string, u: Uint8Array) => void sent.push(u)),
      liveLeave: vi.fn(),
      onLiveUpdate: (h) => {
        remote = h
        return () => undefined
      },
      onLivePeers: () => () => undefined,
    }
    let state: LiveState = { kind: 'off' }
    let peers: LivePeer[] = []
    act(() => root.render(createElement(RoomProbe, { api, path: 'C:\\work\\Plan.md', seen: (s, p) => ((state = s), (peers = p)) })))
    await flush()
    expect(state.kind).toBe('live')
    const doc = (state as unknown as Extract<LiveState, { kind: 'live' }>).doc
    expect(doc.getText('t').toString()).toBe('hello')
    expect(peers).toEqual([peer])
    // a remote update is applied and not sent back
    const other = new Y.Doc()
    Y.applyUpdate(other, Y.encodeStateAsUpdate(room))
    other.getText('t').insert(5, ' world')
    act(() => remote!(FILE, Y.encodeStateAsUpdate(other)))
    expect(doc.getText('t').toString()).toBe('hello world')
    expect(sent).toHaveLength(0)
    // a local edit is sent
    doc.getText('t').insert(0, '>')
    expect(sent).toHaveLength(1)
    act(() => root.render(createElement(RoomProbe, { api, path: null, seen: () => undefined })))
    expect(api.liveLeave).toHaveBeenCalledWith(FILE)
  })

  it('a file that is not shared stays off; signed out says why', async () => {
    let state: LiveState = { kind: 'joining' }
    const api: Partial<LiveApi> = { liveJoin: async () => ({ ok: false, reason: 'signed-out' }), liveUpdate: vi.fn(), liveLeave: vi.fn() }
    act(() => root.render(createElement(RoomProbe, { api, path: 'C:\\x.md', seen: (s) => (state = s) })))
    await flush()
    expect(state).toEqual({ kind: 'unavailable', reason: 'signed-out' })
  })
})

describe('presence helpers', () => {
  it('names the block a position is in, and shows one face per person', () => {
    const editor = editorWith('Opening words of the plan')
    expect(presenceAt(editor.state.doc, 3)).toEqual({ block: 0, text: 'Opening words of the plan' })
    const p = (clientId: number, id: string, text?: string): LivePeer => ({ clientId, id, name: id, at: text ? { block: 0, text } : null, cursor: null })
    expect(facesFor([p(1, 'jae', 'intro'), p(2, 'jae'), p(3, 'min', 'end')])).toEqual([
      { key: 'jae', name: 'jae', where: 'intro' },
      { key: 'min', name: 'min', where: 'end' },
    ])
  })
})
