// Design A2: one Y.Text per section, paragraph breaks as "\n" characters
// (the Quill/Yjs rich-text model). A split inserts a break and a merge deletes
// one, so text typed concurrently into a moving tail moves with it: the break
// is just another character between the two halves.
//
// In a production binding a break carries its paragraph's properties as Y
// formatting attributes (para shape, style), runs carry char-shape attributes,
// and tables, pictures and other controls are Y embeds holding their own
// Y types. Same projection rule as yhwp.ts: here reconcile by text for the
// spike, by event deltas in the product.
import * as Y from 'yjs'
import { HwpCoreDocument } from '@genoffice/hwp-core'
import { applyToCore, paragraphs, type Op } from './ops'

const LOCAL = Symbol('local')
const BREAK = '\n'

export class FlowClient {
  readonly ydoc = new Y.Doc()
  readonly body: Y.Text
  readonly core: HwpCoreDocument
  readonly outbox: Uint8Array[] = []

  constructor(base: Uint8Array, clientId: number, seed: Uint8Array) {
    this.ydoc.clientID = clientId
    this.core = HwpCoreDocument.open(base)
    this.body = this.ydoc.getText('section0')
    Y.applyUpdate(this.ydoc, seed, 'seed')
    this.ydoc.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === LOCAL) this.outbox.push(u)
    })
    this.body.observe((_e, tr) => {
      if (tr.origin !== LOCAL) this.project()
    })
  }

  static seed(base: Uint8Array): Uint8Array {
    const d = new Y.Doc()
    d.clientID = 1
    const core = HwpCoreDocument.open(base)
    d.getText('section0').insert(0, paragraphs(core).join(BREAK))
    core.dispose()
    return Y.encodeStateAsUpdate(d)
  }

  shared(): string[] {
    return this.body.toString().split(BREAK)
  }

  /** Absolute index of (paragraph, offset) in the flow. */
  private at(p: number, o: number): number {
    const paras = this.shared()
    let i = 0
    for (let k = 0; k < p; k++) i += paras[k]!.length + 1
    return i + o
  }

  local(op: Op): void {
    this.ydoc.transact(() => {
      switch (op.t) {
        case 'insert':
          this.body.insert(this.at(op.p, op.o), op.text)
          break
        case 'delete':
          this.body.delete(this.at(op.p, op.o), op.n)
          break
        case 'split':
          this.body.insert(this.at(op.p, op.o), BREAK)
          break
        case 'merge':
          this.body.delete(this.at(op.p, this.shared()[op.p]!.length), 1)
          break
      }
    }, LOCAL)
    applyToCore(this.core, op)
  }

  receive(update: Uint8Array): void {
    Y.applyUpdate(this.ydoc, update, 'remote')
  }

  /** Bring the engine to the flow's state. */
  project(): void {
    const want = this.shared()
    const have = paragraphs(this.core)
    // Align on whole paragraphs from both ends, then patch the middle as one
    // flow: deleting breaks merges, inserting breaks splits.
    let head = 0
    while (head < want.length - 1 && head < have.length - 1 && want[head] === have[head]) head++
    let tail = 0
    while (tail < want.length - head - 1 && tail < have.length - head - 1 && want[want.length - 1 - tail] === have[have.length - 1 - tail]) tail++
    const a = [...have.slice(head, have.length - tail).join(BREAK)]
    const b = [...want.slice(head, want.length - tail).join(BREAK)]
    let pre = 0
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
    let suf = 0
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
    const pos = (flat: string[], i: number) => {
      let p = head
      let o = 0
      for (let k = 0; k < i; k++) {
        if (flat[k] === BREAK) {
          p++
          o = 0
        } else o++
      }
      return { p, o }
    }
    const start = pos(a, pre)
    const end = pos(a, a.length - suf)
    if (start.p !== end.p || start.o !== end.o) this.core.deleteRange(0, start.p, start.o, end.p, end.o)
    // Insert the replacement, splitting at each break.
    let { p, o } = start
    for (const seg of b.slice(pre, b.length - suf).join('').split(BREAK).map((s, i, all) => ({ s, last: i === all.length - 1 }))) {
      if (seg.s) applyToCore(this.core, { t: 'insert', p, o, text: seg.s })
      o += [...seg.s].length
      if (!seg.last) {
        applyToCore(this.core, { t: 'split', p, o })
        p++
        o = 0
      }
    }
  }

  dispose(): void {
    this.core.dispose()
    this.ydoc.destroy()
  }
}
