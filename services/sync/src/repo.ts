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

export interface Repo {
  createFile(name: string, owner: { sub: string; name: string }): Promise<FileRecord>
  getFile(id: string): Promise<FileRecord | null>
  /** files this account is a member of, newest first */
  listFiles(sub: string): Promise<Array<FileRecord & { role: Role; memberCount: number }>>
  deleteFile(id: string): Promise<void>
  roleOf(fileId: string, sub: string): Promise<Role | null>
  members(fileId: string): Promise<Member[]>
  setMember(m: Member): Promise<void>
  removeMember(fileId: string, sub: string): Promise<void>
  addVersion(v: Omit<FileVersion, 'version' | 'createdAt'>): Promise<FileVersion>
  latestVersion(fileId: string): Promise<FileVersion | null>
  versions(fileId: string): Promise<FileVersion[]>
  loadDoc(fileId: string): Promise<Uint8Array | null>
  storeDoc(fileId: string, state: Uint8Array): Promise<void>
}

export class MemoryRepo implements Repo {
  private files = new Map<string, FileRecord>()
  private mem = new Map<string, Member>()
  private vers = new Map<string, FileVersion[]>()
  private docs = new Map<string, Uint8Array>()

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
    this.vers.delete(id)
    this.docs.delete(id)
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
