// Design B: a server-ordered op log with client rebase.
//
// The server assigns every op a sequence number. A client applies its own ops
// at once (optimistic), keeps them as `pending`, and keeps an engine snapshot
// of the last confirmed state. When the server's ops arrive, the client
// restores the snapshot, applies them, then re-applies its pending ops
// transformed against them. The server transforms an incoming op against every
// op it has ordered since the op's base revision.
//
// The cost of this design is `transform`: one rule for every ordered pair of
// op kinds, growing quadratically with the edit vocabulary. This spike covers
// insert, delete and split (9 pairs). Merge, tables, cells, objects, notes and
// formatting would each add rows and columns.
import { HwpCoreDocument } from '@genoffice/hwp-core'
import { applyToCore, type Op } from './ops'

export type TOp = Exclude<Op, { t: 'merge' }>

/**
 * Transform `x` so it applies after `s`, where `s` was ordered first. Ties at
 * the same position put `s` first. May split a delete in two.
 */
export function transform(x: TOp, s: TOp): TOp[] {
  if (s.t === 'insert') {
    const n = [...s.text].length
    if (x.p !== s.p) return [x]
    if (x.t === 'insert') return [x.o >= s.o ? { ...x, o: x.o + n } : x]
    if (x.t === 'split') return [x.o >= s.o ? { ...x, o: x.o + n } : x]
    // delete
    if (x.o >= s.o) return [{ ...x, o: x.o + n }]
    if (x.o + x.n <= s.o) return [x]
    // the insertion lands inside the deleted range: keep it, delete around it
    return [
      { t: 'delete', p: x.p, o: s.o + n, n: x.o + x.n - s.o },
      { t: 'delete', p: x.p, o: x.o, n: s.o - x.o },
    ]
  }
  if (s.t === 'delete') {
    if (x.p !== s.p) return [x]
    const end = s.o + s.n
    if (x.t === 'insert' || x.t === 'split') {
      if (x.o >= end) return [{ ...x, o: x.o - s.n }]
      if (x.o > s.o) return [{ ...x, o: s.o }]
      return [x]
    }
    // delete vs delete: remove the overlap
    const xs = x.o
    const xe = x.o + x.n
    const before = Math.max(0, Math.min(xe, s.o) - xs)
    const after = Math.max(0, xe - Math.max(xs, end))
    const n = before + after
    if (n === 0) return []
    const o = xs < s.o ? xs : Math.max(s.o, xs - s.n)
    return [{ t: 'delete', p: x.p, o, n }]
  }
  // s is a split of paragraph s.p at s.o
  if (x.p > s.p) return [{ ...x, p: x.p + 1 }]
  if (x.p < s.p) return [x]
  if (x.t === 'insert' || x.t === 'split') return [x.o > s.o || (x.t === 'split' && x.o === s.o) ? { ...x, p: x.p + 1, o: x.o - s.o } : x]
  // delete crossing the split point becomes one delete per side
  const xe = x.o + x.n
  if (x.o >= s.o) return [{ ...x, p: x.p + 1, o: x.o - s.o }]
  if (xe <= s.o) return [x]
  return [
    { t: 'delete', p: x.p + 1, o: 0, n: xe - s.o },
    { t: 'delete', p: x.p, o: x.o, n: s.o - x.o },
  ]
}

export function transformAll(xs: TOp[], s: TOp): TOp[] {
  return xs.flatMap((x) => transform(x, s))
}

export interface Ordered {
  seq: number
  client: number
  op: TOp
}

export class Sequencer {
  readonly log: Ordered[] = []

  /** Order a client's op made against `baseSeq` (the last seq that client had seen). */
  submit(client: number, baseSeq: number, ops: TOp[]): Ordered[] {
    let xs = ops
    for (const o of this.log.slice(baseSeq)) if (o.client !== client) xs = transformAll(xs, o.op)
    return xs.map((op) => {
      const o = { seq: this.log.length + 1, client, op }
      this.log.push(o)
      return o
    })
  }
}

export class LogClient {
  readonly core: HwpCoreDocument
  /** Server ops this client has applied. */
  seq = 0
  /** Local ops not yet acknowledged, in order, against the confirmed state. */
  pending: TOp[] = []
  private confirmed: number

  constructor(base: Uint8Array, readonly id: number) {
    this.core = HwpCoreDocument.open(base)
    this.confirmed = this.core.saveSnapshot()
  }

  local(op: TOp): void {
    applyToCore(this.core, op)
    this.pending.push(op)
  }

  /**
   * Send pending ops and take everything the server has ordered. Submit and
   * pull are one step: own ops come back, transformed, in the log.
   */
  sync(server: Sequencer): void {
    if (this.pending.length) {
      server.submit(this.id, this.seq, this.pending)
      this.pending = []
    }
    this.pull(server)
  }

  /** Apply every server op this client hasn't seen, rebasing pending ops on top. */
  pull(server: Sequencer): void {
    const fresh = server.log.slice(this.seq)
    if (!fresh.length) return
    this.core.restoreSnapshot(this.confirmed)
    for (const o of fresh) applyToCore(this.core, o.op)
    this.seq = server.log.length
    this.core.discardSnapshot(this.confirmed)
    this.confirmed = this.core.saveSnapshot()
    for (const o of fresh) if (o.client !== this.id) this.pending = transformAll(this.pending, o.op)
    for (const op of this.pending) applyToCore(this.core, op)
  }

  dispose(): void {
    this.core.dispose()
  }
}
