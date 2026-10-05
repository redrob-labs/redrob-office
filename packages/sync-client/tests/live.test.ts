import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { LiveHub, peersOf, type LiveRoom, type LiveSink } from '../src/live'
import { cleanPresence, liveBridge, LIVE_CHANNELS } from '../src/live-ipc'
import { liveUrlFor } from '../src/live-provider'

const FILE = '11111111-2222-4333-8444-555555555555'

function fakeRooms(opts: { fail?: boolean; readOnly?: boolean } = {}) {
  const made: Array<LiveRoom & { destroyed: boolean }> = []
  const factory = () => {
    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    const room = {
      doc,
      awareness,
      ready: opts.fail ? Promise.reject(new Error('refused')) : Promise.resolve({ readOnly: opts.readOnly ?? false }),
      destroyed: false,
      destroy() {
        room.destroyed = true
      },
    }
    room.ready.catch(() => undefined)
    made.push(room)
    return room
  }
  return { factory, made }
}

function sink(): LiveSink & { updates: Uint8Array[]; peerLists: unknown[] } {
  const s = {
    updates: [] as Uint8Array[],
    peerLists: [] as unknown[],
    update: (_f: string, u: Uint8Array) => void s.updates.push(u),
    peers: (_f: string, p: unknown) => void s.peerLists.push(p),
  }
  return s
}

/** a renderer-side mirror: its own Y.Doc fed from the join state */
function mirror(state: Uint8Array) {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  return doc
}

describe('LiveHub', () => {
  it('a join returns the room state, and an update from one view reaches the others but not itself', async () => {
    const { factory, made } = fakeRooms()
    const hub = new LiveHub(factory)
    const a = sink()
    const b = sink()
    const ja = await hub.join(1, FILE, a)
    const jb = await hub.join(2, FILE, b)
    expect(made).toHaveLength(1)
    expect(ja.readOnly).toBe(false)

    const docA = mirror(ja.state)
    const docB = mirror(jb.state)
    let sent: Uint8Array | null = null
    docA.on('update', (u: Uint8Array) => (sent = u))
    docA.getText('t').insert(0, 'Payment terms')
    hub.update(1, FILE, sent!)

    expect(a.updates).toHaveLength(0)
    expect(b.updates).toHaveLength(1)
    Y.applyUpdate(docB, b.updates[0]!)
    expect(docB.getText('t').toString()).toBe('Payment terms')
    expect(made[0]!.doc.getText('t').toString()).toBe('Payment terms')
  })

  it('a change in the room from the service reaches every view', async () => {
    const { factory, made } = fakeRooms()
    const hub = new LiveHub(factory)
    const a = sink()
    await hub.join(1, FILE, a)
    made[0]!.doc.getText('t').insert(0, 'x')
    expect(a.updates).toHaveLength(1)
  })

  it('ignores updates and presence from a view that never joined', async () => {
    const { factory, made } = fakeRooms()
    const hub = new LiveHub(factory)
    await hub.join(1, FILE, sink())
    const other = new Y.Doc()
    other.getText('t').insert(0, 'sneaky')
    hub.update(9, FILE, Y.encodeStateAsUpdate(other))
    hub.presence(9, FILE, { at: { block: 1, text: 'x' } })
    expect(made[0]!.doc.getText('t').toString()).toBe('')
    expect(made[0]!.awareness.getLocalState()?.at).toBeUndefined()
  })

  it('a failed first sync rejects the join and closes the room', async () => {
    const { factory, made } = fakeRooms({ fail: true })
    const hub = new LiveHub(factory)
    await expect(hub.join(1, FILE, sink())).rejects.toThrow('refused')
    expect(made[0]!.destroyed).toBe(true)
  })

  it('the room closes when the last view leaves, and a view closing leaves every room', async () => {
    const { factory, made } = fakeRooms()
    const hub = new LiveHub(factory)
    await hub.join(1, FILE, sink())
    await hub.join(2, FILE, sink())
    hub.leave(1, FILE)
    expect(made[0]!.destroyed).toBe(false)
    hub.leave(2)
    expect(made[0]!.destroyed).toBe(true)
    expect(hub.has(2, FILE)).toBe(false)
  })

  it('presence is cleaned and set on this computer, and peers carry the verified person only', async () => {
    const { factory, made } = fakeRooms()
    const hub = new LiveHub(factory)
    const a = sink()
    await hub.join(1, FILE, a)
    hub.presence(1, FILE, { at: { block: 3, text: 'x'.repeat(200) }, user: { id: 'forged' } })
    const local = made[0]!.awareness.getLocalState()!
    expect(local.at).toEqual({ block: 3, text: 'x'.repeat(80) })
    expect(local.user).toBeUndefined()

    // a remote person as the service stamps them
    const remote = new Awareness(new Y.Doc())
    remote.setLocalState({ user: { id: 'kim', name: 'Kim' }, at: { block: 1, text: 'Payment terms' } })
    const { encodeAwarenessUpdate, applyAwarenessUpdate } = await import('y-protocols/awareness')
    applyAwarenessUpdate(made[0]!.awareness, encodeAwarenessUpdate(remote, [remote.clientID]), 'remote')
    expect(peersOf(made[0]!.awareness)).toEqual([
      { clientId: remote.clientID, id: 'kim', name: 'Kim', at: { block: 1, text: 'Payment terms' }, cursor: null },
    ])
    expect(a.peerLists.at(-1)).toEqual(peersOf(made[0]!.awareness))
  })
})

describe('live helpers', () => {
  it('derives the live address next to the HTTP service', () => {
    expect(liveUrlFor('http://127.0.0.1:8787')).toBe('ws://127.0.0.1:8788')
    expect(liveUrlFor('https://sync.redrob.ai')).toBe('wss://sync.redrob.ai:8788')
    expect(liveUrlFor('http://x', 'wss://live.example')).toBe('wss://live.example')
    expect(liveUrlFor('http://x', 'http://not-ws')).toBeNull()
    expect(liveUrlFor('file:///etc')).toBeNull()
  })

  it('cleanPresence drops what a peer may not carry', () => {
    expect(cleanPresence({ at: { block: -1, text: 'x' } })).toEqual({})
    expect(cleanPresence({ at: null, cursor: null })).toEqual({ at: null, cursor: null })
    expect(cleanPresence({ cursor: { anchor: { a: 1 }, head: { a: 2 } } })).toEqual({ cursor: { anchor: { a: 1 }, head: { a: 2 } } })
    expect(cleanPresence({ cursor: { anchor: 'x'.repeat(3000), head: 1 } })).toEqual({})
    expect(cleanPresence('nope')).toEqual({})
  })

  it('the bridge maps channels and fails closed', async () => {
    const sent: unknown[][] = []
    const listeners = new Map<string, (e: unknown, ...a: unknown[]) => void>()
    const ipc = {
      invoke: vi.fn(async () => {
        throw new Error('no handler')
      }),
      send: (...a: unknown[]) => void sent.push(a),
      on: (c: string, l: (e: unknown, ...a: unknown[]) => void) => void listeners.set(c, l),
      removeListener: (c: string) => void listeners.delete(c),
    }
    const api = liveBridge(ipc)
    expect(await api.liveJoin('C:\\x.docx')).toEqual({ ok: false, reason: 'no-service' })
    api.liveUpdate(FILE, new Uint8Array([1]))
    expect(sent[0]).toEqual([LIVE_CHANNELS.update, FILE, new Uint8Array([1])])
    const got: unknown[] = []
    const off = api.onLiveUpdate((f, u) => got.push([f, u]))
    listeners.get(LIVE_CHANNELS.remote)!({}, FILE, new Uint8Array([2]))
    listeners.get(LIVE_CHANNELS.remote)!({}, FILE, 'not bytes')
    expect(got).toEqual([[FILE, new Uint8Array([2])]])
    off()
    expect(listeners.has(LIVE_CHANNELS.remote)).toBe(false)
  })
})
