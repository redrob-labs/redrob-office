import * as Y from 'yjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Comments, LiveBinding, LiveComments, Session, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())
const P = (offset: number): Pos => ({ section: 0, para: 0, offset })

function base(text: string): Uint8Array {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  s.text.insert(P(0), text)
  return s.export('hwpx')
}

/** Two or three views over one room; updates are delivered on flush. */
function room(bytes: Uint8Array, n = 2) {
  const views = Array.from({ length: n }, (_, i) => {
    const s = new Session(HwpCoreDocument.open(bytes), 'hwpx')
    const doc = new Y.Doc()
    doc.clientID = i + 1
    return { s, doc, bus: new CommandBus(s), comments: new Comments(s), outbox: [] as Uint8Array[], live: null as unknown as LiveComments, text: null as unknown as LiveBinding }
  })
  const flush = () => {
    for (let r = 0; r < 4; r++) for (const v of views) for (const u of v.outbox.splice(0)) for (const o of views) if (o !== v) Y.applyUpdate(o.doc, u, 'room')
  }
  for (const v of views) v.doc.on('update', (u: Uint8Array, origin: unknown) => origin !== 'room' && v.outbox.push(u))
  views.forEach((v, i) => {
    v.text = new LiveBinding(v.s, v.doc, v.bus, { seed: i === 0 })
    flush()
  })
  for (const v of views) {
    v.live = new LiveComments(v.comments, v.doc, v.text)
    flush()
  }
  return { views, flush }
}

const sel = (a: number, b: number) => ({ anchor: P(a), head: P(b) })

describe('live comments (task 5.5)', () => {
  it('a comment, its reply, an edit and resolving reach the other view without marking it unsaved', () => {
    const { views: [a, b], flush } = room(base('제1조 목적 이 계약은'))
    const id = a!.comments.add(sel(0, 3), '갑', '조 번호 확인')
    flush()
    const tb = b!.comments.threads()
    expect(tb).toHaveLength(1)
    expect([tb[0]!.root.author, tb[0]!.root.text, tb[0]!.anchor.text]).toEqual(['갑', '조 번호 확인', '제1조'])
    expect(b!.s.dirty).toBe(false)
    b!.comments.reply(tb[0]!.id, '을', '확인했습니다')
    flush()
    expect(a!.comments.thread(id)!.replies.map((r) => r.text)).toEqual(['확인했습니다'])
    a!.comments.edit(id, '조 번호 다시 확인')
    a!.comments.resolve(id, true)
    flush()
    const t2 = b!.comments.threads()[0]!
    expect([t2.root.text, t2.resolved]).toEqual(['조 번호 다시 확인', true])
    expect(b!.s.dirty).toBe(true) // b wrote a reply itself
  })

  it('a comment stays on its words while someone types before them', () => {
    const { views: [a, b], flush } = room(base('가나다 계약 조건'))
    b!.s.select({ anchor: P(0), head: P(0) })
    for (const ch of '추가 ') b!.bus.run('edit:insert-text', { text: ch })
    a!.comments.add(sel(4, 6), '갑', '용어')
    flush()
    expect(b!.comments.threads()[0]!.anchor.text).toBe('계약')
    expect(a!.comments.threads()[0]!.anchor.text).toBe('계약')
  })

  it('deleting a thread deletes it everywhere, and a late view does not bring it back', () => {
    const bytes = base('본문 문장')
    const { views: [a, b, c], flush } = room(bytes, 3)
    const id = a!.comments.add(sel(0, 2), '갑', '메모')
    flush()
    expect(c!.comments.threads()).toHaveLength(1)
    b!.comments.remove(b!.comments.threads()[0]!.id)
    flush()
    expect(a!.comments.threads()).toHaveLength(0)
    expect(c!.comments.threads()).toHaveLength(0)
    void id
    // A view that opened the file before the deletion and joins now.
    const late = new Session(HwpCoreDocument.open(bytes), 'hwpx')
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(a!.doc))
    const lc = new LiveComments(new Comments(late), doc, new LiveBinding(late, doc, null))
    expect(lc.comments.threads()).toHaveLength(0)
  })

  it('a comment from the file everyone opened is the same comment in every view', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    s.text.insert(P(0), '기존 메모가 있는 문서')
    new Comments(s).add(sel(0, 2), '병', '처음부터 있던 메모')
    const { views: [a, b], flush } = room(s.export('hwpx'))
    expect(a!.comments.threads()).toHaveLength(1)
    expect(b!.comments.threads()).toHaveLength(1)
    a!.comments.edit(a!.comments.threads()[0]!.id, '고친 메모')
    flush()
    expect(b!.comments.threads()).toHaveLength(1)
    expect(b!.comments.threads()[0]!.root.text).toBe('고친 메모')
  })
})
