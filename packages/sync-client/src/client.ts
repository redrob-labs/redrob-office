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

  /** Who the service says the token belongs to. */
  async me(): Promise<{ sub: string; name: string }> {
    const b = (await (await this.call('/me')).json()) as { sub?: unknown; name?: unknown }
    if (typeof b.sub !== 'string') throw new SyncError(502, 'The sync service did not say who you are.')
    return { sub: b.sub, name: typeof b.name === 'string' ? b.name : b.sub }
  }
}
