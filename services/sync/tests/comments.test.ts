import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { devIssuer } from '../src/auth.ts'
import { MemoryBlobs } from '../src/blobs.ts'
import { COMMENTS_MAP, repoDocs, type SharedComment } from '../src/comments.ts'
import { buildApp } from '../src/http.ts'
import { MemoryRepo } from '../src/repo.ts'

/** a real relative position into a shared text, as a view would send it */
function anchorInto(doc: Y.Doc) {
  const text = doc.getXmlFragment('prosemirror')
  const p = new Y.XmlElement('docParagraph')
  p.insert(0, [new Y.XmlText('The term is three years.')])
  text.insert(0, [p])
  const at = (i: number) => Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(p.get(0) as Y.XmlText, i))
  return { anchor: at(12), head: at(23) }
}

async function setup() {
  const dev = await devIssuer({ issuer: 'http://test/dev', audience: 'redrob-office-sync' })
  const repo = new MemoryRepo()
  const app = buildApp({ repo, blobs: new MemoryBlobs(), verifier: dev, maxFileBytes: 1024 * 1024, liveDocs: repoDocs(repo) })
  const auth = async (sub: string, name: string) => ({ authorization: `Bearer ${await dev.sign({ sub, name })}` })
  const owner = await auth('felix', 'Felix Kim')
  const file = await repo.createFile('NDA.docx', { sub: 'felix', name: 'Felix Kim' })
  const seed = new Y.Doc()
  const anchor = anchorInto(seed)
  await repo.storeDoc(file.id, Y.encodeStateAsUpdate(seed))
  await repo.setMember({ fileId: file.id, sub: 'jae', name: 'Jae', role: 'comment' })
  await repo.setMember({ fileId: file.id, sub: 'lee', name: 'Lee', role: 'view' })
  return { app, repo, file, owner, anchor, jae: await auth('jae', 'Jae Gardner'), lee: await auth('lee', 'Lee'), mallory: await auth('mallory', 'M') }
}

const stored = async (repo: MemoryRepo, id: string) => {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, (await repo.loadDoc(id))!)
  return doc.getMap<SharedComment>(COMMENTS_MAP)
}

describe('comments API', () => {
  it('a commenter adds a thread with an anchor; the service stamps who wrote it', async () => {
    const { app, repo, file, jae, anchor } = await setup()
    const r = await app.inject({ method: 'POST', url: `/files/${file.id}/comments`, headers: jae, payload: { text: ' Is three right? ', anchor, author: 'Felix Kim' } })
    expect(r.statusCode).toBe(201)
    const c = r.json().comment as SharedComment
    expect(c).toMatchObject({ author: 'Jae Gardner', authorSub: 'jae', text: 'Is three right?', anchor })
    expect(c.id).toMatch(/^\d{9}$/)
    // it is in the live document, where every view sees it
    expect((await stored(repo, file.id)).get(c.id)).toMatchObject({ text: 'Is three right?' })
    const list = await app.inject({ url: `/files/${file.id}/comments`, headers: jae })
    expect(list.json().comments.map((x: SharedComment) => x.id)).toEqual([c.id])
  })

  it('replies need a thread that exists, threads need an anchor, and text is required', async () => {
    const { app, file, jae, anchor } = await setup()
    const post = (payload: object) => app.inject({ method: 'POST', url: `/files/${file.id}/comments`, headers: jae, payload })
    expect((await post({ text: 'x' })).statusCode).toBe(400)
    expect((await post({ text: 'x', anchor: { anchor: 'nope', head: 1 } })).statusCode).toBe(400)
    expect((await post({ text: '   ', anchor })).statusCode).toBe(400)
    expect((await post({ text: 'x', parentId: '123456789' })).statusCode).toBe(404)
    const thread = (await post({ text: 'Thread', anchor })).json().comment as SharedComment
    const reply = (await post({ text: 'Reply', parentId: thread.id })).json().comment as SharedComment
    expect(reply).toMatchObject({ parentId: thread.id })
    expect(reply.anchor).toBeUndefined()
    // no reply to a reply
    expect((await post({ text: 'x', parentId: reply.id })).statusCode).toBe(404)
  })

  it('resolve applies to the whole thread; only the author changes the words', async () => {
    const { app, repo, file, jae, owner, anchor } = await setup()
    const post = (h: object, payload: object) => app.inject({ method: 'POST', url: `/files/${file.id}/comments`, headers: h as never, payload })
    const thread = (await post(jae, { text: 'Thread', anchor })).json().comment as SharedComment
    const reply = (await post(owner, { text: 'Reply', parentId: thread.id })).json().comment as SharedComment
    const patch = (h: object, id: string, payload: object) => app.inject({ method: 'PATCH', url: `/files/${file.id}/comments/${id}`, headers: h as never, payload })
    expect((await patch(jae, reply.id, { done: true })).statusCode).toBe(200)
    const map = await stored(repo, file.id)
    expect(map.get(thread.id)?.done).toBe(true)
    expect(map.get(reply.id)?.done).toBe(true)
    expect((await patch(jae, thread.id, { done: false })).statusCode).toBe(200)
    expect((await stored(repo, file.id)).get(reply.id)?.done).toBeUndefined()
    expect((await patch(jae, reply.id, { text: 'Mine now' })).statusCode).toBe(403)
    expect((await patch(jae, thread.id, { text: 'Better words' })).json().comment.text).toBe('Better words')
    expect((await patch(jae, '999999999', { done: true })).statusCode).toBe(404)
  })

  it('a viewer reads comments but cannot write them, and a non-member learns nothing', async () => {
    const { app, file, lee, mallory, anchor } = await setup()
    expect((await app.inject({ url: `/files/${file.id}/comments`, headers: lee })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: `/files/${file.id}/comments`, headers: lee, payload: { text: 'x', anchor } })).statusCode).toBe(403)
    expect((await app.inject({ url: `/files/${file.id}/comments`, headers: mallory })).statusCode).toBe(404)
  })

  it('says so when the service has no live documents', async () => {
    const dev = await devIssuer({ issuer: 'i', audience: 'a' })
    const repo = new MemoryRepo()
    const f = await repo.createFile('A.docx', { sub: 'a', name: 'A' })
    const app = buildApp({ repo, blobs: new MemoryBlobs(), verifier: dev, maxFileBytes: 1024 })
    const r = await app.inject({ url: `/files/${f.id}/comments`, headers: { authorization: `Bearer ${await dev.sign({ sub: 'a', name: 'A' })}` } })
    expect(r.statusCode).toBe(503)
  })
})
