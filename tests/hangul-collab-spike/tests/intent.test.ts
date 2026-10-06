// Convergence is necessary, not sufficient: the converged text must also be
// what both people meant. The case that separates the designs: one person
// splits a paragraph while another types into the part that moves.
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { paragraphs } from '../src/ops'
import { YClient } from '../src/yhwp'
import { FlowClient } from '../src/yhwp-flow'
import { LogClient, Sequencer } from '../src/oplog'

beforeAll(() => initHwpCoreNode())

function base(): Uint8Array {
  const d = HwpCoreDocument.blank()
  d.insertText(0, 0, 0, '첫째문장둘째문장')
  const b = d.export('hwpx')
  d.dispose()
  return b
}

describe('split while another person types into the tail', () => {
  // Alice splits after 첫째문장 (offset 4); Bob, concurrently, types X after 둘째 (offset 6).
  // Intent: ["첫째문장", "둘째X문장"].
  it('design A (naive Y split: delete tail, insert a new Y.Text) puts the typing in the wrong paragraph', () => {
    const b = base()
    const seed = YClient.seed(b)
    const alice = new YClient(b, 11, seed)
    const bob = new YClient(b, 12, seed)
    alice.local({ t: 'split', p: 0, o: 4 })
    bob.local({ t: 'insert', p: 0, o: 6, text: 'X' })
    for (const u of alice.outbox.splice(0)) bob.receive(u)
    for (const u of bob.outbox.splice(0)) alice.receive(u)
    expect(paragraphs(alice.core)).toEqual(paragraphs(bob.core))
    // Converged, but Bob's X stayed with the deleted tail's position in paragraph 0.
    expect(paragraphs(alice.core)).toEqual(['첫째문장X', '둘째문장'])
    alice.dispose()
    bob.dispose()
  })

  it('design A2 (breaks as characters) keeps the typing with the text it was typed into', () => {
    const b = base()
    const seed = FlowClient.seed(b)
    const alice = new FlowClient(b, 11, seed)
    const bob = new FlowClient(b, 12, seed)
    alice.local({ t: 'split', p: 0, o: 4 })
    bob.local({ t: 'insert', p: 0, o: 6, text: 'X' })
    for (const u of alice.outbox.splice(0)) bob.receive(u)
    for (const u of bob.outbox.splice(0)) alice.receive(u)
    expect(paragraphs(alice.core)).toEqual(['첫째문장', '둘째X문장'])
    expect(paragraphs(bob.core)).toEqual(paragraphs(alice.core))
    alice.dispose()
    bob.dispose()
  })

  it('design B (op log) keeps the typing with the text it was typed into', () => {
    const b = base()
    const server = new Sequencer()
    const alice = new LogClient(b, 1)
    const bob = new LogClient(b, 2)
    alice.local({ t: 'split', p: 0, o: 4 })
    bob.local({ t: 'insert', p: 0, o: 6, text: 'X' })
    alice.sync(server)
    bob.sync(server)
    alice.pull(server)
    expect(paragraphs(alice.core)).toEqual(['첫째문장', '둘째X문장'])
    expect(paragraphs(bob.core)).toEqual(paragraphs(alice.core))
    alice.dispose()
    bob.dispose()
  })
})
