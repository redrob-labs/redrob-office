/**
 * @vitest-environment jsdom
 *
 * Live typing in the Hangul editor (spec tasks 5.4 and 5.5) against a fake
 * room that behaves like the shell's LiveHub: one Y.Doc per file, updates
 * relayed to the other views, presence relayed as peers.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as Y from 'yjs'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Session, type Pos } from '@genoffice/hwp-editor'
import { LIVE_BASE_KEY, LIVE_META, type LiveApi, type LivePeer, type LivePresence } from '@genoffice/sync-client'
import { useHangulLive } from '../src/renderer/next/useHangulLive'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true
beforeAll(() => initHwpCoreNode())

const P = (para: number, offset: number): Pos => ({ section: 0, para, offset })

function bytes(text: string): Uint8Array {
  const d = HwpCoreDocument.blank()
  d.insertText(0, 0, 0, text)
  return d.export('hwpx')
}

/** The shell's room, in memory. */
class Room {
  doc = new Y.Doc()
  views: Array<{ clientId: number; name: string; onUpdate?: (f: string, u: Uint8Array) => void; onPeers?: (f: string, p: LivePeer[]) => void; presence: LivePresence }> = []
  version = 1
  latest: Uint8Array
  constructor(initial: Uint8Array) {
    this.latest = initial
  }
  /** Like LiveHub.peersOf: everyone in the room except the viewer. */
  peers(viewer: Room['views'][number]): LivePeer[] {
    return this.views.filter((v) => v !== viewer).map((v) => ({ clientId: v.clientId, id: v.name, name: v.name, at: v.presence.at ?? null, cursor: v.presence.cursor ?? null }))
  }
  api(name: string, role: 'owner' | 'edit' | 'view' = 'edit', version = this.version): Partial<LiveApi> {
    const me = { clientId: 0, name, presence: {} as LivePresence } as Room['views'][number]
    return {
      liveJoin: async () => {
        me.clientId = this.views.length + 100
        this.views.push(me)
        this.views.forEach((v) => v.onPeers?.('f', this.peers(v)))
        return { ok: true, fileId: 'f', role, readOnly: role === 'view', version, state: Y.encodeStateAsUpdate(this.doc), peers: this.peers(me) }
      },
      livePull: async () => ({ ok: true, bytes: this.latest, version: this.version }),
      liveUpdate: (_f, u) => {
        Y.applyUpdate(this.doc, u)
        for (const v of this.views) if (v !== me) v.onUpdate?.('f', u)
      },
      livePresence: (_f, p) => {
        me.presence = p
        for (const v of this.views) if (v !== me) v.onPeers?.('f', this.peers(v))
      },
      liveLeave: () => {
        this.views = this.views.filter((v) => v !== me)
      },
      onLiveUpdate: (h) => ((me.onUpdate = h), () => (me.onUpdate = undefined)),
      onLivePeers: (h) => ((me.onPeers = h), () => (me.onPeers = undefined)),
    }
  }
  /** Someone saved: a new shared version and a new base. */
  saved(newBytes: Uint8Array) {
    this.version += 1
    this.latest = newBytes
    const meta = this.doc.getMap<number>(LIVE_META)
    const before = Y.encodeStateVector(this.doc)
    meta.set(LIVE_BASE_KEY, this.version)
    const u = Y.encodeStateAsUpdate(this.doc, before)
    for (const v of this.views) v.onUpdate?.('f', u)
  }
}

interface Mounted {
  view: EditorView
  state: () => ReturnType<typeof useHangulLive>
  reloads: Uint8Array[]
}

const roots: Root[] = []
afterEach(() => {
  for (const r of roots.splice(0)) act(() => r.unmount())
})

async function mount(api: Partial<LiveApi>, b: Uint8Array): Promise<Mounted> {
  const s = new Session(HwpCoreDocument.open(b), 'hwpx')
  const el = document.createElement('div')
  document.body.append(el)
  const view = new EditorView(el, s, new CommandBus(s), { painter: () => {} })
  let last: ReturnType<typeof useHangulLive> | null = null
  const reloads: Uint8Array[] = []
  function Probe() {
    last = useHangulLive({ api, path: '/docs/공유.hwpx', view, reload: (x) => reloads.push(x), onChange: () => {} })
    return null
  }
  const host = document.createElement('div')
  const root = createRoot(host)
  roots.push(root)
  await act(async () => root.render(createElement(Probe)))
  await act(async () => new Promise((r) => setTimeout(r, 10)))
  return { view, state: () => last!, reloads }
}

const text = (v: EditorView) => v.session.doc.text(0, 0)
const type = async (v: EditorView, at: Pos, t: string) => {
  v.session.select({ anchor: at, head: at })
  await act(async () => void v.run('edit:insert-text', { text: t }))
}

describe('live Hangul room', () => {
  it('two people type into the same file and see each other, with faces', async () => {
    const base = bytes('제1조 목적')
    const room = new Room(base)
    const a = await mount(room.api('갑'), base)
    const b = await mount(room.api('을'), base)
    expect(a.state().state.kind).toBe('live')
    expect(room.doc.getMap(LIVE_META).get(LIVE_BASE_KEY)).toBe(1)
    await type(a.view, P(0, 3), ' (개정)')
    expect(text(b.view)).toBe('제1조 (개정) 목적')
    await type(b.view, P(0, 0), '【')
    expect(text(a.view)).toBe('【제1조 (개정) 목적')
    expect(b.view.session.dirty).toBe(true)
    await act(async () => new Promise((r) => setTimeout(r, 450)))
    expect(a.state().faces.map((f) => f.name)).toEqual(['을'])
  })

  it('a view role cannot change the text but sees others typing', async () => {
    const base = bytes('본문')
    const room = new Room(base)
    const a = await mount(room.api('갑'), base)
    const v = await mount(room.api('병', 'view'), base)
    expect(v.view.readOnly).toBe(true)
    await type(a.view, P(0, 2), '입니다')
    expect(text(v.view)).toBe('본문입니다')
    await type(v.view, P(0, 0), 'X')
    expect(text(a.view)).toBe('본문입니다')
  })

  it('a view behind the room’s base reloads the shared bytes before binding', async () => {
    const base = bytes('옛 본문')
    const room = new Room(base)
    await mount(room.api('갑'), base)
    room.version = 2
    room.latest = bytes('새 본문')
    room.doc.getMap<number>(LIVE_META).set(LIVE_BASE_KEY, 2)
    const late = await mount(room.api('을', 'edit', 1), base)
    expect(late.reloads).toHaveLength(1)
    expect(late.state().state.kind).not.toBe('live')
  })

  it('when someone saves, a clean view reloads the new version; a dirty one keeps its work', async () => {
    const base = bytes('본문')
    const room = new Room(base)
    const a = await mount(room.api('갑'), base)
    const b = await mount(room.api('을'), base)
    await type(a.view, P(0, 2), '!')
    await act(async () => room.saved(bytes('본문!')))
    await act(async () => new Promise((r) => setTimeout(r, 10)))
    expect(b.reloads).toHaveLength(1)
    expect(a.reloads).toHaveLength(0)
  })
})
