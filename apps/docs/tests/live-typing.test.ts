/**
 * @vitest-environment jsdom
 *
 * Live typing: two editors bound to two Y.Docs that relay to each other,
 * the way two computers do through the shell and the sync service.
 */
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { CommentInfo } from '@genoffice/docx-engine'
import type { LiveCursor } from '@genoffice/sync-client'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { addCommentToRange, nextCommentId, setCommentIdSource } from '../src/renderer/editor/comments'
import { historyCan, historyUndo, isRemoteChange, startCollab, type CollabHandle } from '../src/renderer/live/collab'
import { bindComments, commentsFromMap, liveCommentId } from '../src/renderer/live/comments-sync'

const tick = () => new Promise((r) => setTimeout(r, 0))

const content = {
  type: 'doc',
  content: [
    { type: 'docParagraph', attrs: { docxIndex: 0 }, content: [{ type: 'text', text: 'Payment terms' }] },
    { type: 'docParagraph', attrs: { docxIndex: 1 }, content: [{ type: 'text', text: 'Net 30 days' }] },
  ],
}

const made: Array<{ editor: Editor; handle: CollabHandle | null }> = []
afterEach(() => {
  for (const m of made.splice(0)) {
    m.handle?.destroy()
    m.editor.destroy()
  }
  setCommentIdSource(null)
})

function editorWith(json: unknown) {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({ element, extensions: editorExtensions, content: json as never })
  const entry = { editor, handle: null as CollabHandle | null }
  made.push(entry)
  return entry
}

function relay(a: Y.Doc, b: Y.Doc) {
  a.on('update', (u: Uint8Array, origin: unknown) => origin !== 'relay' && Y.applyUpdate(b, u, 'relay'))
  b.on('update', (u: Uint8Array, origin: unknown) => origin !== 'relay' && Y.applyUpdate(a, u, 'relay'))
}

const textOf = (e: Editor) => e.state.doc.textContent
const endOf = (e: Editor, block: number) => {
  let pos = 0
  for (let i = 0; i <= block; i++) pos += e.state.doc.child(i).nodeSize
  return pos - 1
}

async function pair(opts: { readOnlyB?: boolean } = {}) {
  const docA = new Y.Doc()
  const docB = new Y.Doc()
  relay(docA, docB)
  const a = editorWith(content)
  const b = editorWith({ type: 'doc', content: [{ type: 'docParagraph' }] })
  const cursorsA: Array<LiveCursor | null> = []
  a.handle = startCollab({ editor: a.editor, doc: docA, seed: true, readOnly: false, onCursor: (c) => cursorsA.push(c) })
  b.handle = startCollab({ editor: b.editor, doc: docB, seed: false, readOnly: !!opts.readOnlyB, onCursor: () => undefined })
  await tick()
  await tick()
  return { a, b, docA, docB, cursorsA }
}

describe('live typing', () => {
  it('the first writer seeds the shared text and the next person sees it, attributes included', async () => {
    const { b } = await pair()
    expect(textOf(b.editor)).toBe('Payment termsNet 30 days')
    expect(b.editor.state.doc.child(1).attrs.docxIndex).toBe(1)
  })

  it("typing reaches the other editor, and it does not count as the other person's change", async () => {
    const { a, b } = await pair()
    let remoteSeen = false
    b.editor.on('update', ({ transaction }) => {
      if (isRemoteChange(transaction)) remoteSeen = true
    })
    a.editor.chain().insertContentAt(endOf(a.editor, 0), ' (revised)').run()
    await tick()
    expect(textOf(b.editor)).toBe('Payment terms (revised)Net 30 days')
    expect(remoteSeen).toBe(true)
  })

  it("undo takes back this person's own typing only", async () => {
    const { a, b } = await pair()
    b.editor.chain().insertContentAt(endOf(b.editor, 1), ' from invoice').run()
    await tick()
    a.editor.chain().insertContentAt(endOf(a.editor, 0), ' (revised)').run()
    await tick()
    expect(textOf(b.editor)).toBe('Payment terms (revised)Net 30 days from invoice')
    expect(historyCan(b.editor).canUndo).toBe(true)
    historyUndo(b.editor)
    await tick()
    expect(textOf(b.editor)).toBe('Payment terms (revised)Net 30 days')
    expect(textOf(a.editor)).toBe('Payment terms (revised)Net 30 days')
  })

  it('a read-only person sees changes but cannot type', async () => {
    const { a, b } = await pair({ readOnlyB: true })
    b.editor.chain().insertContentAt(endOf(b.editor, 0), ' sneaky').run()
    expect(textOf(b.editor)).toBe('Payment termsNet 30 days')
    a.editor.chain().insertContentAt(endOf(a.editor, 0), '!').run()
    await tick()
    expect(textOf(b.editor)).toBe('Payment terms!Net 30 days')
  })

  it("shows the other person's caret where their cursor says", async () => {
    const { a, b, cursorsA } = await pair()
    // jsdom never reports focus; the caret is only shared while the editor has it
    a.editor.view.hasFocus = () => true
    a.editor.commands.setTextSelection(3)
    // yCursorPlugin writes the caret on view updates while focused; nudge one
    a.editor.view.dispatch(a.editor.state.tr.setMeta('addToHistory', false))
    await tick()
    const cursor = cursorsA.filter(Boolean).at(-1)
    expect(cursor).toBeTruthy()
    b.handle!.setPeers([{ clientId: 4242, id: 'kim', name: 'Kim', at: null, cursor: cursor! }])
    await tick()
    const caret = b.editor.view.dom.querySelector('.docs-peer-caret')
    expect(caret?.textContent).toBe('Kim')
    expect(caret?.className).toMatch(/docs-peer--[1-6]/)
    b.handle!.setPeers([])
    await tick()
    expect(b.editor.view.dom.querySelector('.docs-peer-caret')).toBeNull()
  })

  it('leaving puts the local history back', async () => {
    const { a } = await pair()
    a.handle!.destroy()
    a.handle = null
    const has = a.editor.state.plugins.some((p) => String((p as unknown as { key: string }).key).startsWith('history$'))
    expect(has).toBe(true)
    a.editor.chain().insertContentAt(1, 'X').run()
    expect(historyCan(a.editor).canUndo).toBe(true)
  })
})

describe('live comments', () => {
  const c1: CommentInfo = { id: '1', author: 'Kim', date: '2026-10-04T10:00:00Z', text: 'Delaware?' }

  it('a comment and its resolution reach the other person; an empty map takes the first list', () => {
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    relay(docA, docB)
    const seenB: CommentInfo[][] = []
    const a = bindComments(docA, { initial: [c1], seed: true, onRemote: () => undefined })
    const b = bindComments(docB, { initial: [], seed: false, onRemote: (l) => seenB.push(l) })
    expect(seenB.at(-1)).toEqual([c1])
    a.push([{ ...c1, done: true }, { id: '2', author: 'Kim', text: 'Fixed', parentId: '1' }])
    expect(seenB.at(-1)).toEqual([
      { ...c1, done: true },
      { id: '2', author: 'Kim', text: 'Fixed', parentId: '1' },
    ])
    // pushing the same list again changes nothing
    const before = seenB.length
    b.push(seenB.at(-1)!)
    expect(seenB.length).toBe(before)
    a.push([])
    expect(commentsFromMap(docB.getMap('comments'))).toEqual([])
    a.destroy()
    b.destroy()
  })

  it("a commenter's thread, written by the service with an anchor, is marked in the text by a view that may edit", async () => {
    const { a, b, docA, docB } = await pair({ readOnlyB: true })
    // the commenter picks "Net 30" in their read-only view; the anchor travels as relative positions
    const start = a.editor.state.doc.child(0).nodeSize + 1
    const anchor = b.handle!.toShared(start, start + 6)!
    expect(anchor).toBeTruthy()
    const seenA: CommentInfo[][] = []
    const bindA = bindComments(docA, {
      initial: [],
      seed: false,
      onRemote: (l) => seenA.push(l),
      materialise: (id, at) => {
        const range = a.handle!.fromShared(at)
        return !!range && addCommentToRange(a.editor, id, range.from, range.to)
      },
    })
    // what the service writes into the shared document for the commenter
    docB.getMap('comments').set('123456789', { id: '123456789', author: 'Jae', authorSub: 'jae', text: 'Is 30 right?', date: 'x', anchor })
    await tick()
    await tick()
    expect(seenA.at(-1)).toEqual([{ id: '123456789', author: 'Jae', text: 'Is 30 right?', date: 'x' }])
    const marked = (e: Editor) => {
      let text = ''
      e.state.doc.descendants((n) => {
        if (n.isText && n.marks.some((m) => m.type.name === 'comment' && String(m.attrs.ids).split(' ').includes('123456789'))) text += n.text
      })
      return text
    }
    expect(marked(a.editor)).toBe('Net 30')
    expect(marked(b.editor)).toBe('Net 30')
    const entry = docB.getMap<Record<string, unknown>>('comments').get('123456789')!
    expect(entry.anchor).toBeUndefined()
    // a later push of the writer's own list keeps who wrote it
    bindA.push([{ id: '123456789', author: 'Jae', text: 'Is 30 right?', date: 'x', done: true }])
    expect(docB.getMap<Record<string, unknown>>('comments').get('123456789')).toMatchObject({ authorSub: 'jae', done: true })
    bindA.destroy()
  })

  it('live comment ids are nine digits and never one already taken', () => {
    let n = 0
    const rolls = [0, 0, 0.5]
    const id = liveCommentId([{ id: '100000000', author: '', text: '' }], () => rolls[n++]!)
    expect(id).toBe(String(100_000_000 + Math.floor(0.5 * 899_999_999)))
    setCommentIdSource(() => '777')
    expect(nextCommentId([c1])).toBe('777')
    setCommentIdSource(null)
    expect(nextCommentId([c1])).toBe('2')
  })
})
