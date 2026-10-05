/**
 * Live documents over IPC. The shell holds the connection to the sync
 * service (and so the token); an editor keeps its own Y.Doc in step by
 * sending and receiving Yjs updates, and sees who else is in the file.
 */

/** where a person is: the top-level block their selection is in, and its opening words */
export interface LiveAt {
  block: number
  text: string
}

/** a y-prosemirror cursor: relative positions as JSON */
export interface LiveCursor {
  anchor: unknown
  head: unknown
}

export interface LivePeer {
  clientId: number
  /** the account, as the service verified it */
  id: string
  name: string
  at: LiveAt | null
  cursor: LiveCursor | null
}

export type LiveJoin =
  | {
      ok: true
      fileId: string
      role: 'owner' | 'edit' | 'comment' | 'view'
      readOnly: boolean
      /** the shared version this computer's copy of the file is at */
      version: number
      state: Uint8Array
      peers: LivePeer[]
    }
  | { ok: false; reason: 'not-shared' | 'no-service' | 'signed-out' | 'unreachable' }

export interface LivePresence {
  at?: LiveAt | null
  cursor?: LiveCursor | null
}

export const LIVE_CHANNELS = {
  join: 'live:join',
  update: 'live:update',
  presence: 'live:presence',
  leave: 'live:leave',
  pull: 'live:pull',
  remote: 'live:remote',
  peers: 'live:peers',
} as const

/** the latest shared bytes of a file, for rebasing a live view; the file on disk is not touched */
export type LivePull = { ok: true; bytes: Uint8Array; version: number } | { ok: false }

/** the shared Y.Doc's map that carries the version the shared text is based on */
export const LIVE_META = 'meta'
export const LIVE_BASE_KEY = 'base'

export interface LiveApi {
  liveJoin(path: string): Promise<LiveJoin>
  livePull(path: string): Promise<LivePull>
  liveUpdate(fileId: string, update: Uint8Array): void
  livePresence(fileId: string, presence: LivePresence): void
  liveLeave(fileId: string): void
  onLiveUpdate(handler: (fileId: string, update: Uint8Array) => void): () => void
  onLivePeers(handler: (fileId: string, peers: LivePeer[]) => void): () => void
}

export interface LiveIpcLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
}

const MAX_TEXT = 80

/** Keeps only the fields a peer may carry, with bounded sizes. */
export function cleanPresence(raw: unknown): LivePresence {
  const out: LivePresence = {}
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  if (r.at === null) out.at = null
  else if (r.at && typeof r.at === 'object') {
    const a = r.at as Record<string, unknown>
    if (Number.isInteger(a.block) && (a.block as number) >= 0 && typeof a.text === 'string') {
      out.at = { block: a.block as number, text: a.text.slice(0, MAX_TEXT) }
    }
  }
  if (r.cursor === null) out.cursor = null
  else if (r.cursor && typeof r.cursor === 'object') {
    const c = r.cursor as Record<string, unknown>
    try {
      if (c.anchor !== undefined && c.head !== undefined && JSON.stringify(c).length <= 2048) {
        out.cursor = { anchor: c.anchor, head: c.head }
      }
    } catch {
      // not JSON: dropped
    }
  }
  return out
}

/** The live bridge for an editor preload. */
export function liveBridge(ipc: LiveIpcLike): LiveApi {
  return {
    liveJoin: (path) =>
      ipc.invoke(LIVE_CHANNELS.join, path).then(
        (r) => (r as LiveJoin) ?? { ok: false, reason: 'no-service' },
        () => ({ ok: false as const, reason: 'no-service' as const }),
      ),
    livePull: (path) =>
      ipc.invoke(LIVE_CHANNELS.pull, path).then(
        (r) => {
          const x = r as LivePull | null
          return x && x.ok && x.bytes instanceof Uint8Array && Number.isInteger(x.version) ? x : { ok: false as const }
        },
        () => ({ ok: false as const }),
      ),
    liveUpdate: (fileId, update) => ipc.send(LIVE_CHANNELS.update, fileId, update),
    livePresence: (fileId, presence) => ipc.send(LIVE_CHANNELS.presence, fileId, presence),
    liveLeave: (fileId) => ipc.send(LIVE_CHANNELS.leave, fileId),
    onLiveUpdate: (handler) => {
      const listener = (_e: unknown, fileId: unknown, update: unknown) => {
        if (typeof fileId === 'string' && update instanceof Uint8Array) handler(fileId, update)
      }
      ipc.on(LIVE_CHANNELS.remote, listener)
      return () => void ipc.removeListener(LIVE_CHANNELS.remote, listener)
    },
    onLivePeers: (handler) => {
      const listener = (_e: unknown, fileId: unknown, peers: unknown) => {
        if (typeof fileId === 'string' && Array.isArray(peers)) handler(fileId, peers as LivePeer[])
      }
      ipc.on(LIVE_CHANNELS.peers, listener)
      return () => void ipc.removeListener(LIVE_CHANNELS.peers, listener)
    },
  }
}
