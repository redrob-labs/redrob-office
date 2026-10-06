/**
 * Against the running Docker Compose stack (docker compose up): Postgres,
 * the S3 store and the service with the development issuer. SYNC_URL defaults to
 * http://127.0.0.1:8787.
 */
import { describe, expect, it } from 'vitest'

const BASE = process.env.SYNC_URL ?? 'http://127.0.0.1:8787'

async function token(sub: string, name: string): Promise<string> {
  const r = await fetch(`${BASE}/dev/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sub, name }),
  })
  expect(r.status).toBe(200)
  return ((await r.json()) as { token: string }).token
}

describe('the sync stack', () => {
  it('is healthy', async () => {
    expect((await fetch(`${BASE}/health`)).status).toBe(200)
  })

  it('stores a file in Postgres and S3 and serves it to a member only', async () => {
    const felix = await token('felix', 'Felix Kim')
    const jae = await token('jae', 'Jae Gardner')
    const h = (t: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${t}`, ...extra })

    const created = await fetch(`${BASE}/files`, {
      method: 'POST',
      headers: h(felix, { 'content-type': 'application/json' }),
      body: JSON.stringify({ name: 'NDA.docx' }),
    })
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }

    const put = await fetch(`${BASE}/files/${id}/content`, {
      method: 'PUT',
      headers: h(felix, { 'content-type': 'application/octet-stream' }),
      body: new TextEncoder().encode('docx bytes'),
    })
    expect(put.status).toBe(201)

    expect((await fetch(`${BASE}/files/${id}/content`, { headers: h(jae) })).status).toBe(404)
    const share = await fetch(`${BASE}/files/${id}/members/jae`, {
      method: 'PUT',
      headers: h(felix, { 'content-type': 'application/json' }),
      body: JSON.stringify({ role: 'view', name: 'Jae Gardner' }),
    })
    expect(share.status).toBe(200)
    const got = await fetch(`${BASE}/files/${id}/content`, { headers: h(jae) })
    expect(got.status).toBe(200)
    expect(await got.text()).toBe('docx bytes')
  })

  it('serves an earlier version, renames, transfers ownership in Postgres, and lets a member leave', async () => {
    const felix = await token('felix', 'Felix Kim')
    const jae = await token('jae', 'Jae Gardner')
    const min = await token('min', 'Min Park')
    const h = (t: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${t}`, ...extra })
    const json = (t: string) => h(t, { 'content-type': 'application/json' })
    const { id } = (await (await fetch(`${BASE}/files`, { method: 'POST', headers: json(felix), body: JSON.stringify({ name: 'Plan.docx' }) })).json()) as { id: string }
    for (const body of ['one', 'two']) {
      await fetch(`${BASE}/files/${id}/content`, { method: 'PUT', headers: h(felix, { 'content-type': 'application/octet-stream' }), body: new TextEncoder().encode(body) })
    }
    await fetch(`${BASE}/files/${id}/members/jae`, { method: 'PUT', headers: json(felix), body: JSON.stringify({ role: 'edit', name: 'Jae Gardner' }) })
    await fetch(`${BASE}/files/${id}/members/min`, { method: 'PUT', headers: json(felix), body: JSON.stringify({ role: 'view', name: 'Min Park' }) })

    const v1 = await fetch(`${BASE}/files/${id}/versions/1/content`, { headers: h(min) })
    expect(v1.status).toBe(200)
    expect(await v1.text()).toBe('one')

    expect((await fetch(`${BASE}/files/${id}`, { method: 'PATCH', headers: json(jae), body: JSON.stringify({ name: 'Plan v2.docx' }) })).status).toBe(200)
    const detail = (await (await fetch(`${BASE}/files/${id}`, { headers: h(min) })).json()) as { name: string }
    expect(detail.name).toBe('Plan v2.docx')

    expect((await fetch(`${BASE}/files/${id}/transfer`, { method: 'POST', headers: json(felix), body: JSON.stringify({ sub: 'min' }) })).status).toBe(409)
    const moved = await fetch(`${BASE}/files/${id}/transfer`, { method: 'POST', headers: json(felix), body: JSON.stringify({ sub: 'jae' }) })
    expect(moved.status).toBe(200)
    const roles = Object.fromEntries(((await moved.json()) as { members: Array<{ sub: string; role: string }> }).members.map((m) => [m.sub, m.role]))
    expect(roles).toEqual({ felix: 'edit', jae: 'owner', min: 'view' })
    expect(((await (await fetch(`${BASE}/files/${id}`, { headers: h(jae) })).json()) as { ownerSub: string }).ownerSub).toBe('jae')

    expect((await fetch(`${BASE}/files/${id}/members/me`, { method: 'DELETE', headers: h(jae) })).status).toBe(409)
    expect((await fetch(`${BASE}/files/${id}/members/me`, { method: 'DELETE', headers: h(min) })).status).toBe(204)
    expect((await fetch(`${BASE}/files/${id}`, { headers: h(min) })).status).toBe(404)

    // Postgres keeps what happened while each person had the file: Min, now
    // off it, still sees it, newest first (the saves came before she joined)
    const feed = (await (await fetch(`${BASE}/activity?limit=2`, { headers: h(min) })).json()) as {
      events: Array<{ kind: string; actorName: string; you: boolean }>
      more: boolean
    }
    expect(feed.events.map((e) => e.kind)).toEqual(['transferred', 'renamed'])
    expect(feed.more).toBe(true)
    const older = (await (await fetch(`${BASE}/activity?limit=10&before=999999999`, { headers: h(min) })).json()) as {
      events: Array<{ kind: string; you: boolean }>
    }
    expect(older.events.at(-1)).toEqual(expect.objectContaining({ kind: 'shared', you: true }))
    const jaeFeed = (await (await fetch(`${BASE}/activity?limit=1`, { headers: h(jae) })).json()) as { events: Array<{ kind: string; actorName: string }> }
    expect(jaeFeed.events[0]).toMatchObject({ kind: 'left', actorName: 'Min Park' })
  })

  it('invite links join, keep an existing role, and stop when revoked (Postgres)', async () => {
    const felix = await token('felix', 'Felix Kim')
    const kai = await token(`kai-${Date.now()}`, 'Kai Lee')
    const h = (t: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${t}`, ...extra })
    const json = (t: string) => h(t, { 'content-type': 'application/json' })
    const { id } = (await (await fetch(`${BASE}/files`, { method: 'POST', headers: json(felix), body: JSON.stringify({ name: 'Links.docx' }) })).json()) as { id: string }
    const made = await fetch(`${BASE}/files/${id}/links`, { method: 'POST', headers: json(felix), body: JSON.stringify({ role: 'comment', days: 2 }) })
    expect(made.status).toBe(201)
    const { token: link, link: row } = (await made.json()) as { token: string; link: { id: string } }
    const peek = (await (await fetch(`${BASE}/links/${link}`, { headers: h(kai) })).json()) as { ownerName: string; alreadyHave: string | null }
    expect(peek).toMatchObject({ ownerName: 'Felix Kim', alreadyHave: null })
    const joined = await fetch(`${BASE}/links/${link}/redeem`, { method: 'POST', headers: h(kai) })
    expect(await joined.json()).toMatchObject({ role: 'comment', joined: true })
    const again = await fetch(`${BASE}/links/${link}/redeem`, { method: 'POST', headers: h(felix) })
    expect(await again.json()).toMatchObject({ role: 'owner', joined: false })
    const listed = (await (await fetch(`${BASE}/files/${id}/links`, { headers: h(felix) })).json()) as { links: Array<{ uses: number }> }
    expect(listed.links[0]!.uses).toBe(2)
    expect((await fetch(`${BASE}/files/${id}/links/${row.id}`, { method: 'DELETE', headers: h(felix) })).status).toBe(204)
    expect((await fetch(`${BASE}/links/${link}/redeem`, { method: 'POST', headers: h(kai) })).status).toBe(404)
  })
})
