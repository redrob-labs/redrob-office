/**
 * The shell's side of live documents. One room per shared file holds the
 * Y.Doc and presence in step with the sync service; each editor view that
 * has the file open mirrors the Y.Doc over IPC. An update from one view goes
 * to the service and to every other view, never back to its sender.
 */
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { LIVE_BASE_KEY, LIVE_META, cleanPresence, type LivePeer, type LivePresence } from './live-ipc'

export interface LiveRoom {
  doc: Y.Doc
  awareness: Awareness
  /** settles once the first sync with the service finished, or rejects when it could not connect or was refused */
  ready: Promise<{ readOnly: boolean }>
  destroy(): void
}

export type RoomFactory = (fileId: string) => LiveRoom

export interface LiveSink {
  update(fileId: string, update: Uint8Array): void
  peers(fileId: string, peers: LivePeer[]): void
}

interface ViewOrigin {
  view: number
}

interface Entry {
  room: LiveRoom
  views: Map<number, LiveSink>
  /** the origin object per view, so an update is not echoed back to its sender */
  origins: Map<number, ViewOrigin>
  off: () => void
}

/** Remote people in a room, as the service stamped them; this computer's own presence is left out. */
export function peersOf(awareness: Awareness): LivePeer[] {
  const out: LivePeer[] = []
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue
    const user = (state as Record<string, unknown>).user as { id?: unknown; name?: unknown } | null | undefined
    if (!user || typeof user.id !== 'string') continue
    const p = cleanPresence(state)
    out.push({
      clientId,
      id: user.id,
      name: typeof user.name === 'string' && user.name ? user.name : user.id,
      at: p.at ?? null,
      cursor: p.cursor ?? null,
    })
  }
  return out
}

export class LiveHub {
  private readonly rooms = new Map<string, Entry>()

  constructor(private readonly factory: RoomFactory) {}

  private open(fileId: string): Entry {
    const found = this.rooms.get(fileId)
    if (found) return found
    const room = this.factory(fileId)
    const entry: Entry = { room, views: new Map(), origins: new Map(), off: () => undefined }
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      for (const [view, sink] of entry.views) {
        if (origin === entry.origins.get(view)) continue
        sink.update(fileId, update)
      }
    }
    const onChange = () => {
      const peers = peersOf(room.awareness)
      for (const sink of entry.views.values()) sink.peers(fileId, peers)
    }
    room.doc.on('update', onUpdate)
    room.awareness.on('change', onChange)
    entry.off = () => {
      room.doc.off('update', onUpdate)
      room.awareness.off('change', onChange)
    }
    this.rooms.set(fileId, entry)
    return entry
  }

  private close(fileId: string) {
    const entry = this.rooms.get(fileId)
    if (!entry || entry.views.size > 0) return
    this.rooms.delete(fileId)
    entry.off()
    entry.room.destroy()
  }

  /** Joins a view to the file's room; resolves with the full state once the room is in step with the service. */
  async join(view: number, fileId: string, sink: LiveSink): Promise<{ state: Uint8Array; peers: LivePeer[]; readOnly: boolean }> {
    const entry = this.open(fileId)
    let readOnly: boolean
    try {
      ;({ readOnly } = await entry.room.ready)
    } catch (e) {
      this.close(fileId)
      throw e
    }
    // a room closed while this join waited is gone; open it again
    if (this.rooms.get(fileId) !== entry) return this.join(view, fileId, sink)
    entry.views.set(view, sink)
    entry.origins.set(view, { view })
    return { state: Y.encodeStateAsUpdate(entry.room.doc), peers: peersOf(entry.room.awareness), readOnly }
  }

  has(view: number, fileId: string): boolean {
    return this.rooms.get(fileId)?.views.has(view) ?? false
  }

  /** An update typed in a view; ignored unless that view joined the room. */
  update(view: number, fileId: string, update: Uint8Array): void {
    const entry = this.rooms.get(fileId)
    const origin = entry?.origins.get(view)
    if (!entry || !origin) return
    Y.applyUpdate(entry.room.doc, update, origin)
  }

  /** Where this computer's person is. The service replaces any claimed identity with the verified one. */
  presence(view: number, fileId: string, raw: LivePresence | unknown): void {
    const entry = this.rooms.get(fileId)
    if (!entry?.views.has(view)) return
    const p = cleanPresence(raw)
    if ('at' in p) entry.room.awareness.setLocalStateField('at', p.at)
    if ('cursor' in p) entry.room.awareness.setLocalStateField('cursor', p.cursor)
  }

  /**
   * A new version of the file was uploaded: record it as the base the shared
   * text now matches, so every view rebases onto those bytes. Only moves forward.
   */
  setBase(fileId: string, version: number): void {
    const entry = this.rooms.get(fileId)
    if (!entry || !Number.isInteger(version)) return
    const meta = entry.room.doc.getMap<number>(LIVE_META)
    const was = meta.get(LIVE_BASE_KEY)
    if (typeof was === 'number' && was >= version) return
    meta.set(LIVE_BASE_KEY, version)
  }

  /** Leaves one room, or every room when no file is named (the view closed). */
  leave(view: number, fileId?: string): void {
    const ids = fileId ? [fileId] : [...this.rooms.keys()]
    for (const id of ids) {
      const entry = this.rooms.get(id)
      if (!entry?.views.delete(view)) continue
      entry.origins.delete(view)
      this.close(id)
    }
  }

  /** Closes every room (sign-out, quit). */
  closeAll(): void {
    for (const [id, entry] of this.rooms) {
      entry.views.clear()
      entry.origins.clear()
      this.close(id)
    }
  }
}
