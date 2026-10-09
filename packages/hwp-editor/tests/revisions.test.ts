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

describe('recording: edits that cannot be tracked yet', () => {
  it('reports formatting and Enter, not typing, deleting, review or undo, and stops when recording stops', () => {
    const { s, bus, r } = blank('제1조 권리')
    const untracked: string[] = []
    const stop = r.record(bus, '홍길동', (c) => untracked.push(c.command))
    s.select({ anchor: P(0, 4), head: P(0, 4) })
    bus.run('edit:insert-text', { text: '국민의 ' })
    bus.run('edit:delete-backward')
    expect(untracked).toEqual([])
    s.select({ anchor: P(0, 0), head: P(0, 3) })
    bus.run('format:bold')
    s.select({ anchor: P(0, 2), head: P(0, 2) })
    bus.run('edit:split-paragraph')
    expect(untracked).toEqual(['format:bold', 'edit:split-paragraph'])
    s.undo()
    r.acceptAll()
    expect(untracked).toHaveLength(2)
    // The AI's edits count too; a collaborator's do not (theirs are reported in their own editor).
    s.select({ anchor: P(0, 0), head: P(0, 1) })
    bus.run('format:italic', undefined, 'ai')
    bus.run('format:underline', undefined, 'remote')
    expect(untracked).toEqual(['format:bold', 'edit:split-paragraph', 'format:italic'])
    stop()
    bus.run('format:bold')
    expect(untracked).toHaveLength(3)
  })

  it('Bold at a bare caret applies to tracked typing, and the formatting is reported', () => {
    const { s, bus, r } = blank('제1조 권리')
    const untracked: string[] = []
    r.record(bus, '홍길동', (c) => untracked.push(c.command))
    s.select({ anchor: P(0, 6), head: P(0, 6) })
    bus.run('format:bold')
    expect(untracked).toEqual([])
    bus.run('edit:insert-text', { text: '와 의무' })
    expect(s.doc.text(0, 0)).toBe('제1조 권리와 의무')
    expect(r.list()).toMatchObject([{ kind: 'insert', text: '와 의무' }])
    expect(s.text.charPropertiesAt(P(0, 8)).bold).toBe(true)
    expect(s.text.charPropertiesAt(P(0, 4)).bold).not.toBe(true)
    expect(untracked).toEqual(['edit:insert-text'])
    // Plain typing after that is not reported again.
    bus.run('edit:insert-text', { text: '.' })
    expect(untracked).toHaveLength(1)
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

describe('review commands and whole paragraphs', () => {
  it('accepting a deleted whole paragraph removes the paragraph', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    let p = s.text.insert(P(0, 0), '하나')
    p = s.text.split(p)
    s.text.insert(p, '둘')
    const r = new Revisions(s)
    s.edit('x', () => (r.markDeleted(P(1, 0), P(1, 1), 'a'), s.selection))
    r.acceptAll()
    expect(s.doc.paragraphCount(0)).toBe(1)
    expect(s.doc.text(0, 0)).toBe('하나')
  })

  it('commands accept the change under the caret, go next and previous, and toggle recording', async () => {
    const { revisionCommands } = await import('../src')
    const s = fixture()
    const r = new Revisions(s)
    let on = false
    const bus = new CommandBus(s)
    for (const c of revisionCommands(r, { isRecording: () => on, setRecording: (v) => (on = v) })) bus.register(c)
    s.select({ anchor: P(0, 0), head: P(0, 0) })
    bus.run('review:revision-next')
    expect(s.text.textBetween(s.selection.anchor, s.selection.head)).toBe('NEW')
    bus.run('review:revision-next')
    expect(s.text.textBetween(s.selection.anchor, s.selection.head)).toBe('OLD')
    bus.run('review:revision-accept')
    expect(s.doc.text(0, 1)).toBe('NEXT NEW PARAGRAPH')
    bus.run('review:track-changes')
    expect(on).toBe(true)
    expect(bus.isActive('review:track-changes')).toBe(true)
  })
})
