// Design A: mirror the body into a Y.Doc (the y-prosemirror approach).
//
// The Y.Doc holds `paras: Y.Array<Y.Text>`. A local edit goes into the Y.Doc
// and into the engine. A remote transaction is projected onto the engine.
// Yjs owns convergence; the engine is a projection, so the binding never needs
// transform rules, whatever edits the engine grows.
//
// Spike simplification: remote changes are projected by reconciling paragraph
// texts (common prefix/suffix of paragraphs, then a per-paragraph text diff),
// not from the Y event deltas. Convergence is the same; a production binding
// must use the deltas so character shapes on untouched runs keep their place,
// and must map code points to UTF-16.
import * as Y from 'yjs'
import { HwpCoreDocument } from '@genoffice/hwp-core'
import { applyToCore, paragraphs, type Op } from './ops'

const LOCAL = Symbol('local')

export class YClient {
  readonly ydoc = new Y.Doc()
  readonly paras: Y.Array<Y.Text>
  readonly core: HwpCoreDocument
  /** Updates produced locally and not yet delivered to the other clients. */
  readonly outbox: Uint8Array[] = []

  constructor(base: Uint8Array, clientId: number, seed?: Uint8Array) {
    this.ydoc.clientID = clientId
    this.core = HwpCoreDocument.open(base)
    this.paras = this.ydoc.getArray<Y.Text>('paras')
    if (seed) Y.applyUpdate(this.ydoc, seed, 'seed')
    this.ydoc.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === LOCAL) this.outbox.push(u)
    })
    this.paras.observeDeep((_events, tr) => {
      if (tr.origin !== LOCAL) this.project()
    })
  }

  /** The Y.Doc's initial state from base bytes; every client starts from the same one. */
  static seed(base: Uint8Array): Uint8Array {
    const d = new Y.Doc()
    d.clientID = 1
    const core = HwpCoreDocument.open(base)
    const arr = d.getArray<Y.Text>('paras')
    d.transact(() => arr.push(paragraphs(core).map((t) => new Y.Text(t))))
    core.dispose()
    return Y.encodeStateAsUpdate(d)
  }

  local(op: Op): void {
    this.ydoc.transact(() => {
      switch (op.t) {
        case 'insert':
          this.paras.get(op.p).insert(op.o, op.text)
          break
        case 'delete':
          this.paras.get(op.p).delete(op.o, op.n)
          break
        case 'split': {
          const text = this.paras.get(op.p)
          const tail = text.toString().slice(op.o)
          text.delete(op.o, tail.length)
          this.paras.insert(op.p + 1, [new Y.Text(tail)])
          break
        }
        case 'merge': {
          const next = this.paras.get(op.p + 1).toString()
          this.paras.get(op.p).insert(this.paras.get(op.p).length, next)
          this.paras.delete(op.p + 1, 1)
          break
        }
      }
    }, LOCAL)
    applyToCore(this.core, op)
  }

  receive(update: Uint8Array): void {
    Y.applyUpdate(this.ydoc, update, 'remote')
  }

  shared(): string[] {
    return this.paras.toArray().map((t) => t.toString())
  }

  /** Bring the engine to the Y.Doc's state with engine edits only. */
  project(): void {
    const want = this.shared()
    const have = paragraphs(this.core)
    let head = 0
    while (head < want.length && head < have.length && want[head] === have[head]) head++
    let tail = 0
    while (tail < want.length - head && tail < have.length - head && want[want.length - 1 - tail] === have[have.length - 1 - tail]) tail++
    const wantMid = want.slice(head, want.length - tail)
    const haveMid = have.slice(head, have.length - tail)
    // Pair paragraphs one to one, then add or remove the difference.
    const pairs = Math.min(wantMid.length, haveMid.length)
    for (let i = 0; i < pairs; i++) patchParagraph(this.core, head + i, haveMid[i]!, wantMid[i]!)
    for (let i = pairs; i < wantMid.length; i++) {
      const at = head + i - 1
      if (at < 0) {
        applyToCore(this.core, { t: 'split', p: 0, o: 0 })
        patchParagraph(this.core, 0, '', wantMid[i]!)
      } else {
        applyToCore(this.core, { t: 'split', p: at, o: [...paragraphs(this.core)[at]!].length })
        patchParagraph(this.core, at + 1, '', wantMid[i]!)
      }
    }
    for (let i = haveMid.length - 1; i >= pairs; i--) {
      const p = head + i
      patchParagraph(this.core, p, paragraphs(this.core)[p]!, '')
      if (p > 0) applyToCore(this.core, { t: 'merge', p: p - 1 })
      else applyToCore(this.core, { t: 'merge', p: 0 })
    }
  }

  dispose(): void {
    this.core.dispose()
    this.ydoc.destroy()
  }
}

function patchParagraph(core: HwpCoreDocument, p: number, have: string, want: string): void {
  if (have === want) return
  const a = [...have]
  const b = [...want]
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const del = a.length - pre - suf
  if (del > 0) applyToCore(core, { t: 'delete', p, o: pre, n: del })
  const ins = b.slice(pre, b.length - suf).join('')
  if (ins) applyToCore(core, { t: 'insert', p, o: pre, text: ins })
}
