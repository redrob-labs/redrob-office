import { describe, expect, it } from 'vitest'
import { atLeast, can, canGrant, liveReadOnly } from '../src/access.ts'
import { bearer, devIssuer } from '../src/auth.ts'
import { MemoryBlobs } from '../src/blobs.ts'
import { authenticate } from '../src/collab.ts'
import { loadConfig } from '../src/config.ts'
import { buildApp } from '../src/http.ts'
import { MemoryRepo } from '../src/repo.ts'

const ENV = {
  DATABASE_URL: 'postgres://x',
  S3_ENDPOINT: 'http://minio:9000',
  S3_BUCKET: 'office',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
}

async function setup() {
  const dev = await devIssuer({ issuer: 'http://test/dev', audience: 'redrob-office-sync' })
  const repo = new MemoryRepo()
  const app = buildApp({ repo, blobs: new MemoryBlobs(), verifier: dev, devIssuer: dev, maxFileBytes: 1024 * 1024 })
  const felix = await dev.sign({ sub: 'felix', name: 'Felix Kim' })
  const jae = await dev.sign({ sub: 'jae', name: 'Jae Gardner' })
  const auth = (t: string) => ({ authorization: `Bearer ${t}` })
  return { dev, repo, app, felix, jae, auth }
}

describe('access', () => {
  it('orders roles and maps actions to them', () => {
    expect(atLeast('edit', 'comment')).toBe(true)
    expect(atLeast('view', 'comment')).toBe(false)
    expect(can('comment', 'comment')).toBe(true)
    expect(can('edit', 'share')).toBe(false)
    expect(can(null, 'read')).toBe(false)
    expect(liveReadOnly('comment')).toBe(true)
    expect(liveReadOnly('edit')).toBe(false)
    expect(canGrant('owner', 'edit', false)).toBe(true)
    expect(canGrant('owner', 'owner', false)).toBe(false)
    expect(canGrant('owner', 'view', true)).toBe(false)
    expect(canGrant('edit', 'view', false)).toBe(false)
  })
})

describe('config and tokens', () => {
  it('refuses the development issuer in production and names what is missing', () => {
    expect(() => loadConfig({ ...ENV, SYNC_DEV_ISSUER: '1', NODE_ENV: 'production' })).toThrow(/refused/)
    expect(() => loadConfig({ ...ENV })).toThrow(/SYNC_JWKS_URL/)
    expect(loadConfig({ ...ENV, SYNC_DEV_ISSUER: '1' }).auth.kind).toBe('dev')
    expect(loadConfig({ ...ENV, SYNC_DEV_ISSUER: '1' }).host).toBe('127.0.0.1')
  })

  it('reads a bearer token and rejects anything else', async () => {
    expect(bearer('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(bearer('Basic abc')).toBeNull()
    expect(bearer(undefined)).toBeNull()
    const dev = await devIssuer({ issuer: 'i', audience: 'a' })
    const other = await devIssuer({ issuer: 'i', audience: 'a' })
    const t = await other.sign({ sub: 'x', name: 'X' })
    await expect(dev.verify(t)).rejects.toThrow('The token is not valid.')
    await expect(dev.verify(await dev.sign({ sub: 'x', name: 'X' }))).resolves.toEqual({ sub: 'x', name: 'X' })
  })
})

describe('HTTP API', () => {
  it('needs a token for everything but /health', async () => {
    const { app } = await setup()
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200)
    expect((await app.inject({ url: '/files' })).statusCode).toBe(401)
    expect((await app.inject({ url: '/files', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401)
  })

  it('creates, shares, uploads and downloads a file by role', async () => {
    const { app, felix, jae, auth } = await setup()
    const created = await app.inject({ method: 'POST', url: '/files', headers: auth(felix), payload: { name: 'NDA.docx' } })
    expect(created.statusCode).toBe(201)
    const id = created.json().id as string

    // Jae is not a member: the file does not exist for Jae
    expect((await app.inject({ url: `/files/${id}`, headers: auth(jae) })).statusCode).toBe(404)

    const put = await app.inject({
      method: 'PUT',
      url: `/files/${id}/content`,
      headers: { ...auth(felix), 'content-type': 'application/octet-stream' },
      payload: Buffer.from('docx bytes v1'),
    })
    expect(put.statusCode).toBe(201)
    expect(put.json().version).toBe(1)
    // the same bytes again are the same version
    const again = await app.inject({
      method: 'PUT',
      url: `/files/${id}/content`,
      headers: { ...auth(felix), 'content-type': 'application/octet-stream' },
      payload: Buffer.from('docx bytes v1'),
    })
    expect(again.json().version).toBe(1)

    const share = await app.inject({
      method: 'PUT',
      url: `/files/${id}/members/jae`,
      headers: auth(felix),
      payload: { role: 'comment', name: 'Jae Gardner' },
    })
    expect(share.statusCode).toBe(200)
    expect(share.json().members.map((m: { sub: string; role: string }) => `${m.sub}:${m.role}`).sort()).toEqual(['felix:owner', 'jae:comment'])

    const got = await app.inject({ url: `/files/${id}/content`, headers: auth(jae) })
    expect(got.statusCode).toBe(200)
    expect(got.body).toBe('docx bytes v1')
    expect(got.headers['x-file-version']).toBe('1')

    // a commenter may not write, share or delete
    const write = await app.inject({
      method: 'PUT',
      url: `/files/${id}/content`,
      headers: { ...auth(jae), 'content-type': 'application/octet-stream' },
      payload: Buffer.from('mine now'),
    })
    expect(write.statusCode).toBe(403)
    expect((await app.inject({ method: 'PUT', url: `/files/${id}/members/mallory`, headers: auth(jae), payload: { role: 'edit' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'DELETE', url: `/files/${id}`, headers: auth(jae) })).statusCode).toBe(403)

    // the owner cannot be demoted or removed through sharing
    expect((await app.inject({ method: 'PUT', url: `/files/${id}/members/felix`, headers: auth(felix), payload: { role: 'view' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'DELETE', url: `/files/${id}/members/felix`, headers: auth(felix) })).statusCode).toBe(403)

    const list = await app.inject({ url: '/files', headers: auth(jae) })
    expect(list.json().files.map((f: { name: string; role: string }) => `${f.name}:${f.role}`)).toEqual(['NDA.docx:comment'])
  })

  it('treats a malformed id as no such file', async () => {
    const { app, felix, auth } = await setup()
    expect((await app.inject({ url: '/files/../../etc', headers: auth(felix) })).statusCode).toBe(404)
  })
})

describe('live documents', () => {
  it('lets members in, read-only below edit, and nobody else', async () => {
    const { dev, repo } = await setup()
    const f = await repo.createFile('NDA.docx', { sub: 'felix', name: 'Felix Kim' })
    await repo.setMember({ fileId: f.id, sub: 'jae', name: 'Jae', role: 'view' })
    const cfg = () => ({ readOnly: false, isAuthenticated: false })
    const owner = cfg()
    const ctx = await authenticate({ repo, verifier: dev }, { documentName: f.id, token: await dev.sign({ sub: 'felix', name: 'Felix Kim' }), connectionConfig: owner as never })
    expect(ctx).toMatchObject({ identity: { sub: 'felix' }, readOnly: false })
    expect(owner.readOnly).toBe(false)
    const viewer = cfg()
    await authenticate({ repo, verifier: dev }, { documentName: f.id, token: await dev.sign({ sub: 'jae', name: 'Jae' }), connectionConfig: viewer as never })
    expect(viewer.readOnly).toBe(true)
    await expect(
      authenticate({ repo, verifier: dev }, { documentName: f.id, token: await dev.sign({ sub: 'mallory', name: 'M' }), connectionConfig: cfg() as never }),
    ).rejects.toThrow('No such file.')
    await expect(authenticate({ repo, verifier: dev }, { documentName: 'not-a-file', token: '', connectionConfig: cfg() as never })).rejects.toThrow()
  })
})
