import { describe, expect, it, vi } from 'vitest'
import { SHARE_CHANNELS, SyncError, type RemoteFile, type RemoteFileDetail, type RemoteInvite, type RemoteMember, type Role } from '@genoffice/sync-client'
import type { SharedLink } from '@genoffice/sync-client/node'
import { SHARE_MESSAGES, ShareService, cleanAccount, isShareablePath, type ShareClient, type ShareIndex } from '../src/main/share-service'

const FILE = process.platform === 'win32' ? 'C:\\work\\Plan.docx' : '/work/Plan.docx'
const ID = '11111111-2222-4333-8444-555555555555'

function fakeIndex(): ShareIndex & { map: Map<string, SharedLink> } {
  const map = new Map<string, SharedLink>()
  return {
    map,
    get: async (p) => map.get(p) ?? null,
    pathOf: async (id) => [...map.entries()].find(([, v]) => v.fileId === id)?.[0] ?? null,
    set: async (p, l) => void map.set(p, l),
    remove: async (p) => void map.delete(p),
  }
}

function fakeClient(over: Partial<ShareClient> = {}) {
  let members: RemoteMember[] = [{ sub: 'me', name: 'Me', role: 'owner' }]
  let pending: RemoteInvite[] = []
  const client = {
    listFiles: vi.fn(async (): Promise<RemoteFile[]> => []),
    createFile: vi.fn(async (name: string): Promise<RemoteFile> => ({ id: ID, name, ownerSub: 'me', createdAt: 'now', role: 'owner' })),
    upload: vi.fn(async () => ({ version: 1, sha256: 'x', size: 3, createdBy: 'me', createdAt: 'now' })),
    download: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), version: 4 })),
    members: vi.fn(async () => members),
    setMember: vi.fn(async (_id: string, sub: string, role: Role, name: string) => {
      members = [...members.filter((m) => m.sub !== sub), { sub, name, role }]
      return members
    }),
    removeMember: vi.fn(async (_id: string, sub: string) => {
      members = members.filter((m) => m.sub !== sub)
    }),
    getFile: vi.fn(async (id: string): Promise<RemoteFileDetail> => ({ id, name: 'Plan.docx', ownerSub: 'me', createdAt: 'now', role: 'owner', latest: null })),
    deleteFile: vi.fn(async () => undefined),
    invites: vi.fn(async (): Promise<RemoteInvite[]> => pending),
    invite: vi.fn(async (_id: string, email: string, role: Role) => {
      pending = [...pending.filter((i) => i.email !== email), { email, role, invitedBy: 'me', createdAt: 'now' }]
      return pending
    }),
    cancelInvite: vi.fn(async (_id: string, email: string) => {
      pending = pending.filter((i) => i.email !== email)
    }),
    addComment: vi.fn(async (_id: string, input: { text: string }) => ({ id: '123456789', author: 'Me', text: input.text, date: 'now' })),
    updateComment: vi.fn(async (_id: string, cid: string) => ({ id: cid, author: 'Me', text: 'x', date: 'now' })),
    versions: vi.fn(async () => [
      { version: 2, sha256: 'b', size: 5, createdBy: 'jae', createdAt: '2026-10-06T09:14:00.000Z' },
      { version: 1, sha256: 'a', size: 3, createdBy: 'gone', createdAt: '2026-10-05T08:00:00.000Z' },
    ]),
    downloadVersion: vi.fn(async (_id: string, version: number) => ({ bytes: new Uint8Array([version]), version })),
    renameFile: vi.fn(async () => undefined),
    transferOwnership: vi.fn(async (_id: string, sub: string) => {
      members = members.map((m) => (m.sub === sub ? { ...m, role: 'owner' as Role } : m.role === 'owner' ? { ...m, role: 'edit' as Role } : m))
      return members
    }),
    leave: vi.fn(async () => undefined),
    ...over,
  }
  return client
}

function service(opts: { client?: ShareClient | null; signedIn?: boolean; index?: ShareIndex } = {}) {
  const index = opts.index ?? fakeIndex()
  const openPath = vi.fn()
  const saveDownload = vi.fn(async (name: string) => `/docs/Shared/${name}`)
  const saveCopyBeside = vi.fn(async (_beside: string, name: string, _bytes: Uint8Array) => `/work/${name}`)
  const log = vi.fn()
  const svc = new ShareService({
    client: opts.client === undefined ? fakeClient() : opts.client,
    index,
    signedIn: async () => opts.signedIn ?? true,
    readFile: async () => new Uint8Array([9, 9]),
    saveDownload,
    saveCopyBeside,
    openPath,
    log,
  })
  return { svc, index, openPath, saveDownload, saveCopyBeside, log }
}

describe('share rules', () => {
  it('shares saved documents only and checks the account', () => {
    expect(isShareablePath(FILE)).toBe(true)
    expect(isShareablePath('Plan.docx')).toBe(false)
    expect(isShareablePath(FILE.replace('.docx', '.exe'))).toBe(false)
    expect(isShareablePath(42)).toBe(false)
    expect(cleanAccount('  kim@redrob.io ')).toBe('kim@redrob.io')
    expect(cleanAccount('two words')).toBeNull()
    expect(cleanAccount('')).toBeNull()
    expect(cleanAccount('x'.repeat(201))).toBeNull()
  })
})

describe('ShareService', () => {
  it('says why sharing is unavailable', async () => {
    expect(await service({ client: null }).svc.status(FILE)).toEqual({ available: false, reason: 'no-service' })
    expect(await service({ signedIn: false }).svc.status(FILE)).toEqual({ available: false, reason: 'signed-out' })
    expect(await service({ client: null }).svc.invite(FILE, 'kim', 'edit')).toEqual({ ok: false, error: SHARE_MESSAGES.noService })
    expect(await service({ signedIn: false }).svc.sharedWithMe()).toEqual({ error: SHARE_MESSAGES.signedOut })
  })

  it('the first invite creates the shared file, uploads it and gives the role', async () => {
    const client = fakeClient()
    const { svc, index } = service({ client })
    expect(await svc.status(FILE)).toEqual({ available: true, shared: false })
    const r = await svc.invite(FILE, 'kim', 'comment')
    expect(r.ok).toBe(true)
    expect(client.createFile).toHaveBeenCalledWith('Plan.docx')
    expect(client.upload).toHaveBeenCalledWith(ID, new Uint8Array([9, 9]))
    expect(client.setMember).toHaveBeenCalledWith(ID, 'kim', 'comment', 'kim')
    expect(await index.get(FILE)).toEqual({ fileId: ID, role: 'owner', version: 1 })
    // a second invite reuses the shared file
    await svc.invite(FILE, 'lee', 'view')
    expect(client.createFile).toHaveBeenCalledTimes(1)
    const st = await svc.status(FILE)
    expect(st.available && st.shared && st.members.map((m) => m.sub)).toEqual(['me', 'kim', 'lee'])
  })

  it('refuses the owner role, a bad account, and changes by someone who is not the owner', async () => {
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'edit', version: 1 })
    const { svc } = service({ index })
    expect(await svc.invite(FILE, 'kim', 'owner')).toEqual({ ok: false, error: SHARE_MESSAGES.badRole })
    expect(await svc.invite(FILE, ' ', 'edit')).toEqual({ ok: false, error: SHARE_MESSAGES.badAccount })
    expect(await svc.invite(FILE, 'kim', 'edit')).toEqual({ ok: false, error: SHARE_MESSAGES.notOwner })
    expect(await svc.remove(FILE, 'kim')).toEqual({ ok: false, error: SHARE_MESSAGES.notOwner })
  })

  it('an unreachable service changes nothing and says so', async () => {
    const client = fakeClient({
      createFile: vi.fn(async () => {
        throw new SyncError(0, 'The sync service could not be reached.')
      }),
    })
    const { svc, index } = service({ client })
    expect(await svc.invite(FILE, 'kim', 'edit')).toEqual({ ok: false, error: 'The sync service could not be reached. Nothing changed.' })
    expect(index.map.size).toBe(0)
  })

  it('a save uploads a new version only for an owner or editor', async () => {
    const client = fakeClient()
    const index = fakeIndex()
    const { svc } = service({ client, index })
    await svc.saved(FILE, new Uint8Array([1]))
    expect(client.upload).not.toHaveBeenCalled()
    await index.set(FILE, { fileId: ID, role: 'view', version: 1 })
    await svc.saved(FILE, new Uint8Array([1]))
    expect(client.upload).not.toHaveBeenCalled()
    await index.set(FILE, { fileId: ID, role: 'edit', version: 1 })
    await svc.saved(FILE, new Uint8Array([1]))
    expect(client.upload).toHaveBeenCalledWith(ID, new Uint8Array([1]))
    expect((await index.get(FILE))?.version).toBe(1)
  })

  it('an upload after save announces the new version, and pull fetches the latest bytes without touching the index', async () => {
    const client = fakeClient()
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'edit', version: 1 })
    const uploaded = vi.fn()
    const svc = new ShareService({
      client,
      index,
      signedIn: async () => true,
      readFile: async () => new Uint8Array(),
      saveDownload: async () => '',
      openPath: () => undefined,
      uploaded,
    })
    await svc.saved(FILE, new Uint8Array([1]))
    expect(uploaded).toHaveBeenCalledWith(ID, 1)
    expect(await svc.pull(FILE)).toEqual({ bytes: new Uint8Array([1, 2, 3]), version: 4 })
    expect((await index.get(FILE))?.version).toBe(1)
    expect(await svc.pull('relative.docx')).toBeNull()
  })

  it('a failed upload after save never throws', async () => {
    const client = fakeClient({
      upload: vi.fn(async () => {
        throw new SyncError(0, 'down')
      }),
    })
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'owner', version: 1 })
    await expect(service({ client, index }).svc.saved(FILE, new Uint8Array([1]))).resolves.toBeUndefined()
  })

  it('lists files shared with this person and downloads one into Shared on open', async () => {
    const client = fakeClient({
      listFiles: vi.fn(async (): Promise<RemoteFile[]> => [
        { id: ID, name: 'Budget.xlsx', ownerSub: 'kim', createdAt: 'now', role: 'edit' },
        { id: '99999999-2222-4333-8444-555555555555', name: 'Mine.docx', ownerSub: 'me', createdAt: 'now', role: 'owner' },
      ]),
    })
    const { svc, index, openPath, saveDownload } = service({ client })
    expect(await svc.sharedWithMe()).toEqual([{ id: ID, name: 'Budget.xlsx', role: 'edit', localPath: null }])
    const r = await svc.open(ID)
    expect(r).toEqual({ ok: true, path: '/docs/Shared/Budget.xlsx' })
    expect(saveDownload).toHaveBeenCalledWith('Budget.xlsx', new Uint8Array([1, 2, 3]))
    expect(await index.get('/docs/Shared/Budget.xlsx')).toEqual({ fileId: ID, role: 'edit', version: 4 })
    expect(openPath).toHaveBeenCalledWith('/docs/Shared/Budget.xlsx')
    // the second open uses the copy already here
    await svc.open(ID)
    expect(client.download).toHaveBeenCalledTimes(1)
    expect(await svc.sharedWithMe()).toEqual([{ id: ID, name: 'Budget.xlsx', role: 'edit', localPath: '/docs/Shared/Budget.xlsx' }])
  })

  it('a removed share falls back to not shared and keeps the local file', async () => {
    const client = fakeClient({
      members: vi.fn(async () => {
        throw new SyncError(404, 'No such file.')
      }),
    })
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'edit', version: 1 })
    expect(await service({ client, index }).svc.status(FILE)).toEqual({ available: true, shared: false })
    expect(index.map.size).toBe(0)
  })

  it('status follows a role the owner changed since the index was written', async () => {
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'view', version: 2 })
    const client = fakeClient({ getFile: vi.fn(async (id: string) => ({ id, name: 'Plan.docx', ownerSub: 'kim', createdAt: 'now', role: 'edit' as const, latest: null })) })
    const st = await service({ client, index }).svc.status(FILE)
    expect(st).toMatchObject({ available: true, shared: true, role: 'edit' })
    expect(await index.get(FILE)).toEqual({ fileId: ID, role: 'edit', version: 2 })
  })

  it('the owner stops sharing: the shared file is deleted and the local file stays', async () => {
    const client = fakeClient()
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'owner', version: 3 })
    const { svc } = service({ client, index })
    expect(await svc.stop(FILE)).toEqual({ ok: true, status: { available: true, shared: false } })
    expect(client.deleteFile).toHaveBeenCalledWith(ID)
    expect(index.map.size).toBe(0)
    // stopping a file that is not shared is already done
    expect(await svc.stop(FILE)).toEqual({ ok: true, status: { available: true, shared: false } })
    expect(client.deleteFile).toHaveBeenCalledTimes(1)
  })

  it('only the owner may stop sharing, checked against the service', async () => {
    const client = fakeClient({ getFile: vi.fn(async (id: string) => ({ id, name: 'Plan.docx', ownerSub: 'kim', createdAt: 'now', role: 'edit' as const, latest: null })) })
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'owner', version: 1 })
    expect(await service({ client, index }).svc.stop(FILE)).toEqual({ ok: false, error: SHARE_MESSAGES.notOwner })
    expect(client.deleteFile).not.toHaveBeenCalled()
    expect((await index.get(FILE))?.role).toBe('edit')
  })

  it('a file already gone from the service counts as stopped; an outage does not', async () => {
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'owner', version: 1 })
    const gone = fakeClient({ deleteFile: vi.fn(async () => Promise.reject(new SyncError(404, 'No such file.'))) })
    expect((await service({ client: gone, index }).svc.stop(FILE)).ok).toBe(true)
    await index.set(FILE, { fileId: ID, role: 'owner', version: 1 })
    const down = fakeClient({ deleteFile: vi.fn(async () => Promise.reject(new SyncError(0, 'down'))) })
    expect(await service({ client: down, index }).svc.stop(FILE)).toEqual({ ok: false, error: SHARE_MESSAGES.unreachable })
    expect(index.map.size).toBe(1)
  })

  it('lists the files this person shares, with how many others have each', async () => {
    const client = fakeClient({
      listFiles: vi.fn(async (): Promise<RemoteFile[]> => [
        { id: ID, name: 'Plan.docx', ownerSub: 'me', createdAt: 'now', role: 'owner', memberCount: 3 },
        { id: '99999999-2222-4333-8444-555555555555', name: 'Theirs.docx', ownerSub: 'kim', createdAt: 'now', role: 'edit', memberCount: 2 },
      ]),
    })
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'owner', version: 1 })
    expect(await service({ client, index }).svc.sharedByMe()).toEqual([{ id: ID, name: 'Plan.docx', localPath: FILE, people: 2 }])
    expect(await service({ client: null }).svc.sharedByMe()).toEqual({ error: SHARE_MESSAGES.noService })
  })

  it('a save refused for a lost role brings the index up to date', async () => {
    const client = fakeClient({
      upload: vi.fn(async () => Promise.reject(new SyncError(403, 'Your role on this file does not allow that.'))),
      getFile: vi.fn(async (id: string) => ({ id, name: 'Plan.docx', ownerSub: 'kim', createdAt: 'now', role: 'view' as const, latest: null })),
    })
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'edit', version: 1 })
    const { svc } = service({ client, index })
    await svc.saved(FILE, new Uint8Array([1]))
    expect((await index.get(FILE))?.role).toBe('view')
    await svc.saved(FILE, new Uint8Array([1]))
    expect(client.upload).toHaveBeenCalledTimes(1)
  })

  it('an e-mail address is invited and waits; an account id joins at once', async () => {
    const client = fakeClient()
    const { svc } = service({ client })
    const r = await svc.invite(FILE, ' Mina@Example.com ', 'view')
    expect(client.invite).toHaveBeenCalledWith(ID, 'mina@example.com', 'view')
    expect(client.setMember).not.toHaveBeenCalled()
    expect(r.ok && r.status.available && r.status.shared && r.status.pending).toEqual([{ email: 'mina@example.com', role: 'view' }])
    await svc.invite(FILE, 'kim', 'edit')
    expect(client.setMember).toHaveBeenCalledWith(ID, 'kim', 'edit', 'kim')
    // removing the address cancels the invite rather than a member
    const after = await svc.remove(FILE, 'mina@example.com')
    expect(client.cancelInvite).toHaveBeenCalledWith(ID, 'mina@example.com')
    expect(client.removeMember).not.toHaveBeenCalled()
    expect(after.ok && after.status.available && after.status.shared && after.status.pending).toEqual([])
  })

  it('only the owner is shown pending invites', async () => {
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'edit', version: 1 })
    const client = fakeClient({ getFile: vi.fn(async (id: string) => ({ id, name: 'Plan.docx', ownerSub: 'kim', createdAt: 'now', role: 'edit' as const, latest: null })) })
    const st = await service({ client, index }).svc.status(FILE)
    expect(st.available && st.shared && st.pending).toBeUndefined()
    expect(client.invites).not.toHaveBeenCalled()
  })

  it('sends a commenter’s thread, reply and resolve to the service for the linked file', async () => {
    const client = fakeClient()
    const index = fakeIndex()
    await index.set(FILE, { fileId: ID, role: 'comment', version: 1 })
    const { svc } = service({ client, index })
    const anchor = { anchor: { type: null, tname: 'prosemirror', item: null, assoc: 0 }, head: { assoc: 0 } }
    expect(await svc.commentAdd(FILE, { text: 'Is this right?', anchor, author: 'Somebody else' })).toEqual({ ok: true, id: '123456789' })
    expect(client.addComment).toHaveBeenCalledWith(ID, { text: 'Is this right?', anchor })
    await svc.commentAdd(FILE, { text: 'Yes', parentId: '123456789' })
    expect(client.addComment).toHaveBeenLastCalledWith(ID, { text: 'Yes', parentId: '123456789' })
    expect(await svc.commentUpdate(FILE, '123456789', { done: true })).toEqual({ ok: true })
    expect(client.updateComment).toHaveBeenCalledWith(ID, '123456789', { done: true })
    // nothing to anchor or reply to, no words, or a file that is not shared
    expect(await svc.commentAdd(FILE, { text: 'x' })).toEqual({ ok: false, error: SHARE_MESSAGES.badComment })
    expect(await svc.commentAdd(FILE, { text: ' ', parentId: '1' })).toEqual({ ok: false, error: SHARE_MESSAGES.badComment })
    expect(await svc.commentAdd(FILE.replace('Plan', 'Other'), { text: 'x', parentId: '1' })).toEqual({ ok: false, error: SHARE_MESSAGES.gone })
  })

  it('lists shared versions by name and opens an earlier one as a copy beside the file', async () => {
    const client = fakeClient({ members: vi.fn(async () => [{ sub: 'jae', name: 'Jae Gardner', role: 'edit' as Role }]) })
    const { svc, index, saveCopyBeside, openPath } = service({ client })
    expect(await svc.versions(FILE)).toBeNull()
    index.map.set(FILE, { fileId: ID, role: 'view', version: 2 })
    expect(await svc.versions(FILE)).toEqual([
      { version: 2, at: '2026-10-06T09:14:00.000Z', by: 'Jae Gardner', size: 5 },
      { version: 1, at: '2026-10-05T08:00:00.000Z', by: 'gone', size: 3 },
    ])
    const r = await svc.restoreVersion(FILE, 1)
    expect(r).toEqual({ ok: true, path: '/work/Plan (version 2026-10-05 08.00).docx' })
    expect(saveCopyBeside).toHaveBeenCalledWith(FILE, 'Plan (version 2026-10-05 08.00).docx', new Uint8Array([1]))
    expect(openPath).toHaveBeenCalledWith('/work/Plan (version 2026-10-05 08.00).docx')
    // the shared file and its index entry are untouched
    expect(index.map.get(FILE)).toEqual({ fileId: ID, role: 'view', version: 2 })
    expect(await svc.restoreVersion(FILE, 9)).toEqual({ ok: false, error: SHARE_MESSAGES.noVersion })
    expect(await svc.restoreVersion(FILE, '1')).toEqual({ ok: false, error: SHARE_MESSAGES.noVersion })
  })

  it('forgets a file whose versions the service no longer shows this person', async () => {
    const client = fakeClient({ versions: vi.fn(async () => Promise.reject(new SyncError(404, 'No such file.'))) })
    const { svc, index } = service({ client })
    index.map.set(FILE, { fileId: ID, role: 'edit', version: 1 })
    expect(await svc.versions(FILE)).toBeNull()
    expect(index.map.has(FILE)).toBe(false)
  })

  it('hands ownership to an editor and keeps editing', async () => {
    const client = fakeClient()
    const { svc, index } = service({ client })
    index.map.set(FILE, { fileId: ID, role: 'owner', version: 1 })
    await svc.invite(FILE, 'jae', 'edit')
    const r = await svc.transfer(FILE, 'jae')
    expect(r.ok).toBe(true)
    expect(client.transferOwnership).toHaveBeenCalledWith(ID, 'jae')
    expect(index.map.get(FILE)!.role).toBe('edit')
    if (r.ok && r.status.available && r.status.shared) expect(r.status.role).toBe('edit')
    // not an editor yet
    const refusing = fakeClient({ transferOwnership: vi.fn(async () => Promise.reject(new SyncError(409, 'x'))) })
    const s2 = service({ client: refusing })
    s2.index.map.set(FILE, { fileId: ID, role: 'owner', version: 1 })
    expect(await s2.svc.transfer(FILE, 'min')).toEqual({ ok: false, error: SHARE_MESSAGES.notEditor })
  })

  it('only the owner transfers; anyone else may leave, and the owner may not', async () => {
    const editorClient = fakeClient({ getFile: vi.fn(async (id: string) => ({ id, name: 'Plan.docx', ownerSub: 'kim', createdAt: 'now', role: 'edit' as Role, latest: null })) })
    const { svc, index } = service({ client: editorClient })
    index.map.set(FILE, { fileId: ID, role: 'edit', version: 1 })
    expect(await svc.transfer(FILE, 'min')).toEqual({ ok: false, error: SHARE_MESSAGES.notOwner })
    expect(await svc.leave(FILE)).toEqual({ ok: true, status: { available: true, shared: false } })
    expect(editorClient.leave).toHaveBeenCalledWith(ID)
    expect(index.map.has(FILE)).toBe(false)

    const owner = service()
    owner.index.map.set(FILE, { fileId: ID, role: 'owner', version: 1 })
    expect(await owner.svc.leave(FILE)).toEqual({ ok: false, error: SHARE_MESSAGES.ownerStays })
    expect(owner.index.map.has(FILE)).toBe(true)
  })

  it('a local rename moves the index entry and renames the shared file for an editor', async () => {
    const client = fakeClient()
    const { svc, index } = service({ client })
    const to = FILE.replace('Plan', 'Plan v2')
    index.map.set(FILE, { fileId: ID, role: 'edit', version: 3 })
    await svc.renamed(FILE, to)
    expect(index.map.has(FILE)).toBe(false)
    expect(index.map.get(to)).toEqual({ fileId: ID, role: 'edit', version: 3 })
    expect(client.renameFile).toHaveBeenCalledWith(ID, 'Plan v2.docx')
    // a viewer's rename stays on their computer
    const viewer = fakeClient()
    const v = service({ client: viewer })
    v.index.map.set(FILE, { fileId: ID, role: 'view', version: 3 })
    await v.svc.renamed(FILE, to)
    expect(v.index.map.get(to)?.role).toBe('view')
    expect(viewer.renameFile).not.toHaveBeenCalled()
    // an unshared file is left alone, and a failed rename is only logged
    const failing = fakeClient({ renameFile: vi.fn(async () => Promise.reject(new SyncError(0, 'down'))) })
    const f = service({ client: failing })
    await f.svc.renamed(FILE, to)
    expect(failing.renameFile).not.toHaveBeenCalled()
    f.index.map.set(FILE, { fileId: ID, role: 'owner', version: 1 })
    await expect(f.svc.renamed(FILE, to)).resolves.toBeUndefined()
    expect(f.log).toHaveBeenCalled()
  })

  it('registers every share channel', () => {
    const handled: string[] = []
    service().svc.register({ handle: (c) => void handled.push(c) })
    expect(handled.sort()).toEqual(Object.values(SHARE_CHANNELS).sort())
  })
})
