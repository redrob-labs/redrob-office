// One open Hangul document in the editor: the engine document, the selection,
// the command bus, history, the change stream and the dirty state.
//
// Every mutation goes through `Session.edit`, which is the change stream (spec
// E2, implemented at the editor's single entry point rather than inside each of
// the engine's hundreds of edit calls): it takes one undo snapshot per command,
// bumps `changeSeq`, records which node ids the command touched, and notifies
// listeners. Dirty is derived: `changeSeq !== savedSeq`, so every user edit
// marks the document unsaved and undoing back to the saved state clears it.
import type { HwpCoreDocument, HwpFormat, NodeId } from '@genoffice/hwp-core'
import { Text, containerOf, paraIndex, at, compare, type Pos, sameContainer } from './position'

export interface Selection {
  anchor: Pos
  head: Pos
}

export function collapsed(s: Selection): boolean {
  return sameContainer(s.anchor, s.head) && compare(s.anchor, s.head) === 0
}

export function ordered(s: Selection): [Pos, Pos] {
  return compare(s.anchor, s.head) <= 0 ? [s.anchor, s.head] : [s.head, s.anchor]
}

/** One entry of the change stream. */
export interface Change {
  seq: number
  /** Command id, e.g. "edit:insert-text". */
  command: string
  /** Node ids that existed before and were changed, removed or created by the command. */
  nodes: NodeId[]
  origin: ChangeOrigin
  /** Selection after the change. */
  selection: Selection
}

/** Who made a change: the person typing, the AI agent, a collaborator, or undo/redo. */
export type ChangeOrigin = 'user' | 'ai' | 'remote' | 'history'

export type ChangeListener = (change: Change) => void

/** Called after deferred pagination is settled, so the view can relayout pages. */
export type SettleListener = () => void

/**
 * Commands that may defer repagination while a person is typing (spec R4.4,
 * task 1.9). The engine otherwise repaginates the whole section on every
 * keystroke, which is ~105 ms on a 100-page document; deferred, a keystroke is
 * ~19 ms and the settle pass lands on the same pages.
 */
export const DEFERRABLE_COMMANDS = new Set(['edit:insert-text', 'edit:delete-backward', 'edit:delete-forward', 'edit:split-paragraph'])

interface HistoryEntry {
  snapshot: number
  selection: Selection
  seq: number
  command: string
}

export interface SessionOptions {
  /** Max undo steps kept (snapshots are discarded beyond it). */
  historyLimit?: number
}

export class Session {
  readonly text: Text
  selection: Selection
  changeSeq = 0
  savedSeq = 0
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private listeners = new Set<ChangeListener>()
  private readonly historyLimit: number
  private editing = false
  /** True while the engine is in batch mode (pagination deferred). */
  private deferred = false
  private settleListeners = new Set<SettleListener>()

  constructor(
    readonly doc: HwpCoreDocument,
    readonly format: HwpFormat,
    opts: SessionOptions = {},
  ) {
    this.text = new Text(doc)
    this.historyLimit = opts.historyLimit ?? 200
    const start: Pos = { section: 0, para: 0, offset: 0 }
    this.selection = { anchor: start, head: start }
  }

  get dirty(): boolean {
    return this.changeSeq !== this.savedSeq
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Whether pagination is deferred right now (page breaks may lag until `settle`). */
  get layoutPending(): boolean {
    return this.deferred
  }

  onSettle(listener: SettleListener): () => void {
    this.settleListeners.add(listener)
    return () => this.settleListeners.delete(listener)
  }

  /** Run any deferred pagination now. Cheap when nothing is deferred. */
  settle(): void {
    if (!this.deferred) return
    this.deferred = false
    this.doc.raw.endBatch()
    for (const l of this.settleListeners) l()
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Node id of the paragraph at a position (body or cell). */
  nodeAt(p: Pos): NodeId | null {
    return p.cell ? this.doc.nodeIdInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para) : this.doc.nodeIdAt(p.section, p.para)
  }

  /** Node ids of every paragraph a selection covers. */
  nodesIn(sel: Selection): NodeId[] {
    const [a, b] = ordered(sel)
    const ids: NodeId[] = []
    if (!sameContainer(a, b)) return [this.nodeAt(a), this.nodeAt(b)].filter((x): x is NodeId => x !== null)
    for (let i = paraIndex(a); i <= paraIndex(b); i++) {
      const id = this.nodeAt(at(containerOf(a), i, 0))
      if (id !== null) ids.push(id)
    }
    return ids
  }

  /**
   * Run one command as one undoable change. `fn` mutates the engine and
   * returns the new selection. If it throws, the document is restored and the
   * error rethrown, so a failed command never leaves half an edit behind.
   */
  edit(command: string, fn: () => Selection, origin: ChangeOrigin = 'user'): Change {
    if (this.group_) return this.editInGroup(command, fn)
    if (this.editing) throw new Error(`nested edit "${command}"`)
    return this.commit(command, fn, origin)
  }

  /**
   * Run several edits as one undoable change (one AI tool call, one
   * replace-all). Every `edit` made inside `fn`, directly or through the
   * command bus, joins the group: no history entry or change event of its
   * own. If anything throws, the whole group is rolled back.
   */
  group(command: string, fn: () => Selection, origin: ChangeOrigin = 'user'): Change {
    if (this.group_ || this.editing) throw new Error(`nested group "${command}"`)
    const touched = new Set<NodeId>()
    return this.commit(
      command,
      () => {
        this.group_ = touched
        this.groupOrigin = origin
        // Paginate once for the whole group, not after each of its engine calls:
        // a rewrite is several calls, and each repaginates the section (seconds
        // on a long government document).
        this.doc.raw.beginBatch()
        try {
          return fn()
        } finally {
          this.group_ = null
          this.doc.raw.endBatch()
        }
      },
      origin,
      touched,
    )
  }

  /** Node ids touched by the edits of the open group, or null outside a group. */
  private group_: Set<NodeId> | null = null
  private groupOrigin: ChangeOrigin = 'user'

  private editInGroup(command: string, fn: () => Selection): Change {
    const touched = this.group_!
    for (const id of this.nodesIn(this.selection)) touched.add(id)
    const selection = fn()
    this.selection = selection
    for (const id of this.nodesIn(selection)) touched.add(id)
    return { seq: this.changeSeq, command, nodes: [], origin: this.groupOrigin, selection }
  }

  private commit(command: string, fn: () => Selection, origin: ChangeOrigin, extra?: Set<NodeId>): Change {
    // Only a person's typing defers pagination; every other command (AI edits,
    // formatting, remote changes) sees exact pages.
    if (origin === 'user' && DEFERRABLE_COMMANDS.has(command)) {
      if (!this.deferred) {
        this.doc.raw.beginBatch()
        this.deferred = true
      }
    } else this.settle()
    // A group's inner edits run through `edit`, so `editing` stays off for them.
    if (!extra) this.editing = true
    const before = this.selection
    const touched = new Set(this.nodesIn(before))
    const snapshot = this.doc.saveSnapshot()
    try {
      const selection = fn()
      this.selection = selection
      for (const id of this.nodesIn(selection)) touched.add(id)
      for (const id of extra ?? []) touched.add(id)
    } catch (e) {
      this.doc.restoreSnapshot(snapshot)
      this.doc.discardSnapshot(snapshot)
      this.selection = before
      throw e
    } finally {
      this.editing = false
    }
    this.undoStack.push({ snapshot, selection: before, seq: this.changeSeq, command })
    this.trimHistory()
    for (const r of this.redoStack.splice(0)) this.doc.discardSnapshot(r.snapshot)
    this.changeSeq += 1
    return this.emit(command, [...touched], origin)
  }

  undo(): Change | null {
    this.settle()
    const entry = this.undoStack.pop()
    if (!entry) return null
    const redoSnap = this.doc.saveSnapshot()
    this.redoStack.push({ snapshot: redoSnap, selection: this.selection, seq: this.changeSeq, command: entry.command })
    const touched = this.nodesIn(this.selection)
    this.doc.restoreSnapshot(entry.snapshot)
    this.doc.discardSnapshot(entry.snapshot)
    this.selection = entry.selection
    this.changeSeq = entry.seq
    return this.emit(`edit:undo`, [...touched, ...this.nodesIn(this.selection)], 'history')
  }

  redo(): Change | null {
    this.settle()
    const entry = this.redoStack.pop()
    if (!entry) return null
    const undoSnap = this.doc.saveSnapshot()
    this.undoStack.push({ snapshot: undoSnap, selection: this.selection, seq: this.changeSeq, command: entry.command })
    this.doc.restoreSnapshot(entry.snapshot)
    this.doc.discardSnapshot(entry.snapshot)
    this.selection = entry.selection
    this.changeSeq = entry.seq
    return this.emit(`edit:redo`, this.nodesIn(this.selection), 'history')
  }

  /** Move the selection without changing the document (no history entry, no change). */
  select(selection: Selection): void {
    this.selection = selection
  }

  /** Export for saving. Call `markSaved()` only after the write is confirmed. */
  export(format: HwpFormat = this.format, password?: string): Uint8Array {
    this.settle()
    return this.doc.export(format, password)
  }

  /** Record that the current state is on disk. */
  markSaved(seq = this.changeSeq): void {
    this.savedSeq = seq
  }

  dispose(): void {
    this.settle()
    for (const e of [...this.undoStack, ...this.redoStack]) this.doc.discardSnapshot(e.snapshot)
    this.undoStack = []
    this.redoStack = []
    this.listeners.clear()
  }

  private trimHistory(): void {
    while (this.undoStack.length > this.historyLimit) {
      const old = this.undoStack.shift()!
      this.doc.discardSnapshot(old.snapshot)
    }
  }

  private emit(command: string, nodes: NodeId[], origin: ChangeOrigin): Change {
    const change: Change = { seq: this.changeSeq, command, nodes: [...new Set(nodes)], origin, selection: this.selection }
    for (const l of this.listeners) l(change)
    return change
  }
}
