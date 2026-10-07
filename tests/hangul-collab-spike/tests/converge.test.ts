// Spec task 0.5: fuzz both collaboration designs with concurrent clients.
// Converged means every client's engine holds the same paragraphs and paints
// every page identically, and its saved bytes reopen to the same text.
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { paragraphs, randomOp, rng } from '../src/ops'
import { canonicalPaint } from '../src/paint'
import { YClient } from '../src/yhwp'
import { FlowClient } from '../src/yhwp-flow'
import { LogClient, Sequencer, transform, type TOp } from '../src/oplog'

beforeAll(() => initHwpCoreNode())

function baseDocument(): Uint8Array {
  const d = HwpCoreDocument.blank()
  d.insertText(0, 0, 0, '대한민국은 민주공화국이다')
  JSON.parse(d.raw.splitParagraph(0, 0, 5))
  d.insertText(0, 1, d.paragraphLength(0, 1), ' 주권은 국민에게 있다')
  const bytes = d.export('hwpx')
  d.dispose()
  return bytes
}

function paint(doc: HwpCoreDocument): string[] {
  return Array.from({ length: doc.pageCount() }, (_, p) => canonicalPaint(doc.raw.getPageLayerTree(p)).join('\n'))
}

function assertConverged(docs: HwpCoreDocument[], label: string): void {
  const texts = docs.map(paragraphs)
  for (const t of texts.slice(1)) expect(t, `${label}: paragraphs`).toEqual(texts[0])
  const paints = docs.map(paint)
  for (const p of paints.slice(1)) expect(p.length === paints[0]!.length && p.every((x, i) => x === paints[0]![i]), `${label}: paint`).toBe(true)
  for (const fmt of ['hwp', 'hwpx'] as const) {
    const reopened = HwpCoreDocument.open(docs[0]!.export(fmt))
    expect(paragraphs(reopened), `${label}: ${fmt} reopen`).toEqual(texts[0])
    reopened.dispose()
  }
}

const SEEDS = Array.from({ length: 25 }, (_, i) => 1000 + i)
const CLIENTS = 3
const ROUNDS = 12
const OPS_PER_ROUND = 4

describe('design A: Y.Doc mirror (y-hwp)', () => {
  it.each(SEEDS)('converges, seed %i', (seed) => {
    const rand = rng(seed)
    const base = baseDocument()
    const seedUpdate = YClient.seed(base)
    const clients = Array.from({ length: CLIENTS }, (_, i) => new YClient(base, 100 + i, seedUpdate))
    try {
      expect(paragraphs(clients[0]!.core)).toEqual(clients[0]!.shared())
      for (let r = 0; r < ROUNDS; r++) {
        // Concurrent: every client edits its own view before anything is delivered.
        for (const c of clients) for (let k = 0; k < OPS_PER_ROUND; k++) c.local(randomOp(c.shared(), rand))
        // Deliver in a random order, sometimes holding a client's updates back a round.
        const order = clients.map((c, i) => ({ c, i, k: rand() })).sort((a, b) => a.k - b.k)
        for (const { c, i } of order) {
          if (rand() < 0.2 && r < ROUNDS - 1) continue
          const updates = c.outbox.splice(0)
          for (const u of updates) clients.forEach((o, j) => j !== i && o.receive(u))
        }
      }
      for (const [i, c] of clients.entries()) for (const u of c.outbox.splice(0)) clients.forEach((o, j) => j !== i && o.receive(u))
      for (const c of clients) expect(paragraphs(c.core), `seed ${seed}: engine matches its Y.Doc`).toEqual(c.shared())
      assertConverged(clients.map((c) => c.core), `A seed ${seed}`)
    } finally {
      clients.forEach((c) => c.dispose())
    }
  })
})

describe('design A2: one Y.Text per section, breaks as characters', () => {
  it.each(SEEDS)('converges, seed %i', (seed) => {
    const rand = rng(seed)
    const base = baseDocument()
    const seedUpdate = FlowClient.seed(base)
    const clients = Array.from({ length: CLIENTS }, (_, i) => new FlowClient(base, 100 + i, seedUpdate))
    try {
      for (let r = 0; r < ROUNDS; r++) {
        for (const c of clients) for (let k = 0; k < OPS_PER_ROUND; k++) c.local(randomOp(c.shared(), rand))
        const order = clients.map((c, i) => ({ c, i, k: rand() })).sort((a, b) => a.k - b.k)
        for (const { c, i } of order) {
          if (rand() < 0.2 && r < ROUNDS - 1) continue
          for (const u of c.outbox.splice(0)) clients.forEach((o, j) => j !== i && o.receive(u))
        }
      }
      for (const [i, c] of clients.entries()) for (const u of c.outbox.splice(0)) clients.forEach((o, j) => j !== i && o.receive(u))
      for (const c of clients) expect(paragraphs(c.core), `seed ${seed}: engine matches its Y.Text`).toEqual(c.shared())
      assertConverged(clients.map((c) => c.core), `A2 seed ${seed}`)
    } finally {
      clients.forEach((c) => c.dispose())
    }
  })
})

describe('design B: server-ordered op log with rebase', () => {
  it('transform covers the 9 pairs of insert, delete and split', () => {
    const kinds: TOp[] = [
      { t: 'insert', p: 0, o: 2, text: 'ab' },
      { t: 'delete', p: 0, o: 1, n: 2 },
      { t: 'split', p: 0, o: 2 },
    ]
    for (const x of kinds) for (const s of kinds) expect(() => transform(x, s)).not.toThrow()
  })

  it.each(SEEDS)('converges, seed %i', (seed) => {
    const rand = rng(seed)
    const base = baseDocument()
    const server = new Sequencer()
    const clients = Array.from({ length: CLIENTS }, (_, i) => new LogClient(base, 100 + i))
    try {
      for (let r = 0; r < ROUNDS; r++) {
        for (const c of clients) for (let k = 0; k < OPS_PER_ROUND; k++) c.local(randomOp(paragraphs(c.core), rand, false) as TOp)
        const order = clients.map((c) => ({ c, k: rand() })).sort((a, b) => a.k - b.k)
        for (const { c } of order) {
          if (rand() < 0.2 && r < ROUNDS - 1) continue
          c.sync(server)
        }
      }
      for (const c of clients) c.sync(server)
      for (const c of clients) c.pull(server)
      assertConverged(clients.map((c) => c.core), `B seed ${seed}`)
    } finally {
      clients.forEach((c) => c.dispose())
    }
  })
})
