/**
 * What the service stores: files, who may use them, their versions (bytes in
 * the blob store), and each file's live document state (a Yjs update).
 * One interface, two implementations: Postgres for real, memory for tests.
 */
import { randomUUID } from 'node:crypto'
import type { Role } from './access.ts'

export interface FileRecord {
  id: string
  name: string
  ownerSub: string
  createdAt: string
}

export interface Member {
  fileId: string
  sub: string
  name: string
  role: Role
}

export interface FileVersion {
  fileId: string
  version: number
  sha256: string
  size: number
  blobKey: string
  createdBy: string
  createdAt: string
}

/** Access waiting for whoever signs in with this verified address. */
export interface Invite {
  fileId: string
  email: string
  role: Role
  invitedBy: string
  createdAt: string
}

export interface Repo {
  /** keeps or replaces the pending invite for this address */
  setInvite(i: Omit<Invite, 'createdAt'>): Promise<void>
  invites(fileId: string): Promise<Invite[]>
  removeInvite(fileId: string, email: string): Promise<void>
  /**
   * Turns every invite to this address into membership for this account and
   * removes them. An existing membership is never lowered or changed.
   * Returns the file ids the account joined.
   */
  claimInvites(email: string, who: { sub: string; name: string }): Promise<string[]>
  createFile(name: string, owner: { sub: string; name: string }): Promise<FileRecord>
  getFile(id: string): Promise<FileRecord | null>
  /** files this account is a member of, newest first */
  listFiles(sub: string): Promise<Array<FileRecord & { role: Role; memberCount: number }>>
  deleteFile(id: string): Promise<void>
  /** the name everyone with access sees */
  renameFile(id: string, name: string): Promise<void>
  /**
   * Makes `toSub`, who must already be an editor, the owner; the old owner
   * becomes an editor. One step: there is always exactly one owner. Returns
   * false (and changes nothing) when `toSub` is not an editor of the file.
   */
  transferOwnership(fileId: string, fromSub: string, toSub: string): Promise<boolean>
  roleOf(fileId: string, sub: string): Promise<Role | null>
  members(fileId: string): Promise<Member[]>
  setMember(m: Member): Promise<void>
  removeMember(fileId: string, sub: string): Promise<void>
  addVersion(v: Omit<FileVersion, 'version' | 'createdAt'>): Promise<FileVersion>
  latestVersion(fileId: string): Promise<FileVersion | null>
  /** one version by number, or null */
  version(fileId: string, version: number): Promise<FileVersion | null>
  versions(fileId: string): Promise<FileVersion[]>
  loadDoc(fileId: string): Promise<Uint8Array | null>
  storeDoc(fileId: string, state: Uint8Array): Promise<void>
}

export class MemoryRepo implements Repo {
  private files = new Map<string, FileRecord>()
  private mem = new Map<string, Member>()
  private vers = new Map<string, FileVersion[]>()
  private docs = new Map<string, Uint8Array>()
  private inv = new Map<string, Invite>()

  async setInvite(i: Omit<Invite, 'createdAt'>) {
    if (!this.files.has(i.fileId)) return
    this.inv.set(`${i.fileId}|${i.email}`, { ...i, createdAt: new Date().toISOString() })
  }
  async invites(fileId: string) {
    return [...this.inv.values()].filter((i) => i.fileId === fileId).sort((a, b) => a.email.localeCompare(b.email))
  }
  async removeInvite(fileId: string, email: string) {
    this.inv.delete(`${fileId}|${email}`)
  }
  async claimInvites(email: string, who: { sub: string; name: string }) {
    const joined: string[] = []
    for (const [k, i] of [...this.inv.entries()]) {
      if (i.email !== email) continue
      this.inv.delete(k)
      if (!this.files.has(i.fileId) || this.mem.has(`${i.fileId}|${who.sub}`)) continue
      this.mem.set(`${i.fileId}|${who.sub}`, { fileId: i.fileId, sub: who.sub, name: who.name, role: i.role })
      joined.push(i.fileId)
    }
    return joined
  }

  async createFile(name: string, owner: { sub: string; name: string }) {
    const f: FileRecord = { id: randomUUID(), name, ownerSub: owner.sub, createdAt: new Date().toISOString() }
    this.files.set(f.id, f)
    this.mem.set(`${f.id}|${owner.sub}`, { fileId: f.id, sub: owner.sub, name: owner.name, role: 'owner' })
    return f
  }
  async getFile(id: string) {
    return this.files.get(id) ?? null
  }
  async listFiles(sub: string) {
    return [...this.mem.values()]
      .filter((m) => m.sub === sub && this.files.has(m.fileId))
      .map((m) => ({
        ...this.files.get(m.fileId)!,
        role: m.role,
        memberCount: [...this.mem.values()].filter((x) => x.fileId === m.fileId).length,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  async deleteFile(id: string) {
    this.files.delete(id)
    for (const k of [...this.mem.keys()]) if (k.startsWith(`${id}|`)) this.mem.delete(k)
    for (const k of [...this.inv.keys()]) if (k.startsWith(`${id}|`)) this.inv.delete(k)
    this.vers.delete(id)
    this.docs.delete(id)
  }
  async renameFile(id: string, name: string) {
    const f = this.files.get(id)
    if (f) this.files.set(id, { ...f, name })
  }
  async transferOwnership(fileId: string, fromSub: string, toSub: string) {
    const f = this.files.get(fileId)
    const from = this.mem.get(`${fileId}|${fromSub}`)
    const to = this.mem.get(`${fileId}|${toSub}`)
    if (!f || from?.role !== 'owner' || to?.role !== 'edit' || fromSub === toSub) return false
    this.mem.set(`${fileId}|${fromSub}`, { ...from, role: 'edit' })
    this.mem.set(`${fileId}|${toSub}`, { ...to, role: 'owner' })
    this.files.set(fileId, { ...f, ownerSub: toSub })
    return true
  }
  async roleOf(fileId: string, sub: string) {
    return this.mem.get(`${fileId}|${sub}`)?.role ?? null
  }
  async members(fileId: string) {
    return [...this.mem.values()].filter((m) => m.fileId === fileId)
  }
  async setMember(m: Member) {
    this.mem.set(`${m.fileId}|${m.sub}`, m)
  }
  async removeMember(fileId: string, sub: string) {
    this.mem.delete(`${fileId}|${sub}`)
  }
  async addVersion(v: Omit<FileVersion, 'version' | 'createdAt'>) {
    const list = this.vers.get(v.fileId) ?? []
    const out: FileVersion = { ...v, version: list.length + 1, createdAt: new Date().toISOString() }
    this.vers.set(v.fileId, [...list, out])
    return out
  }
  async latestVersion(fileId: string) {
    const list = this.vers.get(fileId) ?? []
    return list[list.length - 1] ?? null
  }
  async version(fileId: string, version: number) {
    return (this.vers.get(fileId) ?? []).find((v) => v.version === version) ?? null
  }
  async versions(fileId: string) {
    return [...(this.vers.get(fileId) ?? [])].reverse()
  }
  async loadDoc(fileId: string) {
    return this.docs.get(fileId) ?? null
  }
  async storeDoc(fileId: string, state: Uint8Array) {
    if (this.files.has(fileId)) this.docs.set(fileId, state)
  }
}
