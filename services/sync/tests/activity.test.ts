import { describe, expect, it } from 'vitest'
import { devIssuer } from '../src/auth.ts'
import { MemoryBlobs } from '../src/blobs.ts'
import { buildApp } from '../src/http.ts'
import { MemoryRepo, type Repo } from '../src/repo.ts'

async function setup(repo: Repo = new MemoryRepo()) {
  const dev = await devIssuer({ issuer: 'http://test/dev', audience: 'redrob-office-sync' })
  const log: string[] = []
  const app = buildApp({ repo, blobs: new MemoryBlobs(), verifier: dev, devIssuer: dev, maxFileBytes: 1024 * 1024, log: (m) => log.push(m) })
  const tokens = {
    felix: await dev.sign({ sub: 'felix', name: 'Felix Kim' }),
    jae: await dev.sign({ sub: 'jae', name: 'Jae Gardner' }),
    min: await dev.sign({ sub: 'min', name: 'Min Park' }),
    mina: await dev.sign({ sub: 'mina', name: 'Mina', email: 'mina@example.com' }),
  }
  const h = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })
  const { id } = (await app.inject({ method: 'POST', url: '/files', headers: h('felix'), payload: { name: 'Plan.docx' } })).json() as { id: string }
  const member = (sub: string, role: string) =>
    app.inject({ method: 'PUT', url: `/files/${id}/members/${sub}`, headers: h('felix'), payload: { role, name: sub === 'jae' ? 'Jae Gardner' : 'Min Park' } })
  const put = (who: keyof typeof tokens, body: string) =>
    app.inject({ method: 'PUT', url: `/files/${id}/content`, headers: { ...h(who), 'content-type': 'application/octet-stream' }, payload: Buffer.from(body) })
  const feed = async (who: keyof typeof tokens, query = '') => {
    const r = await app.inject({ url: `/activity${query}`, headers: h(who) })
    return r.json() as {
      events: Array<{ id: number; kind: string; actorName: string; fileName: string; detail: Record<string, unknown>; you: boolean }>
      more: boolean
    }
  }
  return { app, id, h, member, put, feed, log }
}

describe('activity', () => {
  it('tells the others what someone did, newest first, and never their own doing', async () => {
    const { member, put, feed } = await setup()
    await member('jae', 'edit')
    await put('jae', 'v1')
    const a = await feed('felix')
    expect(a.events.map((e) => [e.kind, e.actorName, e.fileName])).toEqual([['version', 'Jae Gardner', 'Plan.docx']])
    expect(a.events[0]!.detail).toEqual({ version: 1 })
    // Jae sees being given the file, not their own save
    expect((await feed('jae')).events.map((e) => e.kind)).toEqual(['shared'])
  })

  it('records role changes, rename, transfer, leave and removal for those concerned', async () => {
    const { app, id, h, member, feed } = await setup()
    await member('jae', 'view')
    await member('min', 'view')
    await member('jae', 'edit')
    await app.inject({ method: 'PATCH', url: `/files/${id}`, headers: h('jae'), payload: { name: 'Plan v2.docx' } })
    await app.inject({ method: 'POST', url: `/files/${id}/transfer`, headers: h('felix'), payload: { sub: 'jae' } })
    await app.inject({ method: 'DELETE', url: `/files/${id}/members/min`, headers: h('jae') })
    const min = await feed('min')
    // Min sees what happened while she had the file, up to and including being
    // removed; not Jae being added, which was before her time
    expect(min.events.map((e) => e.kind)).toEqual(['removed', 'transferred', 'renamed', 'role', 'shared'])
    expect(min.events[0]!.detail).toEqual({ sub: 'min', name: 'Min Park' })
    expect(min.events.map((e) => e.you)).toEqual([true, false, false, false, true])
    expect(min.events[2]!.detail).toEqual({ from: 'Plan.docx' })
    expect(min.events[2]!.fileName).toBe('Plan v2.docx')
    await app.inject({ method: 'DELETE', url: `/files/${id}/members/me`, headers: h('felix') })
    expect((await feed('jae')).events[0]!.kind).toBe('left')
    expect((await feed('min')).events[0]!.kind).toBe('removed')
  })

  it('stopping sharing reaches everyone who had the file, after it is gone', async () => {
    const { app, id, h, member, feed } = await setup()
    await member('jae', 'comment')
    await app.inject({ method: 'DELETE', url: `/files/${id}`, headers: h('felix') })
    const jae = await feed('jae')
    expect(jae.events[0]).toMatchObject({ kind: 'unshared', actorName: 'Felix Kim', fileName: 'Plan.docx' })
  })

  it('an invite taken up tells the others who joined', async () => {
    const { app, id, h, feed } = await setup()
    await app.inject({ method: 'PUT', url: `/files/${id}/invites/mina@example.com`, headers: h('felix'), payload: { role: 'view' } })
    await feed('mina')
    expect((await feed('felix')).events[0]).toMatchObject({ kind: 'joined', actorName: 'Mina', detail: { role: 'view' } })
  })

  it('polls with after, pages with before and limit, and refuses a bad cursor', async () => {
    const { member, put, feed, app, h } = await setup()
    await member('jae', 'edit')
    for (const b of ['1', '2', '3', '4']) await put('jae', b)
    const first = await feed('felix', '?limit=2')
    expect(first.events.map((e) => e.detail.version)).toEqual([4, 3])
    expect(first.more).toBe(true)
    const back = await feed('felix', `?before=${first.events[1]!.id}&limit=10`)
    expect(back.events.map((e) => e.detail.version)).toEqual([2, 1])
    expect(back.more).toBe(false)
    expect((await feed('felix', `?after=${first.events[0]!.id}`)).events).toEqual([])
    await put('jae', '5')
    expect((await feed('felix', `?after=${first.events[0]!.id}`)).events.map((e) => e.detail.version)).toEqual([5])
    expect((await app.inject({ url: '/activity?after=x', headers: h('felix') })).statusCode).toBe(400)
  })

  it('a failure to record activity never fails the change', async () => {
    const repo = new MemoryRepo()
    repo.addEvent = async () => {
      throw new Error('disk full')
    }
    const { member, put, log } = await setup(repo)
    expect((await member('jae', 'edit')).statusCode).toBe(200)
    expect((await put('jae', 'x')).statusCode).toBe(201)
    expect(log.some((m) => m.includes('disk full'))).toBe(true)
  })
})
