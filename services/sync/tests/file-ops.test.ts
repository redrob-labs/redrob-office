import { describe, expect, it } from 'vitest'
import { devIssuer } from '../src/auth.ts'
import { MemoryBlobs } from '../src/blobs.ts'
import { buildApp } from '../src/http.ts'
import { MemoryRepo } from '../src/repo.ts'

async function setup() {
  const dev = await devIssuer({ issuer: 'http://test/dev', audience: 'redrob-office-sync' })
  const repo = new MemoryRepo()
  const app = buildApp({ repo, blobs: new MemoryBlobs(), verifier: dev, devIssuer: dev, maxFileBytes: 1024 * 1024 })
  const tokens = {
    felix: await dev.sign({ sub: 'felix', name: 'Felix Kim' }),
    jae: await dev.sign({ sub: 'jae', name: 'Jae Gardner' }),
    min: await dev.sign({ sub: 'min', name: 'Min Park' }),
    out: await dev.sign({ sub: 'out', name: 'Outsider' }),
  }
  const h = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })
  const created = await app.inject({ method: 'POST', url: '/files', headers: h('felix'), payload: { name: 'plan.docx' } })
  const id = created.json().id as string
  const put = (who: keyof typeof tokens, body: string) =>
    app.inject({ method: 'PUT', url: `/files/${id}/content`, headers: { ...h(who), 'content-type': 'application/octet-stream' }, payload: Buffer.from(body) })
  await app.inject({ method: 'PUT', url: `/files/${id}/members/jae`, headers: h('felix'), payload: { role: 'edit', name: 'Jae Gardner' } })
  await app.inject({ method: 'PUT', url: `/files/${id}/members/min`, headers: h('felix'), payload: { role: 'view', name: 'Min Park' } })
  return { app, repo, id, h, put }
}

describe('earlier versions', () => {
  it('downloads one version by number, to anyone who may read', async () => {
    const { app, id, h, put } = await setup()
    await put('felix', 'first')
    await put('jae', 'second')
    const v1 = await app.inject({ url: `/files/${id}/versions/1/content`, headers: h('min') })
    expect(v1.statusCode).toBe(200)
    expect(v1.body).toBe('first')
    expect(v1.headers['x-file-version']).toBe('1')
    const v2 = await app.inject({ url: `/files/${id}/versions/2/content`, headers: h('felix') })
    expect(v2.body).toBe('second')
  })

  it('answers 404 to a missing version, a bad number and a non-member', async () => {
    const { app, id, h, put } = await setup()
    await put('felix', 'first')
    for (const v of ['9', '0', '-1', 'abc', '1.5', '99999999999']) {
      expect((await app.inject({ url: `/files/${id}/versions/${v}/content`, headers: h('felix') })).statusCode).toBe(404)
    }
    expect((await app.inject({ url: `/files/${id}/versions/1/content`, headers: h('out') })).statusCode).toBe(404)
  })
})

describe('rename', () => {
  it('lets an editor rename for everyone, and not a viewer', async () => {
    const { app, id, h } = await setup()
    const r = await app.inject({ method: 'PATCH', url: `/files/${id}`, headers: h('jae'), payload: { name: '  plan v2.docx ' } })
    expect(r.statusCode).toBe(200)
    expect(r.json().name).toBe('plan v2.docx')
    const listed = (await app.inject({ url: '/files', headers: h('min') })).json().files
    expect(listed[0].name).toBe('plan v2.docx')
    expect((await app.inject({ method: 'PATCH', url: `/files/${id}`, headers: h('min'), payload: { name: 'x.docx' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PATCH', url: `/files/${id}`, headers: h('out'), payload: { name: 'x.docx' } })).statusCode).toBe(404)
  })

  it('refuses an empty name', async () => {
    const { app, id, h } = await setup()
    expect((await app.inject({ method: 'PATCH', url: `/files/${id}`, headers: h('felix'), payload: { name: ' \u0001 ' } })).statusCode).toBe(400)
  })
})

describe('ownership transfer', () => {
  it('makes an editor the owner and the old owner an editor', async () => {
    const { app, repo, id, h } = await setup()
    const r = await app.inject({ method: 'POST', url: `/files/${id}/transfer`, headers: h('felix'), payload: { sub: 'jae' } })
    expect(r.statusCode).toBe(200)
    expect(await repo.roleOf(id, 'jae')).toBe('owner')
    expect(await repo.roleOf(id, 'felix')).toBe('edit')
    expect((await repo.getFile(id))!.ownerSub).toBe('jae')
    // the old owner can no longer share or stop sharing
    expect((await app.inject({ method: 'DELETE', url: `/files/${id}`, headers: h('felix') })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PUT', url: `/files/${id}/members/min`, headers: h('jae'), payload: { role: 'edit' } })).statusCode).toBe(200)
  })

  it('only goes to someone who can already edit, and only from the owner', async () => {
    const { app, repo, id, h } = await setup()
    expect((await app.inject({ method: 'POST', url: `/files/${id}/transfer`, headers: h('felix'), payload: { sub: 'min' } })).statusCode).toBe(409)
    expect((await app.inject({ method: 'POST', url: `/files/${id}/transfer`, headers: h('felix'), payload: { sub: 'nobody' } })).statusCode).toBe(409)
    expect((await app.inject({ method: 'POST', url: `/files/${id}/transfer`, headers: h('felix'), payload: { sub: 'felix' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `/files/${id}/transfer`, headers: h('jae'), payload: { sub: 'jae' } })).statusCode).toBe(403)
    expect(await repo.roleOf(id, 'felix')).toBe('owner')
    expect(await repo.roleOf(id, 'min')).toBe('view')
  })
})

describe('leave', () => {
  it('takes a member off the file; it is then gone for them', async () => {
    const { app, id, h } = await setup()
    expect((await app.inject({ method: 'DELETE', url: `/files/${id}/members/me`, headers: h('min') })).statusCode).toBe(204)
    expect((await app.inject({ url: `/files/${id}`, headers: h('min') })).statusCode).toBe(404)
    const members = (await app.inject({ url: `/files/${id}/members`, headers: h('felix') })).json().members as Array<{ sub: string }>
    expect(members.map((m) => m.sub).sort()).toEqual(['felix', 'jae'])
  })

  it('keeps the owner on the file, and a non-member learns nothing', async () => {
    const { app, id, h } = await setup()
    expect((await app.inject({ method: 'DELETE', url: `/files/${id}/members/me`, headers: h('felix') })).statusCode).toBe(409)
    expect((await app.inject({ method: 'DELETE', url: `/files/${id}/members/me`, headers: h('out') })).statusCode).toBe(404)
  })
})
