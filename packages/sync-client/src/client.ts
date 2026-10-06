/**
 * The HTTP client for services/sync. Every call carries the signed-in
 * person's token; a missing token fails before any request is made.
 */

export type Role = 'owner' | 'edit' | 'comment' | 'view'
export const ROLES: readonly Role[] = ['view', 'comment', 'edit', 'owner']
export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v)

export interface RemoteFile {
  id: string
  name: string
  ownerSub: string
  createdAt: string
  role: Role
  /** everyone with access, the owner included (the file list sends it) */
  memberCount?: number
}

export interface RemoteMember {
  sub: string
  name: string
  role: Role
}

export interface RemoteVersion {
  version: number
  sha256: string
  size: number
  createdBy: string
  createdAt: string
}

/** A new thread carries its anchor (relative positions, as a live cursor does); a reply names its thread. */
export type CommentInput = { text: string; anchor: { anchor: unknown; head: unknown } } | { text: string; parentId: string }
export type CommentPatch = { done: boolean } | { text: string }

export interface RemoteComment {
  id: string
  author: string
  authorSub?: string
  text: string
  date: string
  parentId?: string
  done?: boolean
}

export interface RemoteInvite {
  email: string
  role: Role
  invitedBy: string
  createdAt: string
}

/** An address as invites are kept (trimmed, lower case), or null when it is not one. */
export function inviteEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const e = v.trim().toLowerCase()
  return e.length <= 254 && /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/.test(e) ? e : null
}

export type ActivityKind =
  | 'version'
  | 'shared'
  | 'role'
  | 'removed'
  | 'left'
  | 'joined'
  | 'renamed'
  | 'transferred'
  | 'comment'
  | 'unshared'

export const ACTIVITY_KINDS: readonly ActivityKind[] = ['version', 'shared', 'role', 'removed', 'left', 'joined', 'renamed', 'transferred', 'comment', 'unshared']

/** Something someone else did to a file this person had at the time. */
export interface RemoteEvent {
  id: number
  fileId: string
  fileName: string
  actorSub: string
  actorName: string
  kind: ActivityKind
  detail: Record<string, unknown>
  createdAt: string
  /** the event is about this person (shared with them, removed, made owner) */
  you: boolean
}

/** An invite link as the owner sees it; the token itself is shown only when it is made. */
export interface RemoteLink {
  id: string
  role: Role
  createdAt: string
  expiresAt: string
  uses: number
}

/** What a link would do, before it is used. */
export interface LinkPreview {
  fileName: string
  ownerName: string
  role: Role
  expiresAt: string
  /** this person's role already, when they have the file */
  alreadyHave: Role | null
}

/** The scheme the desktop app registers for invite links. */
export const INVITE_LINK_SCHEME = 'redrob-office'
const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/

/** The link to hand someone: `redrob-office://join/<token>`. */
export function inviteLinkUrl(token: string): string {
  return `${INVITE_LINK_SCHEME}://join/${token}`
}

/**
 * The token in an invite link as it was pasted or clicked, or null. Accepts
 * `redrob-office://join/<token>` (with or without a trailing slash) or the
 * bare token; anything else, including another scheme or path, is refused.
 */
export function parseInviteLink(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const s = text.trim()
  if (LINK_TOKEN.test(s)) return s
  const m = /^redrob-office:\/\/join\/([A-Za-z0-9_-]{43})\/?$/i.exec(s)
  return m ? m[1]! : null
}

export interface RemoteFileDetail extends RemoteFile {
  latest: RemoteVersion | null
}

export class SyncError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export interface SyncClientOptions {
  baseUrl: string
  token: () => Promise<string | null>
  fetch: Fetch
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class SyncClient {
  private readonly base: string
  constructor(private readonly opts: SyncClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '')
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.opts.token()
    if (!token) throw new SyncError(401, 'Sign in to Redrob first.')
    let r: Response
    try {
      r = await this.opts.fetch(`${this.base}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` },
      })
    } catch {
      throw new SyncError(0, 'The sync service could not be reached.')
    }
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as { error?: unknown }
      throw new SyncError(r.status, typeof body.error === 'string' ? body.error : `HTTP ${r.status}`)
    }
    return r
  }

  private id(fileId: string) {
    if (!UUID.test(fileId)) throw new SyncError(404, 'No such file.')
    return encodeURIComponent(fileId)
  }

  async listFiles(): Promise<RemoteFile[]> {
    const b = (await (await this.call('/files')).json()) as { files?: unknown }
    return Array.isArray(b.files) ? (b.files as RemoteFile[]).filter((f) => UUID.test(f.id) && isRole(f.role)) : []
  }

  async createFile(name: string): Promise<RemoteFile> {
    const r = await this.call('/files', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return { ...((await r.json()) as Omit<RemoteFile, 'role'>), role: 'owner' }
  }

  async upload(fileId: string, bytes: Uint8Array): Promise<RemoteVersion> {
    const r = await this.call(`/files/${this.id(fileId)}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes as unknown as BodyInit,
    })
    return (await r.json()) as RemoteVersion
  }

  async download(fileId: string): Promise<{ bytes: Uint8Array; version: number }> {
    const r = await this.call(`/files/${this.id(fileId)}/content`)
    return { bytes: new Uint8Array(await r.arrayBuffer()), version: Number(r.headers.get('x-file-version') ?? 0) }
  }

  async members(fileId: string): Promise<RemoteMember[]> {
    const b = (await (await this.call(`/files/${this.id(fileId)}/members`)).json()) as { members?: unknown }
    return Array.isArray(b.members) ? (b.members as RemoteMember[]) : []
  }

  async setMember(fileId: string, sub: string, role: Role, name: string): Promise<RemoteMember[]> {
    const r = await this.call(`/files/${this.id(fileId)}/members/${encodeURIComponent(sub)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role, name }),
    })
    return ((await r.json()) as { members: RemoteMember[] }).members
  }

  async removeMember(fileId: string, sub: string): Promise<void> {
    await this.call(`/files/${this.id(fileId)}/members/${encodeURIComponent(sub)}`, { method: 'DELETE' })
  }

  /** A comment written into the live document by the service (for someone whose live session is read-only). */
  async addComment(fileId: string, input: CommentInput): Promise<RemoteComment> {
    const r = await this.call(`/files/${this.id(fileId)}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return ((await r.json()) as { comment: RemoteComment }).comment
  }

  /** Resolve or reopen a thread, or change the words of one's own comment. */
  async updateComment(fileId: string, commentId: string, patch: CommentPatch): Promise<RemoteComment> {
    if (!/^\d{1,12}$/.test(commentId)) throw new SyncError(404, 'That comment is no longer here.')
    const r = await this.call(`/files/${this.id(fileId)}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    return ((await r.json()) as { comment: RemoteComment }).comment
  }

  /** Pending invites by e-mail (owner only). */
  async invites(fileId: string): Promise<RemoteInvite[]> {
    const b = (await (await this.call(`/files/${this.id(fileId)}/invites`)).json()) as { invites?: unknown }
    return Array.isArray(b.invites) ? (b.invites as RemoteInvite[]).filter((i) => typeof i.email === 'string' && isRole(i.role)) : []
  }

  /** Invites an address that may not have a Redrob account yet; it joins when that verified address signs in. */
  async invite(fileId: string, email: string, role: Exclude<Role, 'owner'>): Promise<RemoteInvite[]> {
    const r = await this.call(`/files/${this.id(fileId)}/invites/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    return ((await r.json()) as { invites: RemoteInvite[] }).invites
  }

  async cancelInvite(fileId: string, email: string): Promise<void> {
    await this.call(`/files/${this.id(fileId)}/invites/${encodeURIComponent(email)}`, { method: 'DELETE' })
  }

  /** The file, this person's current role on it, and its latest version. */
  async getFile(fileId: string): Promise<RemoteFileDetail> {
    const b = (await (await this.call(`/files/${this.id(fileId)}`)).json()) as RemoteFileDetail
    if (!isRole(b.role)) throw new SyncError(502, 'The sync service sent an unknown role.')
    return { id: b.id, name: b.name, ownerSub: b.ownerSub, createdAt: b.createdAt, role: b.role, latest: b.latest ?? null }
  }

  /** Stop sharing: the owner deletes the shared file for everyone. */
  async deleteFile(fileId: string): Promise<void> {
    await this.call(`/files/${this.id(fileId)}`, { method: 'DELETE' })
  }

  /** Every version, newest first. */
  async versions(fileId: string): Promise<RemoteVersion[]> {
    const b = (await (await this.call(`/files/${this.id(fileId)}/versions`)).json()) as { versions?: unknown }
    return Array.isArray(b.versions) ? (b.versions as RemoteVersion[]) : []
  }

  /** One earlier version's bytes. */
  async downloadVersion(fileId: string, version: number): Promise<{ bytes: Uint8Array; version: number }> {
    if (!Number.isInteger(version) || version < 1) throw new SyncError(404, 'That version is not here.')
    const r = await this.call(`/files/${this.id(fileId)}/versions/${version}/content`)
    return { bytes: new Uint8Array(await r.arrayBuffer()), version: Number(r.headers.get('x-file-version') ?? version) }
  }

  /** The name everyone with access sees (anyone who may edit). */
  async renameFile(fileId: string, name: string): Promise<void> {
    await this.call(`/files/${this.id(fileId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }

  /** The owner hands the file to an editor and becomes an editor. */
  async transferOwnership(fileId: string, sub: string): Promise<RemoteMember[]> {
    const r = await this.call(`/files/${this.id(fileId)}/transfer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sub }),
    })
    return ((await r.json()) as { members: RemoteMember[] }).members
  }

  /** Someone who is not the owner takes themself off the file. */
  async leave(fileId: string): Promise<void> {
    await this.call(`/files/${this.id(fileId)}/members/me`, { method: 'DELETE' })
  }

  /** What others did to files this person had then, newest first. Unknown kinds are dropped. */
  async activity(q: { after?: number; before?: number; limit?: number } = {}): Promise<{ events: RemoteEvent[]; more: boolean }> {
    const p = new URLSearchParams()
    for (const k of ['after', 'before', 'limit'] as const) {
      const v = q[k]
      if (v !== undefined && Number.isInteger(v) && v >= 0) p.set(k, String(v))
    }
    const qs = p.toString()
    const b = (await (await this.call(`/activity${qs ? `?${qs}` : ''}`)).json()) as { events?: unknown; more?: unknown }
    const events = Array.isArray(b.events)
      ? (b.events as RemoteEvent[]).filter(
          (e) => e && typeof e.id === 'number' && typeof e.fileId === 'string' && typeof e.fileName === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(e.kind),
        )
      : []
    return {
      events: events.map((e) => ({ ...e, detail: e.detail && typeof e.detail === 'object' ? e.detail : {}, you: e.you === true })),
      more: b.more === true,
    }
  }

  /** The owner makes an invite link; the token comes back this once. */
  async createLink(fileId: string, role: Exclude<Role, 'owner'>, days: number): Promise<{ link: RemoteLink; token: string }> {
    const r = await this.call(`/files/${this.id(fileId)}/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role, days }),
    })
    const b = (await r.json()) as { link: RemoteLink; token: string }
    if (!LINK_TOKEN.test(b.token)) throw new SyncError(502, 'The sync service sent a link that does not work.')
    return b
  }

  /** The file's links that still work or have expired; revoked ones are gone. */
  async links(fileId: string): Promise<RemoteLink[]> {
    const b = (await (await this.call(`/files/${this.id(fileId)}/links`)).json()) as { links?: unknown }
    return Array.isArray(b.links) ? (b.links as RemoteLink[]).filter((l) => UUID.test(l.id) && isRole(l.role)) : []
  }

  async revokeLink(fileId: string, linkId: string): Promise<void> {
    if (!UUID.test(linkId)) throw new SyncError(404, 'No such link.')
    await this.call(`/files/${this.id(fileId)}/links/${linkId}`, { method: 'DELETE' })
  }

  async peekLink(token: string): Promise<LinkPreview> {
    if (!LINK_TOKEN.test(token)) throw new SyncError(404, 'This link does not work any more. Ask the owner for a new one.')
    const b = (await (await this.call(`/links/${token}`)).json()) as LinkPreview
    if (!isRole(b.role)) throw new SyncError(502, 'The sync service sent an unknown role.')
    return { fileName: String(b.fileName), ownerName: String(b.ownerName ?? ''), role: b.role, expiresAt: String(b.expiresAt), alreadyHave: isRole(b.alreadyHave) ? b.alreadyHave : null }
  }

  /** Uses a link: this person joins the file (an existing role is never changed). */
  async redeemLink(token: string): Promise<{ file: { id: string; name: string }; role: Role; joined: boolean }> {
    if (!LINK_TOKEN.test(token)) throw new SyncError(404, 'This link does not work any more. Ask the owner for a new one.')
    const b = (await (await this.call(`/links/${token}/redeem`, { method: 'POST' })).json()) as {
      file: { id: string; name: string }
      role: Role
      joined: boolean
    }
    if (!UUID.test(b.file?.id ?? '') || !isRole(b.role)) throw new SyncError(502, 'The sync service sent an unexpected answer.')
    return b
  }

  /** Who the service says the token belongs to. */
  async me(): Promise<{ sub: string; name: string }> {
    const b = (await (await this.call('/me')).json()) as { sub?: unknown; name?: unknown }
    if (typeof b.sub !== 'string') throw new SyncError(502, 'The sync service did not say who you are.')
    return { sub: b.sub, name: typeof b.name === 'string' ? b.name : b.sub }
  }
}
