import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncClient, SyncError, inviteEmail, inviteLinkUrl, parseInviteLink, shareBridge } from '../src'
import { SharedIndex } from '../src/shared-index'

const ID = '5f0c3f4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

describe('SyncClient', () => {
  it('needs a token before any request', async () => {
    const fetch = vi.fn()
    const c = new SyncClient({ baseUrl: 'http://127.0.0.1:8787', token: async () => null, fetch })
    await expect(c.listFiles()).rejects.toMatchObject({ status: 401 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the bearer token and reads the service errors', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer t1')
      if (url.endsWith('/files')) return new Response(JSON.stringify({ files: [{ id: ID, name: 'NDA.docx', ownerSub: 'jae', createdAt: 'x', role: 'comment' }, { id: 'bad', role: 'edit' }] }))
      return new Response(JSON.stringify({ error: 'Your role on this file does not allow that.' }), { status: 403 })
    })
    const c = new SyncClient({ baseUrl: 'http://127.0.0.1:8787/', token: async () => 't1', fetch })
    expect((await c.listFiles()).map((f) => f.id)).toEqual([ID])
    await expect(c.upload(ID, new Uint8Array([1]))).rejects.toEqual(new SyncError(403, 'Your role on this file does not allow that.'))
    expect(fetch).toHaveBeenCalledWith(`http://127.0.0.1:8787/files/${ID}/content`, expect.objectContaining({ method: 'PUT' }))
  })

  it('reads a file with the current role, deletes one, lists versions and says who is signed in', async () => {
    const calls: string[] = []
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url.replace('http://s', '')}`)
      if (url.endsWith('/me')) return new Response(JSON.stringify({ sub: 'jae', name: 'Jae' }))
      if (url.endsWith('/versions')) return new Response(JSON.stringify({ versions: [{ version: 2 }, { version: 1 }] }))
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response(JSON.stringify({ id: ID, name: 'Plan.docx', ownerSub: 'kim', createdAt: 'x', role: 'edit', latest: null }))
    })
    const c = new SyncClient({ baseUrl: 'http://s', token: async () => 't', fetch })
    expect(await c.getFile(ID)).toEqual({ id: ID, name: 'Plan.docx', ownerSub: 'kim', createdAt: 'x', role: 'edit', latest: null })
    await c.deleteFile(ID)
    expect((await c.versions(ID)).map((v) => v.version)).toEqual([2, 1])
    expect(await c.me()).toEqual({ sub: 'jae', name: 'Jae' })
    expect(calls).toEqual([`GET /files/${ID}`, `DELETE /files/${ID}`, `GET /files/${ID}/versions`, 'GET /me'])
  })

  it('downloads an earlier version, renames, transfers ownership and leaves', async () => {
    const calls: string[] = []
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url.replace('http://s', '')} ${init?.body ?? ''}`.trim())
      if (url.endsWith('/versions/3/content')) return new Response(new Uint8Array([7, 8]), { headers: { 'x-file-version': '3' } })
      if (url.endsWith('/transfer')) return new Response(JSON.stringify({ members: [{ sub: 'jae', name: 'Jae', role: 'owner' }] }))
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response(JSON.stringify({}))
    })
    const c = new SyncClient({ baseUrl: 'http://s', token: async () => 't', fetch })
    const v = await c.downloadVersion(ID, 3)
    expect([...v.bytes]).toEqual([7, 8])
    expect(v.version).toBe(3)
    await c.renameFile(ID, 'Plan v2.docx')
    expect((await c.transferOwnership(ID, 'jae'))[0]!.role).toBe('owner')
    await c.leave(ID)
    await expect(c.downloadVersion(ID, 0)).rejects.toMatchObject({ status: 404 })
    expect(calls).toEqual([
      `GET /files/${ID}/versions/3/content`,
      `PATCH /files/${ID} {"name":"Plan v2.docx"}`,
      `POST /files/${ID}/transfer {"sub":"jae"}`,
      `DELETE /files/${ID}/members/me`,
    ])
  })

  it('reads activity with a cursor and drops events it does not understand', async () => {
    const urls: string[] = []
    const fetch = vi.fn(async (url: string) => {
      urls.push(url.replace('http://s', ''))
      return new Response(
        JSON.stringify({
          events: [
            { id: 9, fileId: ID, fileName: 'Plan.docx', actorSub: 'jae', actorName: 'Jae', kind: 'version', detail: { version: 3 }, createdAt: 'x', you: true },
            { id: 8, fileId: ID, fileName: 'Plan.docx', actorSub: 'jae', actorName: 'Jae', kind: 'teleported', detail: {}, createdAt: 'x' },
            { id: 7, fileId: ID, fileName: 'Plan.docx', actorSub: 'jae', actorName: 'Jae', kind: 'left', detail: null, createdAt: 'x' },
          ],
          more: true,
        }),
      )
    })
    const c = new SyncClient({ baseUrl: 'http://s', token: async () => 't', fetch })
    const r = await c.activity({ after: 4, limit: 20 })
    expect(r.events.map((e) => e.id)).toEqual([9, 7])
    expect(r.events[1]!.detail).toEqual({})
    expect(r.events.map((e) => e.you)).toEqual([true, false])
    expect(r.more).toBe(true)
    await c.activity()
    expect(urls).toEqual(['/activity?after=4&limit=20', '/activity'])
  })

  it('reads invite links as pasted or clicked, and nothing else', () => {
    const T = 'Ab_-'.repeat(10) + 'xyz'
    expect(T).toHaveLength(43)
    expect(inviteLinkUrl(T)).toBe(`redrob-office://join/${T}`)
    expect(parseInviteLink(` redrob-office://join/${T} `)).toBe(T)
    expect(parseInviteLink(`redrob-office://join/${T}/`)).toBe(T)
    expect(parseInviteLink(T)).toBe(T)
    for (const bad of [`https://x/join/${T}`, `redrob-office://join/${T}?x=1`, `redrob-office://join/${T.slice(1)}`, `redrob-office://open/${T}`, '', null]) {
      expect(parseInviteLink(bad)).toBeNull()
    }
  })

  it('makes, lists, revokes, previews and redeems links', async () => {
    const T = 'q'.repeat(43)
    const LINK = '22222222-2222-4333-8444-555555555555'
    const calls: string[] = []
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url.replace('http://s', '')} ${init?.body ?? ''}`.trim())
      if (url.endsWith('/links') && init?.method === 'POST') return new Response(JSON.stringify({ token: T, link: { id: LINK, role: 'view' } }))
      if (url.endsWith('/links')) return new Response(JSON.stringify({ links: [{ id: LINK, role: 'view' }, { id: 'nope', role: 'view' }] }))
      if (url.endsWith('/redeem')) return new Response(JSON.stringify({ file: { id: ID, name: 'Plan.docx' }, role: 'view', joined: true }))
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response(JSON.stringify({ fileName: 'Plan.docx', ownerName: 'Kim', role: 'edit', expiresAt: 'x', alreadyHave: 'bogus' }))
    })
    const c = new SyncClient({ baseUrl: 'http://s', token: async () => 't', fetch })
    expect((await c.createLink(ID, 'view', 7)).token).toBe(T)
    expect(await c.links(ID)).toHaveLength(1)
    await c.revokeLink(ID, LINK)
    expect((await c.peekLink(T)).alreadyHave).toBeNull()
    expect((await c.redeemLink(T)).joined).toBe(true)
    await expect(c.redeemLink('short')).rejects.toMatchObject({ status: 404 })
    expect(calls).toEqual([
      `POST /files/${ID}/links {"role":"view","days":7}`,
      `GET /files/${ID}/links`,
      `DELETE /files/${ID}/links/${LINK}`,
      `GET /links/${T}`,
      `POST /links/${T}/redeem`,
    ])
  })

  it('invites by e-mail, lists and cancels invites', async () => {
    const calls: string[] = []
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url.replace('http://s', '')} ${init?.body ?? ''}`.trim())
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response(JSON.stringify({ invites: [{ email: 'mina@example.com', role: 'view', invitedBy: 'me', createdAt: 'x' }, { email: 1 }] }))
    })
    const c = new SyncClient({ baseUrl: 'http://s', token: async () => 't', fetch })
    expect(await c.invite(ID, 'mina@example.com', 'view')).toHaveLength(2)
    expect(await c.invites(ID)).toHaveLength(1)
    await c.cancelInvite(ID, 'mina@example.com')
    expect(calls).toEqual([
      `PUT /files/${ID}/invites/mina%40example.com {"role":"view"}`,
      `GET /files/${ID}/invites`,
      `DELETE /files/${ID}/invites/mina%40example.com`,
    ])
    expect(inviteEmail(' Mina@Example.COM ')).toBe('mina@example.com')
    expect(inviteEmail('mina')).toBeNull()
  })

  it('sends comments for the service to write, and refuses a malformed comment id', async () => {
    const calls: string[] = []
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url.replace('http://s', '')} ${init?.body}`)
      return new Response(JSON.stringify({ comment: { id: '123456789', author: 'Jae', text: 'x', date: 'd' } }))
    })
    const c = new SyncClient({ baseUrl: 'http://s', token: async () => 't', fetch })
    expect((await c.addComment(ID, { text: 'x', parentId: '1' })).id).toBe('123456789')
    await c.updateComment(ID, '123456789', { done: true })
    await expect(c.updateComment(ID, '../x', { done: true })).rejects.toMatchObject({ status: 404 })
    expect(calls).toEqual([
      `POST /files/${ID}/comments {"text":"x","parentId":"1"}`,
      `PATCH /files/${ID}/comments/123456789 {"done":true}`,
    ])
  })

  it('refuses a malformed file id without a request, and says when the service is down', async () => {
    const fetch = vi.fn(async () => Promise.reject(new Error('ECONNREFUSED')))
    const c = new SyncClient({ baseUrl: 'http://127.0.0.1:8787', token: async () => 't', fetch })
    await expect(c.download('../etc')).rejects.toMatchObject({ status: 404 })
    expect(fetch).not.toHaveBeenCalled()
    await expect(c.listFiles()).rejects.toMatchObject({ status: 0 })
  })
})

describe('SharedIndex', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rr-shared-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('links a local file to a shared one, by path regardless of case, across instances', async () => {
    const file = join(dir, 'shared.json')
    const a = new SharedIndex(file)
    await a.set('C:\\Docs\\NDA.docx', { fileId: ID, role: 'owner', version: 1 })
    const b = new SharedIndex(file)
    expect(await b.get('c:\\docs\\nda.docx')).toEqual({ fileId: ID, role: 'owner', version: 1 })
    expect(await b.pathOf(ID)).toBe('C:\\Docs\\NDA.docx')
    await b.remove('C:\\Docs\\NDA.docx')
    expect(await new SharedIndex(file).get('C:\\Docs\\NDA.docx')).toBeNull()
  })
})

describe('shareBridge', () => {
  it('degrades to unavailable when the shell has no handler', async () => {
    const bridge = shareBridge({ invoke: async () => Promise.reject(new Error('No handler')) })
    expect(await bridge.shareStatus('C:\\a.docx')).toEqual({ available: false, reason: 'no-service' })
    expect(await bridge.shareInvite('C:\\a.docx', 'jae', 'edit')).toEqual({ ok: false, error: 'Sharing is not available here.' })
  })
})
