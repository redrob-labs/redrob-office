/// Live documents for editor views. The shell owns the rooms (and the
/// token); a view joins a shared file it has open, mirrors the Y.Doc over
/// IPC, and hears who else is in it. Kept apart from index.ts so the rules
/// are testable without Electron.
import { LIVE_CHANNELS, type LiveJoin, type LivePeer, type LivePull, type Role } from '@genoffice/sync-client'
import type { LiveHub } from '@genoffice/sync-client/live'
import type { SharedLink } from '@genoffice/sync-client/node'
import { isShareablePath } from './share-service'

export interface LiveServiceDeps {
  /** null when this build has no sync service */
  hub: Pick<LiveHub, 'join' | 'update' | 'presence' | 'leave' | 'has'> | null
  index: { get(path: string): Promise<SharedLink | null> }
  signedIn: () => Promise<boolean>
  /** the latest shared bytes of a file (ShareService.pull) */
  pull?: (path: string) => Promise<{ bytes: Uint8Array; version: number } | null>
  log?: (message: string) => void
}

/** the sending view: its id, a way to reach it, and a hook for when it goes away */
export interface LiveSender {
  id: number
  send(channel: string, ...args: unknown[]): void
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): void
}

export interface LiveIpcLike {
  handle(channel: string, listener: (event: { sender: LiveSender }, ...args: unknown[]) => unknown): void
  on(channel: string, listener: (event: { sender: LiveSender }, ...args: unknown[]) => void): void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** one Yjs update over IPC; larger than any keystroke batch, smaller than a pasted book */
const MAX_UPDATE = 8 * 1024 * 1024

export class LiveService {
  private readonly watched = new Set<number>()

  constructor(private readonly deps: LiveServiceDeps) {}

  async join(sender: LiveSender, path: unknown): Promise<LiveJoin> {
    const hub = this.deps.hub
    if (!hub) return { ok: false, reason: 'no-service' }
    if (!isShareablePath(path)) return { ok: false, reason: 'not-shared' }
    if (!(await this.deps.signedIn())) return { ok: false, reason: 'signed-out' }
    const link = await this.deps.index.get(path)
    if (!link) return { ok: false, reason: 'not-shared' }
    this.watch(sender)
    try {
      const sink = {
        update: (fileId: string, update: Uint8Array) => {
          if (!sender.isDestroyed()) sender.send(LIVE_CHANNELS.remote, fileId, update)
        },
        peers: (fileId: string, peers: LivePeer[]) => {
          if (!sender.isDestroyed()) sender.send(LIVE_CHANNELS.peers, fileId, peers)
        },
      }
      const r = await hub.join(sender.id, link.fileId, sink)
      const role: Role = link.role
      // the service decides read-only; a view or comment role never types into the shared text
      const readOnly = r.readOnly || role === 'view' || role === 'comment'
      return { ok: true, fileId: link.fileId, role, readOnly, version: link.version, state: r.state, peers: r.peers }
    } catch (e) {
      this.deps.log?.(`[live] join failed: ${e instanceof Error ? e.message : String(e)}`)
      return { ok: false, reason: 'unreachable' }
    }
  }

  private watch(sender: LiveSender) {
    if (this.watched.has(sender.id)) return
    this.watched.add(sender.id)
    const id = sender.id
    sender.once('destroyed', () => {
      this.watched.delete(id)
      this.deps.hub?.leave(id)
    })
  }

  /** The latest shared bytes, only for a file this view has joined live. */
  async pull(sender: LiveSender, path: unknown): Promise<LivePull> {
    if (!this.deps.hub || !this.deps.pull || !isShareablePath(path)) return { ok: false }
    const link = await this.deps.index.get(path)
    if (!link || !this.deps.hub.has(sender.id, link.fileId)) return { ok: false }
    const got = await this.deps.pull(path)
    return got ? { ok: true, bytes: got.bytes, version: got.version } : { ok: false }
  }

  update(sender: LiveSender, fileId: unknown, update: unknown): void {
    if (typeof fileId !== 'string' || !UUID.test(fileId)) return
    if (!(update instanceof Uint8Array) || update.byteLength === 0 || update.byteLength > MAX_UPDATE) return
    try {
      this.deps.hub?.update(sender.id, fileId, update)
    } catch (e) {
      // a malformed update is dropped; the room stays as it was
      this.deps.log?.(`[live] update dropped: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  presence(sender: LiveSender, fileId: unknown, presence: unknown): void {
    if (typeof fileId !== 'string' || !UUID.test(fileId)) return
    this.deps.hub?.presence(sender.id, fileId, presence)
  }

  leave(sender: LiveSender, fileId: unknown): void {
    if (typeof fileId !== 'string' || !UUID.test(fileId)) return
    this.deps.hub?.leave(sender.id, fileId)
  }

  register(ipc: LiveIpcLike): void {
    ipc.handle(LIVE_CHANNELS.join, (e, path) => this.join(e.sender, path))
    ipc.handle(LIVE_CHANNELS.pull, (e, path) => this.pull(e.sender, path))
    ipc.on(LIVE_CHANNELS.update, (e, fileId, update) => this.update(e.sender, fileId, update))
    ipc.on(LIVE_CHANNELS.presence, (e, fileId, presence) => this.presence(e.sender, fileId, presence))
    ipc.on(LIVE_CHANNELS.leave, (e, fileId) => this.leave(e.sender, fileId))
  }
}
