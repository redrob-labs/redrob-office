/// Sharing a local file through the sync service. The shell owns the client
/// (and so the token); editors and Home only ask over IPC. Kept apart from
/// index.ts so the rules are testable without Electron.
import { basename, extname, isAbsolute } from 'node:path'
import {
  SHARE_CHANNELS,
  SyncError,
  inviteEmail,
  isRole,
  type CommentInput,
  type CommentPatch,
  type RemoteComment,
  type RemoteEvent,
  type SharedActivity,
  type RemoteFile,
  type RemoteFileDetail,
  type RemoteInvite,
  type RemoteMember,
  type RemoteVersion,
  type Role,
  type ShareResult,
  type ShareStatus,
  type SharedByMe,
  type SharedVersion,
  type SharedWithMe,
} from '@genoffice/sync-client'
import type { SharedLink } from '@genoffice/sync-client/node'
import { restoredCopyName } from '@genoffice/versions'

/** the parts of SyncClient this service uses */
export interface ShareClient {
  listFiles(): Promise<RemoteFile[]>
  createFile(name: string): Promise<RemoteFile>
  upload(fileId: string, bytes: Uint8Array): Promise<RemoteVersion>
  download(fileId: string): Promise<{ bytes: Uint8Array; version: number }>
  members(fileId: string): Promise<RemoteMember[]>
  setMember(fileId: string, sub: string, role: Role, name: string): Promise<RemoteMember[]>
  removeMember(fileId: string, sub: string): Promise<void>
  getFile(fileId: string): Promise<RemoteFileDetail>
  deleteFile(fileId: string): Promise<void>
  addComment(fileId: string, input: CommentInput): Promise<RemoteComment>
  updateComment(fileId: string, commentId: string, patch: CommentPatch): Promise<RemoteComment>
  invites(fileId: string): Promise<RemoteInvite[]>
  invite(fileId: string, email: string, role: Exclude<Role, 'owner'>): Promise<RemoteInvite[]>
  cancelInvite(fileId: string, email: string): Promise<void>
  versions(fileId: string): Promise<RemoteVersion[]>
  downloadVersion(fileId: string, version: number): Promise<{ bytes: Uint8Array; version: number }>
  renameFile(fileId: string, name: string): Promise<void>
  transferOwnership(fileId: string, sub: string): Promise<RemoteMember[]>
  leave(fileId: string): Promise<void>
  activity(q?: { after?: number; before?: number; limit?: number }): Promise<{ events: RemoteEvent[]; more: boolean }>
}

/** the parts of SharedIndex this service uses */
export interface ShareIndex {
  get(path: string): Promise<SharedLink | null>
  pathOf(fileId: string): Promise<string | null>
  set(path: string, link: SharedLink): Promise<void>
  remove(path: string): Promise<void>
}

export interface ShareServiceDeps {
  /** null when this build has no sync service */
  client: ShareClient | null
  index: ShareIndex
  signedIn: () => Promise<boolean>
  readFile: (path: string) => Promise<Uint8Array>
  /** writes a downloaded shared file somewhere new and returns its path */
  saveDownload: (name: string, bytes: Uint8Array) => Promise<string>
  /**
   * writes bytes as a new file named `name` in the folder of `beside` (never
   * over an existing file) and returns its path
   */
  saveCopyBeside: (beside: string, name: string, bytes: Uint8Array) => Promise<string>
  openPath: (path: string) => void | Promise<void>
  /** a new version of a shared file reached the service (live rooms rebase on it) */
  uploaded?: (fileId: string, version: number) => void
  log?: (message: string) => void
}

export interface IpcLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
}

const SHAREABLE = new Set(['.docx', '.xlsx', '.pptx', '.pdf', '.md', '.hwp', '.hwpx'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const SHARE_MESSAGES = {
  noService: 'Sharing is not available in this build yet. Files stay on this computer.',
  signedOut: 'Sign in to Redrob in Settings, Sharing, to share files.',
  unreachable: 'The sync service could not be reached. Nothing changed.',
  notShareable: 'This file cannot be shared.',
  badAccount: 'Enter the Redrob account to share with.',
  badRole: 'Choose edit, comment or view.',
  notOwner: 'Only the owner can change who has this file.',
  gone: 'That file is no longer shared with you.',
  badComment: 'That comment could not be sent.',
  noVersion: 'That version is no longer on the service.',
  ownerStays: 'The owner cannot leave. Make someone else the owner first, or stop sharing.',
  notEditor: 'Only someone who can already edit the file can become its owner.',
} as const

/** An absolute path to a saved document of a kind the suite edits. */
export function isShareablePath(path: unknown): path is string {
  return typeof path === 'string' && path.length < 4096 && isAbsolute(path) && SHAREABLE.has(extname(path).toLowerCase())
}

/** The account as typed, trimmed; null when it is empty, too long, or holds spaces or control characters. */
export function cleanAccount(account: unknown): string | null {
  if (typeof account !== 'string') return null
  const a = account.trim()
  if (!a || a.length > 200 || /[\s\u0000-\u001f\u007f]/.test(a)) return null
  return a
}

const fail = (error: string): ShareResult => ({ ok: false, error })

function messageOf(e: unknown): string {
  if (e instanceof SyncError) return e.status === 0 ? SHARE_MESSAGES.unreachable : e.message
  return e instanceof Error ? e.message : String(e)
}

export class ShareService {
  constructor(private readonly deps: ShareServiceDeps) {}

  /** why sharing cannot happen right now, or null when it can */
  private async unavailable(): Promise<'no-service' | 'signed-out' | null> {
    if (!this.deps.client) return 'no-service'
    if (!(await this.deps.signedIn())) return 'signed-out'
    return null
  }

  private reasonMessage(r: 'no-service' | 'signed-out') {
    return r === 'no-service' ? SHARE_MESSAGES.noService : SHARE_MESSAGES.signedOut
  }

  async status(path: unknown): Promise<ShareStatus> {
    const why = await this.unavailable()
    if (why) return { available: false, reason: why }
    if (!isShareablePath(path)) return { available: true, shared: false }
    const link = await this.deps.index.get(path)
    if (!link) return { available: true, shared: false }
    try {
      // the owner may have changed this person's role since the index was written
      const role = await this.refreshRole(path, link)
      return await this.sharedStatus(link.fileId, role)
    } catch (e) {
      if (e instanceof SyncError && e.status === 404) {
        // the shared file is gone or this person was removed; the local copy stays
        await this.deps.index.remove(path)
        return { available: true, shared: false }
      }
      if (e instanceof SyncError && e.status === 401) return { available: false, reason: 'signed-out' }
      return { available: false, reason: 'unreachable' }
    }
  }

  /** People with access and, for the owner, invites nobody has taken up yet. */
  private async sharedStatus(fileId: string, role: Role): Promise<ShareStatus> {
    const client = this.deps.client!
    const members = await client.members(fileId)
    if (role !== 'owner') return { available: true, shared: true, role, members }
    const pending = (await client.invites(fileId)).map((i) => ({ email: i.email, role: i.role }))
    return { available: true, shared: true, role, members, pending }
  }

  /** The role the service holds now, written back to the index when it moved. */
  private async refreshRole(path: string, link: SharedLink): Promise<Role> {
    const f = await this.deps.client!.getFile(link.fileId)
    if (f.role !== link.role) await this.deps.index.set(path, { ...link, role: f.role })
    return f.role
  }

  /** Stop sharing: only the owner may; everyone loses access and every local copy stays. */
  async stop(path: unknown): Promise<ShareResult> {
    const why = await this.unavailable()
    if (why) return fail(this.reasonMessage(why))
    if (!isShareablePath(path)) return fail(SHARE_MESSAGES.notShareable)
    const link = await this.deps.index.get(path)
    if (!link) return { ok: true, status: { available: true, shared: false } }
    try {
      if ((await this.refreshRole(path, link)) !== 'owner') return fail(SHARE_MESSAGES.notOwner)
      await this.deps.client!.deleteFile(link.fileId)
    } catch (e) {
      // already gone on the service: the outcome the owner asked for
      if (!(e instanceof SyncError && e.status === 404)) return fail(messageOf(e))
    }
    // the service closes the file's live connections itself
    await this.deps.index.remove(path)
    return { ok: true, status: { available: true, shared: false } }
  }

  /** The shared file behind a path, for a comment call; the role is checked by the service. */
  private async commentTarget(path: unknown): Promise<{ fileId: string } | { error: string }> {
    const why = await this.unavailable()
    if (why) return { error: this.reasonMessage(why) }
    if (!isShareablePath(path)) return { error: SHARE_MESSAGES.notShareable }
    const link = await this.deps.index.get(path)
    return link ? { fileId: link.fileId } : { error: SHARE_MESSAGES.gone }
  }

  async commentAdd(path: unknown, input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const target = await this.commentTarget(path)
    if ('error' in target) return { ok: false, error: target.error }
    const i = (input ?? {}) as Record<string, unknown>
    const text = typeof i.text === 'string' ? i.text : ''
    const body: CommentInput | null =
      typeof i.parentId === 'string'
        ? { text, parentId: i.parentId }
        : i.anchor && typeof i.anchor === 'object'
          ? { text, anchor: i.anchor as { anchor: unknown; head: unknown } }
          : null
    if (!body || !text.trim()) return { ok: false, error: SHARE_MESSAGES.badComment }
    try {
      return { ok: true, id: (await this.deps.client!.addComment(target.fileId, body)).id }
    } catch (e) {
      return { ok: false, error: messageOf(e) }
    }
  }

  async commentUpdate(path: unknown, commentId: unknown, patch: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
    const target = await this.commentTarget(path)
    if ('error' in target) return { ok: false, error: target.error }
    const p = (patch ?? {}) as Record<string, unknown>
    const body: CommentPatch | null = typeof p.done === 'boolean' ? { done: p.done } : typeof p.text === 'string' ? { text: p.text } : null
    if (typeof commentId !== 'string' || !body) return { ok: false, error: SHARE_MESSAGES.badComment }
    try {
      await this.deps.client!.updateComment(target.fileId, commentId, body)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: messageOf(e) }
    }
  }

  /**
   * What other people did lately to files shared with this person, newest
   * first, each with its copy on this computer when there is one. Only the
   * facts each kind needs are passed on, typed.
   */
  async activity(): Promise<SharedActivity[] | { error: string }> {
    const why = await this.unavailable()
    if (why) return { error: this.reasonMessage(why) }
    try {
      const { events } = await this.deps.client!.activity({ limit: 50 })
      const out: SharedActivity[] = []
      for (const e of events) {
        const d = e.detail
        const detail: SharedActivity['detail'] = {}
        if (typeof d.version === 'number') detail.version = d.version
        if (isRole(d.role)) detail.role = d.role
        if (typeof d.name === 'string') detail.name = d.name
        if (typeof d.from === 'string') detail.from = d.from
        if (typeof d.reply === 'boolean') detail.reply = d.reply
        out.push({
          id: e.id,
          fileId: e.fileId,
          fileName: e.fileName,
          by: e.actorName,
          kind: e.kind,
          detail,
          you: e.you,
          at: e.createdAt,
          localPath: await this.deps.index.pathOf(e.fileId),
        })
      }
      return out
    } catch (e) {
      return { error: messageOf(e) }
    }
  }

  /** Files this person shares with others. */
  async sharedByMe(): Promise<SharedByMe[] | { error: string }> {
    const why = await this.unavailable()
    if (why) return { error: this.reasonMessage(why) }
    try {
      const files = await this.deps.client!.listFiles()
      const out: SharedByMe[] = []
      for (const f of files) {
        if (f.role !== 'owner') continue
        out.push({ id: f.id, name: f.name, localPath: await this.deps.index.pathOf(f.id), people: Math.max(0, (f.memberCount ?? 1) - 1) })
      }
      return out
    } catch (e) {
      return { error: messageOf(e) }
    }
  }

  /** Shares the file if it is not yet (creating and uploading it), then gives `account` the role. */
  async invite(path: unknown, account: unknown, role: unknown): Promise<ShareResult> {
    const why = await this.unavailable()
    if (why) return fail(this.reasonMessage(why))
    if (!isShareablePath(path)) return fail(SHARE_MESSAGES.notShareable)
    const who = cleanAccount(account)
    if (!who) return fail(SHARE_MESSAGES.badAccount)
    if (!isRole(role) || role === 'owner') return fail(SHARE_MESSAGES.badRole)
    const client = this.deps.client!
    try {
      let link = await this.deps.index.get(path)
      if (!link) {
        const bytes = await this.deps.readFile(path)
        const file = await client.createFile(basename(path))
        const v = await client.upload(file.id, bytes)
        link = { fileId: file.id, role: 'owner', version: v.version }
        await this.deps.index.set(path, link)
      }
      if (link.role !== 'owner') return fail(SHARE_MESSAGES.notOwner)
      // an e-mail address waits as an invite until someone signs in with it
      // verified; anything else is a Redrob account id and joins at once
      const email = inviteEmail(who)
      if (email) await client.invite(link.fileId, email, role)
      else await client.setMember(link.fileId, who, role, who)
      return { ok: true, status: await this.sharedStatus(link.fileId, link.role) }
    } catch (e) {
      return fail(messageOf(e))
    }
  }

  async remove(path: unknown, account: unknown): Promise<ShareResult> {
    const why = await this.unavailable()
    if (why) return fail(this.reasonMessage(why))
    if (!isShareablePath(path)) return fail(SHARE_MESSAGES.notShareable)
    const who = cleanAccount(account)
    if (!who) return fail(SHARE_MESSAGES.badAccount)
    const link = await this.deps.index.get(path)
    if (!link) return { ok: true, status: { available: true, shared: false } }
    if (link.role !== 'owner') return fail(SHARE_MESSAGES.notOwner)
    try {
      const client = this.deps.client!
      const email = inviteEmail(who)
      const pending = email ? (await client.invites(link.fileId)).some((i) => i.email === email) : false
      if (pending) await client.cancelInvite(link.fileId, email!)
      else await client.removeMember(link.fileId, who)
      return { ok: true, status: await this.sharedStatus(link.fileId, link.role) }
    } catch (e) {
      return fail(messageOf(e))
    }
  }

  /** Files other people shared with this person, and whether each is already here. */
  async sharedWithMe(): Promise<SharedWithMe[] | { error: string }> {
    const why = await this.unavailable()
    if (why) return { error: this.reasonMessage(why) }
    try {
      const files = await this.deps.client!.listFiles()
      const out: SharedWithMe[] = []
      for (const f of files) {
        if (f.role === 'owner') continue
        out.push({ id: f.id, name: f.name, role: f.role, localPath: await this.deps.index.pathOf(f.id) })
      }
      return out
    } catch (e) {
      return { error: messageOf(e) }
    }
  }

  /** Opens a shared file, downloading it into the Shared folder the first time. */
  async open(fileId: unknown): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    const why = await this.unavailable()
    if (why) return { ok: false, error: this.reasonMessage(why) }
    if (typeof fileId !== 'string' || !UUID.test(fileId)) return { ok: false, error: SHARE_MESSAGES.gone }
    const client = this.deps.client!
    try {
      const here = await this.deps.index.pathOf(fileId)
      if (here) {
        await this.deps.openPath(here)
        return { ok: true, path: here }
      }
      const f = (await client.listFiles()).find((x) => x.id === fileId)
      if (!f) return { ok: false, error: SHARE_MESSAGES.gone }
      const { bytes, version } = await client.download(fileId)
      const path = await this.deps.saveDownload(basename(f.name), bytes)
      await this.deps.index.set(path, { fileId, role: f.role, version })
      await this.deps.openPath(path)
      return { ok: true, path }
    } catch (e) {
      return { ok: false, error: messageOf(e) }
    }
  }

  /**
   * After a local save: a shared file this person may edit is uploaded as a
   * new version. Never throws; a failed upload is logged and retried on the
   * next save.
   */
  async saved(path: string, bytes: Uint8Array): Promise<void> {
    const client = this.deps.client
    if (!client || !isShareablePath(path)) return
    try {
      const link = await this.deps.index.get(path)
      if (!link || (link.role !== 'owner' && link.role !== 'edit')) return
      if (!(await this.deps.signedIn())) return
      try {
        const v = await client.upload(link.fileId, bytes)
        await this.deps.index.set(path, { ...link, version: v.version })
        this.deps.uploaded?.(link.fileId, v.version)
      } catch (e) {
        // a role taken away, or the file no longer shared: bring the index up to date
        if (e instanceof SyncError && e.status === 403) await this.refreshRole(path, link).catch(() => undefined)
        else if (e instanceof SyncError && e.status === 404) await this.deps.index.remove(path)
        throw e
      }
    } catch (e) {
      this.deps.log?.(`[share] upload after save failed: ${messageOf(e)}`)
    }
  }

  /**
   * The latest shared bytes of a file this computer has, for a live view to
   * rebase on. The file on disk is left alone: the view saves it as usual.
   */
  async pull(path: unknown): Promise<{ bytes: Uint8Array; version: number } | null> {
    const client = this.deps.client
    if (!client || !isShareablePath(path)) return null
    try {
      if (!(await this.deps.signedIn())) return null
      const link = await this.deps.index.get(path)
      if (!link) return null
      // the index keeps the version on disk; the view tracks the one it rebased on
      return await client.download(link.fileId)
    } catch (e) {
      this.deps.log?.(`[share] pull failed: ${messageOf(e)}`)
      return null
    }
  }

  /** The link behind a shared path, or why there is none (null: the file is simply not shared). */
  private async linkFor(path: unknown): Promise<SharedLink | null | { error: string }> {
    const why = await this.unavailable()
    if (why) return { error: this.reasonMessage(why) }
    if (!isShareablePath(path)) return null
    return this.deps.index.get(path)
  }

  /** Every version on the service, newest first, named by who saved it. */
  async versions(path: unknown): Promise<SharedVersion[] | null | { error: string }> {
    const link = await this.linkFor(path)
    if (!link || 'error' in link) return link
    const client = this.deps.client!
    try {
      const [versions, members] = await Promise.all([client.versions(link.fileId), client.members(link.fileId)])
      const names = new Map(members.map((m) => [m.sub, m.name]))
      return versions.map((v) => ({ version: v.version, at: v.createdAt, by: names.get(v.createdBy) ?? v.createdBy, size: v.size }))
    } catch (e) {
      if (e instanceof SyncError && e.status === 404) {
        await this.deps.index.remove(path as string)
        return null
      }
      return { error: messageOf(e) }
    }
  }

  /**
   * Opens an earlier shared version as a copy beside the local file, named as a
   * restored local version is. The file itself, and every live view of it, is
   * left alone; the copy is not shared.
   */
  async restoreVersion(path: unknown, version: unknown): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    const link = await this.linkFor(path)
    if (!link) return { ok: false, error: SHARE_MESSAGES.gone }
    if ('error' in link) return { ok: false, error: link.error }
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: SHARE_MESSAGES.noVersion }
    const client = this.deps.client!
    try {
      const v = (await client.versions(link.fileId)).find((x) => x.version === version)
      if (!v) return { ok: false, error: SHARE_MESSAGES.noVersion }
      const { bytes } = await client.downloadVersion(link.fileId, version)
      const copy = await this.deps.saveCopyBeside(path as string, restoredCopyName(basename(path as string), v.createdAt), bytes)
      await this.deps.openPath(copy)
      return { ok: true, path: copy }
    } catch (e) {
      if (e instanceof SyncError && e.status === 404) return { ok: false, error: SHARE_MESSAGES.noVersion }
      return { ok: false, error: messageOf(e) }
    }
  }

  /** The owner makes an editor the owner and becomes an editor. */
  async transfer(path: unknown, account: unknown): Promise<ShareResult> {
    const link = await this.linkFor(path)
    if (!link) return fail(SHARE_MESSAGES.gone)
    if ('error' in link) return fail(link.error)
    const who = cleanAccount(account)
    if (!who) return fail(SHARE_MESSAGES.badAccount)
    try {
      if ((await this.refreshRole(path as string, link)) !== 'owner') return fail(SHARE_MESSAGES.notOwner)
      await this.deps.client!.transferOwnership(link.fileId, who)
      await this.deps.index.set(path as string, { ...link, role: 'edit' })
      return { ok: true, status: await this.sharedStatus(link.fileId, 'edit') }
    } catch (e) {
      if (e instanceof SyncError && e.status === 409) return fail(SHARE_MESSAGES.notEditor)
      return fail(messageOf(e))
    }
  }

  /** Someone who is not the owner leaves the file; the copy on this computer stays. */
  async leave(path: unknown): Promise<ShareResult> {
    const link = await this.linkFor(path)
    if (!link) return { ok: true, status: { available: true, shared: false } }
    if ('error' in link) return fail(link.error)
    try {
      if ((await this.refreshRole(path as string, link)) === 'owner') return fail(SHARE_MESSAGES.ownerStays)
      await this.deps.client!.leave(link.fileId)
    } catch (e) {
      // already off the file: the outcome they asked for
      if (!(e instanceof SyncError && e.status === 404)) return fail(messageOf(e))
    }
    await this.deps.index.remove(path as string)
    return { ok: true, status: { available: true, shared: false } }
  }

  /**
   * A shared file was renamed on this computer: the index follows it, and when
   * this person may edit, the shared name follows too. Never throws.
   */
  async renamed(from: string, to: string): Promise<void> {
    try {
      const link = await this.deps.index.get(from)
      if (!link) return
      await this.deps.index.set(to, link)
      // the index is keyed case-insensitively: a rename that only changes case is the same entry
      if (from.toLowerCase() !== to.toLowerCase()) await this.deps.index.remove(from)
      const client = this.deps.client
      if (!client || (link.role !== 'owner' && link.role !== 'edit') || !(await this.deps.signedIn())) return
      await client.renameFile(link.fileId, basename(to))
    } catch (e) {
      this.deps.log?.(`[share] rename did not reach the service: ${messageOf(e)}`)
    }
  }

  register(ipc: IpcLike): void {
    ipc.handle(SHARE_CHANNELS.versions, (_e, path) => this.versions(path))
    ipc.handle(SHARE_CHANNELS.restoreVersion, (_e, path, version) => this.restoreVersion(path, version))
    ipc.handle(SHARE_CHANNELS.transfer, (_e, path, account) => this.transfer(path, account))
    ipc.handle(SHARE_CHANNELS.leave, (_e, path) => this.leave(path))
    ipc.handle(SHARE_CHANNELS.activity, () => this.activity())
    ipc.handle(SHARE_CHANNELS.status, (_e, path) => this.status(path))
    ipc.handle(SHARE_CHANNELS.invite, (_e, path, account, role) => this.invite(path, account, role))
    ipc.handle(SHARE_CHANNELS.remove, (_e, path, account) => this.remove(path, account))
    ipc.handle(SHARE_CHANNELS.stop, (_e, path) => this.stop(path))
    ipc.handle(SHARE_CHANNELS.sharedWithMe, () => this.sharedWithMe())
    ipc.handle(SHARE_CHANNELS.sharedByMe, () => this.sharedByMe())
    ipc.handle(SHARE_CHANNELS.open, (_e, fileId) => this.open(fileId))
    ipc.handle(SHARE_CHANNELS.commentAdd, (_e, path, input) => this.commentAdd(path, input))
    ipc.handle(SHARE_CHANNELS.commentUpdate, (_e, path, id, patch) => this.commentUpdate(path, id, patch))
  }
}
