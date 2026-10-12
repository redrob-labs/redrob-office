/**
 * Multi-client fuzz for live Hangul typing (spec task 5.6, the part that runs without the Compose
 * stack). Every round builds a room of 2 to 5 views over one document and runs random edits while
 * the network misbehaves: updates arrive late, out of order, twice, or not until a view comes back
 * online, and someone joins halfway through. When everything is delivered, every engine must hold
 * the shared text, and saving and reopening any view must give the same text back.
 *
 * Seeded, so a failure names the seed that reproduces it. `HWP_LIVE_FUZZ_ROUNDS` runs more rounds.
 */
import * as Y from 'yjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, LiveBinding, Session, sectionFlow, sectionKey, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

const P = (para: number, offset: number): Pos => ({ section: 0, para, offset })
const ROUNDS = Number(process.env.HWP_LIVE_FUZZ_ROUNDS) || 16
const STEPS = 40

function base(lines: string[]): Uint8Array {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  let p = P(0, 0)
  lines.forEach((l, i) => {
    if (i > 0) p = s.text.split(p)
    p = s.text.insert(p, l)
  })
  return s.export('hwpx')
}

function rng(seed: number) {
  let x = seed >>> 0 || 1
  return (n: number) => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) % n
  }
}

interface Client {
  name: string
  s: Session
  doc: Y.Doc
  bus: CommandBus
  live: LiveBinding
  online: boolean
  /** what this view typed while offline, sent when it comes back */
  held: Uint8Array[]
}

/** A room whose network delivers each update to each peer whenever the fuzz says so. */
class Net {
  readonly clients: Client[] = []
  /** per receiver, the updates still on their way to it */
  private readonly queues = new Map<Client, Uint8Array[]>()
  /** everything ever sent, so a late joiner can start from the room's state */
  readonly room = new Y.Doc()

  constructor(private readonly bytes: Uint8Array) {}

  join(name: string, seed: boolean): Client {
    const s = new Session(HwpCoreDocument.open(this.bytes), 'hwpx')
    const doc = new Y.Doc()
    // A late joiner starts from what the room has seen so far, as `live:join` returns.
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(this.room), 'room')
    const bus = new CommandBus(s)
    const c = { name, s, doc, bus, online: true, held: [] } as unknown as Client
    this.queues.set(c, [])
    doc.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === 'room') return
      if (c.online) this.send(c, u)
      else c.held.push(u)
    })
    this.clients.push(c)
    c.live = new LiveBinding(s, doc, bus, { seed })
    return c
  }

  private send(from: Client, u: Uint8Array): void {
    Y.applyUpdate(this.room, u, 'room')
    for (const o of this.clients) if (o !== from) this.queues.get(o)!.push(u)
  }

  setOnline(c: Client, online: boolean): void {
    c.online = online
    if (online) for (const u of c.held.splice(0)) this.send(c, u)
  }

  /** Deliver some of what is in flight to online views, out of order, sometimes twice. */
  deliverSome(rnd: (n: number) => number): void {
    for (const c of this.clients) {
      if (!c.online) continue
      const q = this.queues.get(c)!
      let n = rnd(q.length + 1)
      while (n-- > 0 && q.length) {
        const [u] = q.splice(rnd(q.length), 1)
        Y.applyUpdate(c.doc, u!, 'room')
        if (rnd(8) === 0) Y.applyUpdate(c.doc, u!, 'room')
      }
    }
  }

  /** Bring everyone online and deliver everything. */
  settle(): void {
    for (const c of this.clients) this.setOnline(c, true)
    for (let i = 0; i < 4; i++) {
      for (const c of this.clients) {
        const q = this.queues.get(c)!
        for (const u of q.splice(0)) Y.applyUpdate(c.doc, u, 'room')
      }
    }
  }
}

function caret(s: Session, rnd: (n: number) => number): Pos {
  const para = rnd(s.doc.paragraphCount(0))
  return P(para, rnd(s.doc.paragraphLength(0, para) + 1))
}

function step(c: Client, rnd: (n: number) => number): string {
  const s = c.s
  const at = caret(s, rnd)
  s.select({ anchor: at, head: at })
  const k = rnd(20)
  if (k < 8) {
    c.bus.run('edit:insert-text', { text: ['가', '나', 'A', 'b', ' ', '한글', '조'][rnd(7)]! })
    return 'type'
  }
  if (k < 10) {
    c.bus.run('edit:insert-text', { text: ['줄1\n줄2', '\n', '제3조\n(정의)\n'][rnd(3)]! })
    return 'paste'
  }
  if (k < 12) {
    // A range, often across paragraphs.
    const other = caret(s, rnd)
    s.select({ anchor: at, head: other })
    c.bus.run('edit:delete-backward')
    return 'delete-range'
  }
  if (k < 14) {
    c.bus.run('edit:delete-backward')
    return 'backspace'
  }
  if (k < 15) {
    c.bus.run('edit:delete-forward')
    return 'delete'
  }
  if (k < 17) {
    c.bus.run('edit:split-paragraph')
    return 'enter'
  }
  if (k < 19) {
    c.bus.run('edit:undo')
    return 'undo'
  }
  c.bus.run('edit:redo')
  return 'redo'
}

function expectConverged(net: Net, seed: number, log: string[]): void {
  const want = net.room.getText(sectionKey(0)).toString()
  const why = `seed ${seed}: ${log.slice(-12).join(' ')}`
  for (const c of net.clients) {
    expect(c.doc.getText(sectionKey(0)).toString(), `${why} (${c.name} shared text)`).toBe(want)
    expect(sectionFlow(c.s, 0), `${why} (${c.name} engine)`).toBe(want)
    expect(c.s.doc.paragraphCount(0), `${why} (${c.name} paragraphs)`).toBe(want.split('\n').length)
  }
  // What any view saves is what everyone sees.
  const saver = net.clients[seed % net.clients.length]!
  const reopened = new Session(HwpCoreDocument.open(saver.s.export('hwpx')), 'hwpx')
  expect(sectionFlow(reopened, 0), `${why} (reopened from ${saver.name})`).toBe(want)
}

describe('live typing fuzz (task 5.6)', () => {
  it(`converges for ${ROUNDS} rounds of 2 to 5 views over a lossy, reordering network`, () => {
    for (let round = 0; round < ROUNDS; round++) {
      const seed = 0x5eed + round * 7919
      const rnd = rng(seed)
      const net = new Net(base(['제1조(목적) 이 계약은', '제2조(정의) 다음과 같다.', '']))
      const people = 2 + rnd(4)
      net.join('p0', true)
      for (let i = 1; i < people; i++) net.join(`p${i}`, false)
      net.settle()
      const log: string[] = []
      const lateAt = rnd(STEPS)
      for (let i = 0; i < STEPS; i++) {
        if (i === lateAt) {
          net.join(`late${round}`, false)
          log.push('join')
        }
        const c = net.clients[rnd(net.clients.length)]!
        // Now and then someone drops off the network and keeps typing.
        if (rnd(10) === 0) net.setOnline(c, !c.online)
        log.push(`${c.name}:${step(c, rnd)}`)
        if (rnd(3) === 0) net.deliverSome(rnd)
      }
      net.settle()
      expectConverged(net, seed, log)
    }
  })

  it('a view that typed offline for a long time merges on reconnect', () => {
    const net = new Net(base(['공통 문단']))
    const a = net.join('a', true)
    const b = net.join('b', false)
    net.settle()
    net.setOnline(b, false)
    const rnd = rng(42)
    for (let i = 0; i < 30; i++) step(b, rnd)
    for (let i = 0; i < 30; i++) step(a, rnd)
    net.settle()
    expectConverged(net, 42, ['offline'])
  })

  it('undo after convergence removes only that person’s edits, everywhere', () => {
    const net = new Net(base(['하나']))
    const a = net.join('a', true)
    const b = net.join('b', false)
    net.settle()
    a.s.select({ anchor: P(0, 2), head: P(0, 2) })
    a.bus.run('edit:insert-text', { text: '\n둘' })
    net.settle()
    b.s.select({ anchor: P(0, 0), head: P(0, 0) })
    b.bus.run('edit:insert-text', { text: '영 ' })
    net.settle()
    a.live.undo.stopCapturing()
    a.bus.run('edit:undo')
    net.settle()
    for (const c of net.clients) expect(sectionFlow(c.s, 0)).toBe('영 하나')
    a.bus.run('edit:redo')
    net.settle()
    for (const c of net.clients) expect(sectionFlow(c.s, 0)).toBe('영 하나\n둘')
  })
})
