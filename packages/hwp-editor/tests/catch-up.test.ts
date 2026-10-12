import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { catchUpItems } from '@genoffice/versions'
import { Comments, Revisions, Session, catchUpComments, catchUpRevisions, changedParagraphs, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

const P = (para: number, offset: number): Pos => ({ section: 0, para, offset })
function doc(lines: string[]): Session {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  let p = P(0, 0)
  lines.forEach((l, i) => {
    if (i > 0) p = s.text.split(p)
    p = s.text.insert(p, l)
  })
  return s
}

describe('catch-up for Hangul', () => {
  it('finds edited and added paragraphs against the earlier version, ignoring moves', () => {
    const then = doc(['제1조 목적', '제2조 정의', '제3조 적용'])
    const now = doc(['제2조 정의', '제1조 목적', '제3조 적용 범위', '제4조 신설'])
    const changed = changedParagraphs(then.doc, now.doc)
    expect(changed.map((id) => now.doc.readNodes([id])[0]).map((r) => (r && !r.missing ? r.text : ''))).toEqual(['제3조 적용 범위', '제4조 신설'])
  })

  it('reports others’ comments and tracked changes made after the last visit', () => {
    const s = doc(['갑은 을에게 판다.'])
    new Comments(s, () => '2026-10-07T09:00:00Z').add({ anchor: P(0, 0), head: P(0, 1) }, '옛 사람', '예전 메모')
    new Comments(s, () => '2026-10-08T09:00:00Z').add({ anchor: P(0, 3), head: P(0, 4) }, '김검토', '새 메모')
    new Comments(s, () => '2026-10-08T09:30:00Z').add({ anchor: P(0, 5), head: P(0, 8) }, '나', '내 메모')
    s.edit('x', () => (new Revisions(s, () => '2026-10-08T10:00:00Z').markDeleted(P(0, 0), P(0, 1), '김검토'), s.selection))
    const items = catchUpItems({ since: '2026-10-08T00:00:00Z', me: '나', comments: catchUpComments(s), revisions: catchUpRevisions(s), waitingFigures: 0 })
    expect(items).toMatchObject([
      { kind: 'comment', author: '김검토', text: '새 메모' },
      { kind: 'suggestion', author: '김검토', count: 1 },
    ])
  })
})
