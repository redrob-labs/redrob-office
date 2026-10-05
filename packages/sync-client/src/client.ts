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
}
