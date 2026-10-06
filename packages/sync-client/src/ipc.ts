import type { ActivityKind, CommentInput, CommentPatch, LinkPreview, RemoteLink, Role } from './client'

/** Share over IPC: the shell talks to the sync service; editors and Home ask it. */
export const SHARE_CHANNELS = {
  status: 'share:status',
  invite: 'share:invite',
  remove: 'share:remove',
  stop: 'share:stop',
  sharedWithMe: 'share:shared-with-me',
  sharedByMe: 'share:shared-by-me',
  open: 'share:open',
  commentAdd: 'share:comment-add',
  commentUpdate: 'share:comment-update',
  versions: 'share:versions',
  restoreVersion: 'share:restore-version',
  transfer: 'share:transfer',
  leave: 'share:leave',
  activity: 'share:activity',
  linkCreate: 'share:link-create',
  links: 'share:links',
  linkRevoke: 'share:link-revoke',
  linkPeek: 'share:link-peek',
  linkJoin: 'share:link-join',
  takeJoinRequest: 'share:take-join-request',
} as const

/** Pushed from the shell to Home (not handled with invoke). */
export const SHARE_EVENTS = {
  /** an invite link was opened (clicked, or passed on the command line); Home asks before joining */
  joinRequest: 'share:join-request',
} as const

/** One thing someone else did to a shared file, for Home's Updates. */
export interface SharedActivity {
  id: number
  fileId: string
  fileName: string
  /** who did it */
  by: string
  kind: ActivityKind
  /** what kind-specific facts the service sent: version, role, the other person's name, the old name */
  detail: { version?: number; role?: Role; name?: string; from?: string; reply?: boolean }
  /** the event is about this person: shared with them, their role changed, removed, made owner */
  you: boolean
  at: string
  /** the copy on this computer, when there is one */
  localPath: string | null
}

/** One version of a shared file, as the version history shows it. */
export interface SharedVersion {
  version: number
  /** when it reached the service */
  at: string
  /** who saved it, by name when they still have access */
  by: string
  size: number
}

export type ShareStatus =
  | { available: false; reason: 'no-service' | 'signed-out' | 'unreachable' }
  | { available: true; shared: false }
  | {
      available: true
      shared: true
      role: Role
      members: Array<{ sub: string; name: string; role: Role }>
      /** invites by e-mail nobody has taken up yet; the owner sees them */
      pending?: Array<{ email: string; role: Role }>
    }

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
  /** a comment written by the service, for someone who may comment but not edit the live file */
  shareCommentAdd(path: string, input: CommentInput): Promise<{ ok: true; id: string } | Failure>
  shareCommentUpdate(path: string, commentId: string, patch: CommentPatch): Promise<{ ok: true } | Failure>
  /** every version on the service, newest first; null when the file is not shared */
  shareVersions(path: string): Promise<SharedVersion[] | null | { error: string }>
  /** opens an earlier shared version as a copy beside the file; nothing open is overwritten */
  shareRestoreVersion(path: string, version: number): Promise<{ ok: true; path: string } | Failure>
  /** the owner makes an editor the owner, and becomes an editor */
  shareTransfer(path: string, account: string): Promise<ShareResult>
  /** someone who is not the owner leaves the file; their copy stays */
  shareLeave(path: string): Promise<ShareResult>
  /** what other people did lately to files shared with this person, newest first */
  shareActivity(): Promise<SharedActivity[] | { error: string }>
  /** the owner makes an invite link for the file (shares it first if needed) */
  shareLinkCreate(path: string, role: Exclude<Role, 'owner'>, days: number): Promise<{ ok: true; url: string; link: RemoteLink } | Failure>
  /** the owner's working and expired links; null when the file is not shared */
  shareLinks(path: string): Promise<RemoteLink[] | null | { error: string }>
  shareLinkRevoke(path: string, linkId: string): Promise<{ ok: true } | Failure>
  /** what a pasted or clicked link would do, without using it */
  shareLinkPeek(link: string): Promise<{ ok: true; preview: LinkPreview } | Failure>
  /** uses the link and opens the file (downloaded into the Shared folder) */
  shareLinkJoin(link: string): Promise<{ ok: true; path: string } | Failure>
  /** Home: an invite link was opened from outside the app; returns an unsubscribe */
  onShareJoinRequest(handler: (link: string) => void): () => void
  /** Home, on load: a link opened before Home was there, once */
  shareTakeJoinRequest(): Promise<string | null>
}

export interface ShareIpcLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  /** present in a real preload; without it onShareJoinRequest never fires */
  on?(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
  removeListener?(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
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
    shareCommentAdd: (path, input) =>
      ipc.invoke(SHARE_CHANNELS.commentAdd, path, input).then((r) => r as { ok: true; id: string } | Failure, failed),
    shareCommentUpdate: (path, commentId, patch) =>
      ipc.invoke(SHARE_CHANNELS.commentUpdate, path, commentId, patch).then((r) => r as { ok: true } | Failure, failed),
    shareVersions: (path) =>
      ipc.invoke(SHARE_CHANNELS.versions, path).then(
        (r) => (r === null || Array.isArray(r) ? (r as SharedVersion[] | null) : (r as { error: string })),
        () => ({ error: NOT_HERE }),
      ),
    shareRestoreVersion: (path, version) =>
      ipc.invoke(SHARE_CHANNELS.restoreVersion, path, version).then((r) => r as { ok: true; path: string } | Failure, failed),
    shareTransfer: (path, account) => ipc.invoke(SHARE_CHANNELS.transfer, path, account).then((r) => r as ShareResult, failed),
    shareLeave: (path) => ipc.invoke(SHARE_CHANNELS.leave, path).then((r) => r as ShareResult, failed),
    shareActivity: () =>
      ipc.invoke(SHARE_CHANNELS.activity).then(
        (r) => r as SharedActivity[] | { error: string },
        () => ({ error: NOT_HERE }),
      ),
    shareLinkCreate: (path, role, days) =>
      ipc.invoke(SHARE_CHANNELS.linkCreate, path, role, days).then((r) => r as { ok: true; url: string; link: RemoteLink } | Failure, failed),
    shareLinks: (path) =>
      ipc.invoke(SHARE_CHANNELS.links, path).then(
        (r) => (r === null || Array.isArray(r) ? (r as RemoteLink[] | null) : (r as { error: string })),
        () => ({ error: NOT_HERE }),
      ),
    shareLinkRevoke: (path, linkId) => ipc.invoke(SHARE_CHANNELS.linkRevoke, path, linkId).then((r) => r as { ok: true } | Failure, failed),
    shareLinkPeek: (link) => ipc.invoke(SHARE_CHANNELS.linkPeek, link).then((r) => r as { ok: true; preview: LinkPreview } | Failure, failed),
    shareLinkJoin: (link) => ipc.invoke(SHARE_CHANNELS.linkJoin, link).then((r) => r as { ok: true; path: string } | Failure, failed),
    shareTakeJoinRequest: () =>
      ipc.invoke(SHARE_CHANNELS.takeJoinRequest).then(
        (r) => (typeof r === 'string' ? r : null),
        () => null,
      ),
    onShareJoinRequest: (handler) => {
      if (!ipc.on || !ipc.removeListener) return () => undefined
      const listener = (_e: unknown, link: unknown) => {
        if (typeof link === 'string') handler(link)
      }
      ipc.on(SHARE_EVENTS.joinRequest, listener)
      return () => void ipc.removeListener!(SHARE_EVENTS.joinRequest, listener)
    },
    openShared: (fileId) =>
      ipc.invoke(SHARE_CHANNELS.open, fileId).then((r) => r as { ok: true; path: string } | Failure, failed),
  }
}
