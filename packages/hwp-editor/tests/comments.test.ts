import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Comments, Session, mentionsIn, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

const P = (para: number, offset: number): Pos => ({ section: 0, para, offset })

function open(lines = ['제1조(목적) 이 법은 국민의 권리를 보장한다.', '제2조(정의) 이 법에서 쓰는 용어의 뜻은 다음과 같다.']) {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  let p = P(0, 0)
  lines.forEach((l, i) => {
    if (i > 0) p = s.text.split(p)
    p = s.text.insert(p, l)
  })
  return { s, c: new Comments(s, () => '2026-10-08T09:00:00Z'), bus: new CommandBus(s) }
}

const reopen = (s: Session, f: 'hwp' | 'hwpx') => new Comments(new Session(HwpCoreDocument.open(s.export(f)), f))

describe('comments over 한글 memos', () => {
  it('adds a thread on the selection, one undo step, marking the document unsaved', () => {
    const { s, c } = open()
    const id = c.add({ anchor: P(0, 10), head: P(0, 12) }, '홍길동', '이 표현 확인 부탁드립니다')
    const [t] = c.threads()
    expect(t).toMatchObject({ id, resolved: false, root: { author: '홍길동', text: '이 표현 확인 부탁드립니다', at: '2026-10-08T09:00:00Z' }, anchor: { text: '법은', start: 10, end: 12 } })
    expect(s.dirty).toBe(true)
    s.undo()
    expect(c.threads()).toEqual([])
    expect(s.dirty).toBe(false)
  })

  it('replies, resolves and reopens, and all of it survives a save in both formats', () => {
    for (const f of ['hwpx', 'hwp'] as const) {
      const { s, c } = open()
      const id = c.add({ anchor: P(1, 0), head: P(1, 7) }, '홍길동', '정의 조항 번호 확인 @김검토', ['김검토'])
      c.reply(id, '김검토', '확인했습니다')
      c.resolve(id, true)
      const back = reopen(s, f)
      const [t] = back.threads()
      expect(t).toMatchObject({ id, resolved: true, root: { text: '정의 조항 번호 확인 @김검토', mentions: ['김검토'] }, replies: [{ author: '김검토', text: '확인했습니다' }] })
      expect(t!.anchor.text).toBe('제2조(정의)')
      // a reply reopens it
      back.reply(id, '홍길동', '하나 더 있습니다')
      expect(back.thread(id)!.resolved).toBe(false)
    }
  })

  it('a memo 한글 wrote, with no Redrob metadata, is a thread of its own', () => {
    const { s, c } = open()
    s.doc.addMemo({ section: 0, para: 0, cellPath: [] }, 0, 3, '한컴 사용자', '원래 메모')
    expect(c.threads()).toMatchObject([{ root: { author: '한컴 사용자', text: '원래 메모' }, replies: [], resolved: false }])
  })

  it('deleting a root deletes its replies; deleting a reply keeps the thread; the text stays', () => {
    const { s, c } = open()
    const id = c.add({ anchor: P(0, 0), head: P(0, 3) }, 'a', '하나')
    const r1 = c.reply(id, 'b', '둘')
    c.reply(id, 'a', '셋')
    c.remove(r1)
    expect(c.thread(id)!.replies.map((r) => r.text)).toEqual(['셋'])
    c.remove(id)
    expect(c.threads()).toEqual([])
    expect(s.doc.memos()).toEqual([])
    expect(s.doc.text(0, 0)).toBe('제1조(목적) 이 법은 국민의 권리를 보장한다.')
    // the metadata part is gone with the last comment
    expect(s.doc.raw.getRedrobComments()).toBe('')
  })

  it('edits a comment and anchors follow typing before them', () => {
    const { s, c, bus } = open()
    const id = c.add({ anchor: P(0, 10), head: P(0, 12) }, 'a', '처음')
    c.edit(id, '고침')
    s.select({ anchor: P(0, 0), head: P(0, 0) })
    bus.run('edit:insert-text', { text: '【개정】 ' })
    const t = c.thread(id)!
    expect(t.root.text).toBe('고침')
    expect(t.anchor.text).toBe('법은')
    const r = c.range(t)
    expect(s.text.textBetween(r.anchor, r.head)).toBe('법은')
  })

  it('a selection across paragraphs anchors on its first paragraph’s part', () => {
    const { c } = open()
    c.add({ anchor: P(0, 17), head: P(1, 3) }, 'a', '두 문단')
    expect(c.threads()[0]!.anchor.text).toBe('권리를 보장한다.')
  })

  it('finds mentions by exact name, longest first', () => {
    expect(mentionsIn('@김검토 님과 @Redrob 확인', ['김검토', 'Redrob', '김'])).toEqual(['김검토', 'Redrob'])
    expect(mentionsIn('mail@Redrob.com', ['Redrob'])).toEqual([])
  })
})
