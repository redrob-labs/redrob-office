import { describe, expect, it } from 'vitest'
import { devIssuer } from '../src/auth.ts'
import { MemoryBlobs } from '../src/blobs.ts'
import { LINK_MAX_DAYS, buildApp } from '../src/http.ts'
import { MemoryRepo } from '../src/repo.ts'

async function setup() {
  const dev = await devIssuer({ issuer: 'http://test/dev', audience: 'redrob-office-sync' })
  const repo = new MemoryRepo()
  let now = new Date('2026-10-07T00:00:00.000Z')
  const app = buildApp({ repo, blobs: new MemoryBlobs(), verifier: dev, devIssuer: dev, maxFileBytes: 1024 * 1024, now: () => now })
  const tokens = {
    felix: await dev.sign({ sub: 'felix', name: 'Felix Kim' }),
    jae: await dev.sign({ sub: 'jae', name: 'Jae Gardner' }),
    min: await dev.sign({ sub: 'min', name: 'Min Park' }),
  }
  const h = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })
  const { id } = (await app.inject({ method: 'POST', url: '/files', headers: h('felix'), payload: { name: 'Plan.docx' } })).json() as { id: string }
  const make = (payload: Record<string, unknown>, who: keyof typeof tokens = 'felix') =>
    app.inject({ method: 'POST', url: `/files/${id}/links`, headers: h(who), payload })
  const redeem = (token: string, who: keyof typeof tokens) => app.inject({ method: 'POST', url: `/links/${token}/redeem`, headers: h(who) })
  return { app, repo, id, h, make, redeem, later: (days: number) => (now = new Date(now.getTime() + days * 86_400_000)) }
}

describe('invite links', () => {
  it('a signed-in person joins with the link’s role; the token is shown once and only its hash is kept', async () => {
    const { app, repo, id, h, make, redeem } = await setup()
    const made = await make({ role: 'comment', days: 3 })
    expect(made.statusCode).toBe(201)
    const { token, link } = made.json() as { token: string; link: { id: string; expiresAt: string; role: string } }
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(link.expiresAt).toBe('2026-10-10T00:00:00.000Z')
    const listed = (await app.inject({ url: `/files/${id}/links`, headers: h('felix') })).json().links as Array<Record<string, unknown>>
    expect(listed).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain(token)
    const r = await redeem(token, 'jae')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ file: { id, name: 'Plan.docx' }, role: 'comment', joined: true })
    expect(await repo.roleOf(id, 'jae')).toBe('comment')
    // a second person may use it too, and it counts
    await redeem(token, 'min')
    expect(((await app.inject({ url: `/files/${id}/links`, headers: h('felix') })).json().links[0] as { uses: number }).uses).toBe(2)
  })

  it('says what a link would do without using it', async () => {
    const { app, repo, id, h, make } = await setup()
    const { token } = (await make({ role: 'edit', days: 2 })).json() as { token: string }
    const peek = await app.inject({ url: `/links/${token}`, headers: h('jae') })
    expect(peek.json()).toEqual({ fileName: 'Plan.docx', ownerName: 'Felix Kim', role: 'edit', expiresAt: '2026-10-09T00:00:00.000Z', alreadyHave: null })
    expect(await repo.roleOf(id, 'jae')).toBeNull()
    expect(((await app.inject({ url: `/files/${id}/links`, headers: h('felix') })).json().links[0] as { uses: number }).uses).toBe(0)
    expect((await app.inject({ url: `/links/${token}`, headers: h('felix') })).json().alreadyHave).toBe('owner')
    expect((await app.inject({ url: `/links/${'y'.repeat(43)}`, headers: h('jae') })).statusCode).toBe(404)
  })

  it('never changes the role of someone who already has the file', async () => {
    const { repo, id, make, redeem } = await setup()
    const { token } = (await make({ role: 'view' })).json() as { token: string }
    const r = await redeem(token, 'felix')
    expect(r.json()).toMatchObject({ role: 'owner', joined: false })
    expect(await repo.roleOf(id, 'felix')).toBe('owner')
  })

  it('stops working when it expires or is revoked, and says the same either way', async () => {
    const { app, id, h, make, redeem, later } = await setup()
    const a = (await make({ role: 'edit', days: 1 })).json() as { token: string }
    const b = (await make({ role: 'view' })).json() as { token: string; link: { id: string } }
    later(1)
    expect((await redeem(a.token, 'jae')).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/files/${id}/links/${b.link.id}`, headers: h('felix') })).statusCode).toBe(204)
    const revoked = await redeem(b.token, 'jae')
    expect(revoked.statusCode).toBe(404)
    expect(revoked.json().error).toMatch(/does not work any more/)
    // a revoked link leaves the list; a second revoke finds nothing
    expect((await app.inject({ url: `/files/${id}/links`, headers: h('felix') })).json().links).toHaveLength(1)
    expect((await app.inject({ method: 'DELETE', url: `/files/${id}/links/${b.link.id}`, headers: h('felix') })).statusCode).toBe(404)
    expect((await redeem('x'.repeat(43), 'jae')).statusCode).toBe(404)
    expect((await redeem('short', 'jae')).statusCode).toBe(404)
  })

  it('only the owner makes or sees links, never above edit and never past the cap', async () => {
    const { app, id, h, make, redeem } = await setup()
    expect((await make({ role: 'owner' })).statusCode).toBe(400)
    expect((await make({ role: 'edit', days: LINK_MAX_DAYS + 1 })).statusCode).toBe(400)
    expect((await make({ role: 'edit', days: 0 })).statusCode).toBe(400)
    expect((await make({ role: 'edit', days: 1.5 })).statusCode).toBe(400)
    const { token } = (await make({ role: 'edit' })).json() as { token: string }
    await redeem(token, 'jae')
    expect((await make({ role: 'view' }, 'jae')).statusCode).toBe(403)
    expect((await app.inject({ url: `/files/${id}/links`, headers: h('jae') })).statusCode).toBe(403)
    expect((await app.inject({ url: `/files/${id}/links`, headers: h('min') })).statusCode).toBe(404)
  })

  it('needs a signed-in person, and stopping sharing ends every link', async () => {
    const { app, id, h, make, redeem } = await setup()
    const { token } = (await make({ role: 'view' })).json() as { token: string }
    expect((await app.inject({ method: 'POST', url: `/links/${token}/redeem` })).statusCode).toBe(401)
    await app.inject({ method: 'DELETE', url: `/files/${id}`, headers: h('felix') })
    expect((await redeem(token, 'jae')).statusCode).toBe(404)
  })

  it('tells the others who joined through a link', async () => {
    const { app, h, make, redeem } = await setup()
    const { token } = (await make({ role: 'view' })).json() as { token: string }
    await redeem(token, 'jae')
    const feed = (await app.inject({ url: '/activity', headers: h('felix') })).json().events as Array<{ kind: string; detail: unknown }>
    expect(feed[0]).toMatchObject({ kind: 'joined', detail: { role: 'view', via: 'link' } })
  })
})
