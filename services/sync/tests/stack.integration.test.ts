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
})
