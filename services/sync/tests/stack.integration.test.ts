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
  })
})
