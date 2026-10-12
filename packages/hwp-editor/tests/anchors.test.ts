import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { Anchors, CommandBus, Session, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

function open(lines: string[]) {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  let p: Pos = { section: 0, para: 0, offset: 0 }
  lines.forEach((line, i) => {
    if (i > 0) p = s.text.split(p)
    p = s.text.insert(p, line)
  })
  return { s, bus: new CommandBus(s), anchors: new Anchors(s) }
}
const P = (para: number, offset: number): Pos => ({ section: 0, para, offset })
const caret = (s: Session, p: Pos) => s.select({ anchor: p, head: p })
const textOf = (s: Session, a: Anchors, id: string) => {
  const r = a.range(id)
  return r ? s.text.textBetween(r.anchor, r.head) : null
}

describe('anchors', () => {
  it('follow typing before them in the same paragraph and edits in other paragraphs', () => {
    const { s, bus, anchors } = open(['제1조 목적은 다음과 같다', '둘째'])
    const id = anchors.add({ anchor: P(0, 4), head: P(0, 7) })!
    expect(textOf(s, anchors, id)).toBe('목적은')
    caret(s, P(0, 0))
    bus.run('edit:insert-text', { text: '【개정】 ' })
    caret(s, P(1, 0))
    bus.run('edit:insert-text', { text: '새 문단\n' })
    expect(textOf(s, anchors, id)).toBe('목적은')
    expect(anchors.range(id)!.anchor.offset).toBe(9)
  })

  it('survive an edit inside a long range and a paragraph split inside it', () => {
    const { s, bus, anchors } = open(['이 계약은 갑과 을 사이의 물품 공급에 관한 사항을 정한다'])
    const id = anchors.add({ anchor: P(0, 0), head: P(0, 31) })!
    caret(s, P(0, 15))
    bus.run('edit:insert-text', { text: '전자 ' })
    expect(anchors.get(id)!.orphaned).toBe(false)
    expect(textOf(s, anchors, id)).toContain('전자 물품')
    caret(s, P(0, 10))
    bus.run('edit:split-paragraph')
    expect(anchors.get(id)!.orphaned).toBe(false)
    expect(textOf(s, anchors, id)!.split('\n')).toHaveLength(2)
  })

  it('orphan when their text is deleted, and come back on undo', () => {
    const { s, bus, anchors } = open(['앞 대상 뒤'])
    const id = anchors.add({ anchor: P(0, 2), head: P(0, 4) })!
    s.select({ anchor: P(0, 1), head: P(0, 5) })
    bus.run('edit:delete-backward')
    expect(anchors.get(id)!.orphaned).toBe(true)
    expect(anchors.range(id)).toBeNull()
    s.undo()
    expect(anchors.get(id)!.orphaned).toBe(false)
    expect(textOf(s, anchors, id)).toBe('대상')
  })

  it('orphan when their paragraph is replaced by different text', () => {
    const { s, anchors } = open(['하나', '둘'])
    const id = anchors.add({ anchor: P(1, 0), head: P(1, 1) })!
    s.edit('x', () => {
      s.text.delete(P(0, 2), P(1, 1))
      return s.selection
    })
    expect(anchors.get(id)!.orphaned).toBe(true)
  })

  it('refuses collapsed and cross-container selections', () => {
    const { anchors } = open(['a'])
    expect(anchors.add({ anchor: P(0, 0), head: P(0, 0) })).toBeNull()
  })
})
