import type { Role } from './client'

/** Share over IPC: the shell talks to the sync service; editors and Home ask it. */
export const SHARE_CHANNELS = {
  status: 'share:status',
  invite: 'share:invite',
  remove: 'share:remove',
  sharedWithMe: 'share:shared-with-me',
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

export interface ShareApi {
  shareStatus(path: string): Promise<ShareStatus>
  /** shares the file if it is not yet, then gives `account` the role */
  shareInvite(path: string, account: string, role: Exclude<Role, 'owner'>): Promise<ShareResult>
  shareRemove(path: string, account: string): Promise<ShareResult>
  sharedWithMe(): Promise<SharedWithMe[] | { error: string }>
  openShared(fileId: string): Promise<{ ok: true; path: string } | { ok: false; error: string }>
}

export interface ShareIpcLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

/** The Share bridge for an editor or Home preload. */
export function shareBridge(ipc: ShareIpcLike): ShareApi {
  return {
    shareStatus: (path) =>
      ipc.invoke(SHARE_CHANNELS.status, path).then(
        (r) => (r as ShareStatus) ?? { available: false, reason: 'no-service' },
        () => ({ available: false as const, reason: 'no-service' as const }),
      ),
    shareInvite: (path, account, role) =>
      ipc.invoke(SHARE_CHANNELS.invite, path, account, role).then(
        (r) => r as ShareResult,
        () => ({ ok: false as const, error: 'Sharing is not available here.' }),
      ),
    shareRemove: (path, account) =>
      ipc.invoke(SHARE_CHANNELS.remove, path, account).then(
        (r) => r as ShareResult,
        () => ({ ok: false as const, error: 'Sharing is not available here.' }),
      ),
    sharedWithMe: () =>
      ipc.invoke(SHARE_CHANNELS.sharedWithMe).then(
        (r) => r as SharedWithMe[] | { error: string },
        () => ({ error: 'Sharing is not available here.' }),
      ),
    openShared: (fileId) =>
      ipc.invoke(SHARE_CHANNELS.open, fileId).then(
        (r) => r as { ok: true; path: string } | { ok: false; error: string },
        () => ({ ok: false as const, error: 'Sharing is not available here.' }),
      ),
  }
}
