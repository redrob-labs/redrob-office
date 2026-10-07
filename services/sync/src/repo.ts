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

export type EventKind =
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

/** Something someone did to a shared file, kept for the people who had it then. */
export interface ActivityEvent {
  id: number
  fileId: string
  fileName: string
  actorSub: string
  actorName: string
  kind: EventKind
  detail: Record<string, unknown>
  createdAt: string
}

export interface NewEvent extends Omit<ActivityEvent, 'id' | 'createdAt'> {
  /** who may see it: everyone with the file at that moment, plus anyone it is about */
  audience: readonly string[]
}

export interface ActivityQuery {
  /** only events newer than this id */
  after?: number | undefined
  /** only events older than this id (paging back) */
  before?: number | undefined
  limit: number
}

/** A link that lets a signed-in person join a file with a role, until it expires or is revoked. */
export interface InviteLink {
  id: string
  fileId: string
  role: Role
  createdBy: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  uses: number
}

export interface Repo {
  /** throws when the database cannot be reached (readiness) */
  ping(): Promise<void>
  /** deletes activity older than `before`; returns how many events went */
  pruneEvents(before: Date): Promise<number>
  createLink(l: { fileId: string; tokenHash: string; role: Role; createdBy: string; expiresAt: Date }): Promise<InviteLink>
  /** the file's links that are not revoked, newest first (expired ones included, marked by expiresAt) */
  links(fileId: string): Promise<InviteLink[]>
  /** false when there is no such link on this file */
  revokeLink(fileId: string, linkId: string): Promise<boolean>
  /**
   * Redeems a live link (not revoked, not expired at `now`): the account joins
   * with the link's role, unless it already has the file, whose role is never
   * changed. Null when the link does not work.
   */
  redeemLink(tokenHash: string, who: { sub: string; name: string }, now: Date): Promise<{ fileId: string; role: Role; joined: boolean } | null>
  /** a live link by its hash, without using it */
  peekLink(tokenHash: string, now: Date): Promise<InviteLink | null>
  addEvent(e: NewEvent): Promise<void>
  /** events this account may see, by others, newest first */
  activity(sub: string, q: ActivityQuery): Promise<ActivityEvent[]>
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
  private events: Array<ActivityEvent & { audience: Set<string> }> = []
  private linkRows: Array<InviteLink & { tokenHash: string }> = []

  async ping() {}
  async pruneEvents(before: Date) {
    const keep = this.events.filter((e) => Date.parse(e.createdAt) >= before.getTime())
    const gone = this.events.length - keep.length
    this.events = keep
    return gone
  }

  async createLink(l: { fileId: string; tokenHash: string; role: Role; createdBy: string; expiresAt: Date }) {
    const row = {
      id: randomUUID(),
      fileId: l.fileId,
      tokenHash: l.tokenHash,
      role: l.role,
      createdBy: l.createdBy,
      createdAt: new Date().toISOString(),
      expiresAt: l.expiresAt.toISOString(),
      revokedAt: null,
      uses: 0,
    }
    this.linkRows.push(row)
    const { tokenHash: _t, ...link } = row
    return link
  }
  async links(fileId: string) {
    return this.linkRows
      .filter((l) => l.fileId === fileId && !l.revokedAt && this.files.has(fileId))
      .reverse()
      .map(({ tokenHash: _t, ...l }) => l)
  }
  async revokeLink(fileId: string, linkId: string) {
    const l = this.linkRows.find((x) => x.id === linkId && x.fileId === fileId && !x.revokedAt)
    if (!l) return false
    l.revokedAt = new Date().toISOString()
    return true
  }
  async peekLink(tokenHash: string, now: Date) {
    const l = this.linkRows.find((x) => x.tokenHash === tokenHash)
    if (!l || l.revokedAt || Date.parse(l.expiresAt) <= now.getTime() || !this.files.has(l.fileId)) return null
    const { tokenHash: _t, ...link } = l
    return link
  }
  async redeemLink(tokenHash: string, who: { sub: string; name: string }, now: Date) {
    const l = this.linkRows.find((x) => x.tokenHash === tokenHash)
    if (!l || l.revokedAt || Date.parse(l.expiresAt) <= now.getTime() || !this.files.has(l.fileId)) return null
    l.uses += 1
    const key = `${l.fileId}|${who.sub}`
    const had = this.mem.get(key)
    if (had) return { fileId: l.fileId, role: had.role, joined: false }
    this.mem.set(key, { fileId: l.fileId, sub: who.sub, name: who.name, role: l.role })
    return { fileId: l.fileId, role: l.role, joined: true }
  }

  async addEvent(e: NewEvent) {
    const { audience, ...rest } = e
    this.events.push({ ...rest, id: this.events.length + 1, createdAt: new Date().toISOString(), audience: new Set(audience) })
  }
  async activity(sub: string, q: ActivityQuery) {
    return this.events
      .filter((e) => e.audience.has(sub) && e.actorSub !== sub && (q.after === undefined || e.id > q.after) && (q.before === undefined || e.id < q.before))
      .reverse()
      .slice(0, q.limit)
      .map(({ audience: _a, ...e }) => e)
  }

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
    this.linkRows = this.linkRows.filter((l) => l.fileId !== id)
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
