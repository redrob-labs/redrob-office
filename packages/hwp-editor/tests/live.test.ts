import * as Y from 'yjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, LiveBinding, Session, sectionFlow, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

const P = (para: number, offset: number): Pos => ({ section: 0, para, offset })
const body = (s: Session) => Array.from({ length: s.doc.paragraphCount(0) }, (_, i) => s.doc.text(0, i))

function base(lines: string[]): Uint8Array {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  let p = P(0, 0)
  lines.forEach((l, i) => {
    if (i > 0) p = s.text.split(p)
    p = s.text.insert(p, l)
  })
  return s.export('hwpx')
}

/** A room: clients exchange updates when `flush` is called (or immediately when `auto`). */
function room(bytes: Uint8Array, n: number, auto = false) {
  const clients = Array.from({ length: n }, (_, i) => {
    const s = new Session(HwpCoreDocument.open(bytes), 'hwpx')
    const doc = new Y.Doc()
    doc.clientID = i + 1
    return { s, doc, bus: new CommandBus(s), outbox: [] as Uint8Array[], live: null as LiveBinding | null }
  })
  const flush = () => {
    for (let round = 0; round < 4; round++) {
      for (const c of clients) {
        for (const u of c.outbox.splice(0)) for (const o of clients) if (o !== c) Y.applyUpdate(o.doc, u, 'room')
      }
    }
  }
  for (const c of clients) {
    c.doc.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === 'room') return
      c.outbox.push(u)
      if (auto) flush()
    })
  }
  clients[0]!.live = new LiveBinding(clients[0]!.s, clients[0]!.doc, clients[0]!.bus, { seed: true })
  flush()
  for (const c of clients.slice(1)) c.live = new LiveBinding(c.s, c.doc, c.bus)
  return { clients, flush }
}

const type = (c: { s: Session; bus: CommandBus }, at: Pos, text: string) => {
  c.s.select({ anchor: at, head: at })
  for (const ch of text) c.bus.run('edit:insert-text', { text: ch })
}

describe('live typing over Y.Text (design A2)', () => {
  it('one person’s typing appears in the other’s engine, without marking it unsaved', () => {
    const { clients: [a, b], flush } = room(base(['제1조 목적', '제2조 정의']), 2)
    type(a!, P(0, 3), ' (개정)')
    flush()
    expect(body(b!.s)).toEqual(['제1조 (개정) 목적', '제2조 정의'])
    expect(b!.s.dirty).toBe(false)
    expect(a!.s.dirty).toBe(true)
  })

  it('concurrent typing in the same paragraph converges', () => {
    const { clients: [a, b], flush } = room(base(['가나다라']), 2)
    type(a!, P(0, 1), 'AA')
    type(b!, P(0, 3), 'BB')
    flush()
    expect(body(a!.s)).toEqual(body(b!.s))
    expect(body(a!.s)).toEqual(['가AA나다BB라'])
  })

  it('a split while the other types into the tail keeps their text in the tail', () => {
    const { clients: [a, b], flush } = room(base(['앞부분뒷부분']), 2)
    a!.s.select({ anchor: P(0, 3), head: P(0, 3) })
    a!.bus.run('edit:split-paragraph')
    type(b!, P(0, 5), '★')
    flush()
    expect(body(a!.s)).toEqual(['앞부분', '뒷부★분'])
    expect(body(b!.s)).toEqual(body(a!.s))
  })

  it('undo removes only this person’s typing', () => {
    const { clients: [a, b], flush } = room(base(['문단']), 2, true)
    type(a!, P(0, 2), ' A')
    type(b!, P(0, 0), 'B ')
    flush()
    a!.bus.run('edit:undo')
    flush()
    expect(body(a!.s)).toEqual(['B 문단'])
    expect(body(b!.s)).toEqual(['B 문단'])
  })

  it('a caret stays on its text when others type before it, and resolves across views', () => {
    const { clients: [a, b], flush } = room(base(['abcdef']), 2)
    b!.s.select({ anchor: P(0, 4), head: P(0, 4) })
    type(a!, P(0, 0), 'XYZ')
    flush()
    expect(b!.s.selection.head).toEqual(P(0, 7))
    const cur = b!.live!.cursor()
    expect(a!.live!.resolveCursor(cur)).toEqual({ anchor: P(0, 7), head: P(0, 7) })
  })

  it('a late joiner sees text typed before they came', () => {
    const bytes = base(['하나'])
    const { clients: [a], flush } = room(bytes, 1)
    type(a!, P(0, 2), ' 둘')
    flush()
    const s = new Session(HwpCoreDocument.open(bytes), 'hwpx')
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(a!.doc))
    new LiveBinding(s, doc, null)
    expect(body(s)).toEqual(['하나 둘'])
  })

  it('fuzz: three people typing, deleting and splitting converge', () => {
    let seed = 7
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n)
    for (let round = 0; round < 12; round++) {
      const { clients, flush } = room(base(['가나다라마바사', '아자차카타파하']), 3)
      for (let step = 0; step < 25; step++) {
        const c = clients[rnd(3)]!
        const para = rnd(c.s.doc.paragraphCount(0))
        const len = c.s.doc.paragraphLength(0, para)
        const at = P(para, rnd(len + 1))
        c.s.select({ anchor: at, head: at })
        const k = rnd(10)
        if (k < 6) c.bus.run('edit:insert-text', { text: '한글AB'[rnd(4)]! })
        else if (k < 8) c.bus.run('edit:delete-backward')
        else if (k < 9) c.bus.run('edit:split-paragraph')
        else c.bus.run('edit:delete-forward')
        if (rnd(4) === 0) flush()
      }
      flush()
      const want = sectionFlow(clients[0]!.s, 0)
      for (const c of clients) {
        expect(sectionFlow(c.s, 0)).toBe(want)
        expect(sectionFlow(c.s, 0)).toBe(c.doc.getText('hwp:section0').toString())
      }
    }
  })
})
