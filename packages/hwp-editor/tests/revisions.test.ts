import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Revisions, Session, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

const P = (para: number, offset: number): Pos => ({ section: 0, para, offset })
const fixture = () => new Session(HwpCoreDocument.open(new Uint8Array(readFileSync(join(__dirname, '../../hwp-core/tests/fixtures/tracked-changes.hwpx')))), 'hwpx')

function blank(text: string) {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  s.text.insert(P(0, 0), text)
  return { s, bus: new CommandBus(s), r: new Revisions(s, () => '2026-10-08T10:00:00Z') }
}

describe('review', () => {
  it('accepting keeps an insertion’s text and removes a deletion’s', () => {
    const s = fixture()
    const r = new Revisions(s)
    r.acceptAll()
    expect(s.doc.text(0, 1)).toBe('NEXT NEW PARAGRAPH')
    expect(r.list()).toEqual([])
    s.undo()
    expect(r.list()).toHaveLength(2)
    expect(s.doc.text(0, 1)).toBe('NEXT NEW OLDPARAGRAPH')
  })

  it('rejecting removes an insertion’s text and keeps a deletion’s', () => {
    const s = fixture()
    const r = new Revisions(s)
    r.rejectAll()
    expect(s.doc.text(0, 1)).toBe('NEXT  OLDPARAGRAPH')
  })

  it('accepts or rejects one change; one undo step each; the result saves', () => {
    const s = fixture()
    const r = new Revisions(s)
    const seq = s.changeSeq
    r.reject(2)
    expect(s.changeSeq).toBe(seq + 1)
    expect(r.list().map((x) => x.kind)).toEqual(['insert'])
    r.accept(1)
    const back = HwpCoreDocument.open(s.export('hwpx'))
    expect(back.text(0, 1)).toBe('NEXT NEW OLDPARAGRAPH')
    expect(back.revisions()).toEqual([])
  })

  it('finds the change under the caret', () => {
    const s = fixture()
    s.select({ anchor: P(1, 10), head: P(1, 10) })
    expect(new Revisions(s).at()!.kind).toBe('delete')
  })
})

describe('recording (suggesting)', () => {
  it('records typing as one insertion that grows as you type, and survives a save', () => {
    const { s, bus, r } = blank('제1조 권리')
    const stop = r.record(bus, '홍길동')
    s.select({ anchor: P(0, 4), head: P(0, 4) })
    for (const ch of '국민의 ') bus.run('edit:insert-text', { text: ch })
    expect(s.doc.text(0, 0)).toBe('제1조 국민의 권리')
    expect(r.list()).toMatchObject([{ kind: 'insert', author: '홍길동', text: '국민의 ' }])
    stop()
    expect(HwpCoreDocument.open(s.export('hwpx')).revisions()).toMatchObject([{ kind: 'insert', author: '홍길동', text: '국민의 ' }])
  })

  it('Backspace marks text deleted and merges; inside your own insertion it really deletes', () => {
    const { s, bus, r } = blank('가나다라마')
    r.record(bus, 'a')
    s.select({ anchor: P(0, 5), head: P(0, 5) })
    bus.run('edit:delete-backward')
    bus.run('edit:delete-backward')
    expect(s.doc.text(0, 0)).toBe('가나다라마')
    expect(r.list()).toMatchObject([{ kind: 'delete', text: '라마' }])
    expect(s.selection.head.offset).toBe(3)
    bus.run('edit:insert-text', { text: 'XY' })
    bus.run('edit:delete-backward')
    expect(s.doc.text(0, 0)).toBe('가나다X라마')
    expect(r.list().map((x) => [x.kind, x.text])).toEqual([
      ['insert', 'X'],
      ['delete', '라마'],
    ])
  })

  it('typing over a selection marks it deleted and records the new text', () => {
    const { s, bus, r } = blank('갑은 을에게')
    r.record(bus, 'a')
    s.select({ anchor: P(0, 0), head: P(0, 1) })
    bus.run('edit:insert-text', { text: '매도인' })
    expect(s.doc.text(0, 0)).toBe('갑매도인은 을에게')
    expect(r.list().map((x) => [x.kind, x.text])).toEqual([
      ['delete', '갑'],
      ['insert', '매도인'],
    ])
    // accepting both gives the edited text
    r.acceptAll()
    expect(s.doc.text(0, 0)).toBe('매도인은 을에게')
  })

  it('typing right after someone else’s deletion stays outside it', () => {
    const { s, bus, r } = blank('가나다')
    r.record(bus, 'a')
    s.select({ anchor: P(0, 1), head: P(0, 2) })
    bus.run('edit:delete-forward')
    const stop = r.record(bus, 'b')
    s.select({ anchor: P(0, 2), head: P(0, 2) })
    bus.run('edit:insert-text', { text: 'Z' })
    expect(r.list().map((x) => [x.kind, x.author, x.text])).toEqual([
      ['delete', 'a', '나'],
      ['insert', 'b', 'Z'],
    ])
    stop()
  })
})
