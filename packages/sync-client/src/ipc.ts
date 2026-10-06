import type { Role } from './client'

/** Share over IPC: the shell talks to the sync service; editors and Home ask it. */
export const SHARE_CHANNELS = {
  status: 'share:status',
  invite: 'share:invite',
  remove: 'share:remove',
  stop: 'share:stop',
  sharedWithMe: 'share:shared-with-me',
  sharedByMe: 'share:shared-by-me',
  open: 'share:open',
} as const

export type ShareStatus =
  | { available: false; reason: 'no-service' | 'signed-out' | 'unreachable' }
  | { available: true; shared: false }
  | { available: true; shared: true; role: Role; members: Array<{ sub: string; name: string; role: Role }> }

export type ShareResult = { ok: true; status: ShareStatus } | { ok: false; error: string }

export interface SharedWithMe {
  id: string
  name: string
  role: Role
  /** already on this computer */
  localPath: string | null
}

/** A file this person shares, and how many others have it. */
export interface SharedByMe {
  id: string
  name: string
  /** where it lives on this computer, when it does */
  localPath: string | null
  /** people other than the owner */
  people: number
}

type Failure = { ok: false; error: string }

export interface ShareApi {
  shareStatus(path: string): Promise<ShareStatus>
  /** shares the file if it is not yet, then gives `account` the role */
  shareInvite(path: string, account: string, role: Exclude<Role, 'owner'>): Promise<ShareResult>
  shareRemove(path: string, account: string): Promise<ShareResult>
  /** the owner stops sharing: everyone loses access, every local copy stays */
  shareStop(path: string): Promise<ShareResult>
  sharedWithMe(): Promise<SharedWithMe[] | { error: string }>
  sharedByMe(): Promise<SharedByMe[] | { error: string }>
  openShared(fileId: string): Promise<{ ok: true; path: string } | Failure>
}

export interface ShareIpcLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

const NOT_HERE = 'Sharing is not available here.'

/** The Share bridge for an editor or Home preload. */
export function shareBridge(ipc: ShareIpcLike): ShareApi {
  const failed = () => ({ ok: false as const, error: NOT_HERE })
  return {
    shareStatus: (path) =>
      ipc.invoke(SHARE_CHANNELS.status, path).then(
        (r) => (r as ShareStatus) ?? { available: false, reason: 'no-service' },
        () => ({ available: false as const, reason: 'no-service' as const }),
      ),
    shareInvite: (path, account, role) => ipc.invoke(SHARE_CHANNELS.invite, path, account, role).then((r) => r as ShareResult, failed),
    shareRemove: (path, account) => ipc.invoke(SHARE_CHANNELS.remove, path, account).then((r) => r as ShareResult, failed),
    shareStop: (path) => ipc.invoke(SHARE_CHANNELS.stop, path).then((r) => r as ShareResult, failed),
    sharedWithMe: () =>
      ipc.invoke(SHARE_CHANNELS.sharedWithMe).then(
        (r) => r as SharedWithMe[] | { error: string },
        () => ({ error: NOT_HERE }),
      ),
    sharedByMe: () =>
      ipc.invoke(SHARE_CHANNELS.sharedByMe).then(
        (r) => r as SharedByMe[] | { error: string },
        () => ({ error: NOT_HERE }),
      ),
    openShared: (fileId) =>
      ipc.invoke(SHARE_CHANNELS.open, fileId).then((r) => r as { ok: true; path: string } | Failure, failed),
  }
}
