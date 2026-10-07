/**
 * @vitest-environment jsdom
 *
 * Live Markdown: two editors with the real Markdown schema bound to two
 * Y.Docs that relay to each other (as two computers do through the shell and
 * the sync service), and the properties block shared beside the text.
 */
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { historyCan, historyUndo, isRemoteChange, startCollab, type CollabHandle } from '@genoffice/live-text'
import { buildExtensions } from '../src/renderer/editor/extensions'
import { MD_TEXT_BLOCKS } from '../src/renderer/live/text-blocks'
import { bindFrontmatter } from '../src/renderer/live/frontmatter-sync'

const tick = () => new Promise((r) => setTimeout(r, 0))

const made: Array<{ editor: Editor; handle: CollabHandle | null }> = []
afterEach(() => {
  for (const m of made.splice(0)) {
    m.handle?.destroy()
    m.editor.destroy()
  }
})

function editorWith(md: string) {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({
    element,
    extensions: buildExtensions({
      slashController: { onOpen: () => {}, onUpdate: () => {}, onKeyDown: () => false, onClose: () => {} },
      slashItems: () => [],
    }),
    content: '',
  })
  if (md) editor.commands.setContent(md, { contentType: 'markdown' })
  const entry = { editor, handle: null as CollabHandle | null }
  made.push(entry)
  return entry
}

function relay(a: Y.Doc, b: Y.Doc) {
  a.on('update', (u: Uint8Array, origin: unknown) => origin !== 'relay' && Y.applyUpdate(b, u, 'relay'))
  b.on('update', (u: Uint8Array, origin: unknown) => origin !== 'relay' && Y.applyUpdate(a, u, 'relay'))
}

async function pair(opts: { readOnlyB?: boolean } = {}) {
  const docA = new Y.Doc()
  const docB = new Y.Doc()
  relay(docA, docB)
  const a = editorWith('# Launch plan\n\n- [ ] Book the venue\n\nBudget is **tight**.')
  const b = editorWith('')
  const bind = (e: { editor: Editor; handle: CollabHandle | null }, doc: Y.Doc, seed: boolean, readOnly: boolean) => {
    e.handle = startCollab({ editor: e.editor, doc, seed, readOnly, protectedBlocks: MD_TEXT_BLOCKS, onCursor: () => undefined })
  }
  bind(a, docA, true, false)
  bind(b, docB, false, !!opts.readOnlyB)
  await tick()
  await tick()
  return { a, b, docA, docB }
}

const md = (e: Editor) => e.getMarkdown().trim()
const endOfFirstBlock = (e: Editor) => e.state.doc.child(0).nodeSize - 1

describe('live Markdown', () => {
  it('the first writer seeds the shared text; the next person gets the same Markdown back', async () => {
    const { a, b } = await pair()
    expect(md(b.editor)).toBe(md(a.editor))
    expect(md(b.editor)).toContain('# Launch plan')
    expect(md(b.editor)).toContain('- [ ] Book the venue')
    expect(md(b.editor)).toContain('**tight**')
  })

  it("typing reaches the other editor as someone else's change, and undo takes back only one's own", async () => {
    const { a, b } = await pair()
    let remoteSeen = false
    b.editor.on('update', ({ transaction }) => {
      if (isRemoteChange(transaction)) remoteSeen = true
    })
    a.editor.chain().insertContentAt(endOfFirstBlock(a.editor), ' v2').run()
    await tick()
    expect(md(b.editor)).toContain('# Launch plan v2')
    expect(remoteSeen).toBe(true)
    b.editor.chain().insertContentAt(b.editor.state.doc.content.size - 1, ' Really.').run()
    await tick()
    expect(md(a.editor)).toContain('Really.')
    expect(historyCan(b.editor).canUndo).toBe(true)
    historyUndo(b.editor)
    await tick()
    // B's sentence is gone everywhere; A's heading edit stays
    expect(md(a.editor)).not.toContain('Really.')
    expect(md(b.editor)).toContain('# Launch plan v2')
  })

  it('a read-only person sees changes but cannot change the text', async () => {
    const { a, b } = await pair({ readOnlyB: true })
    b.editor.chain().insertContentAt(1, 'X').run()
    await tick()
    expect(md(a.editor)).not.toContain('XLaunch')
    a.editor.chain().insertContentAt(endOfFirstBlock(a.editor), '!').run()
    await tick()
    expect(md(b.editor)).toContain('# Launch plan!')
  })

  it("leaving the room gives the editor its own undo back", async () => {
    const { a } = await pair()
    a.handle!.destroy()
    a.handle = null
    const plugins = a.editor.state.plugins.map((p) => String((p as unknown as { key: string }).key))
    expect(plugins.some((k) => k.startsWith('history$'))).toBe(true)
    expect(plugins.some((k) => k.startsWith('y-sync'))).toBe(false)
  })
})

describe('shared properties block', () => {
  it('the first writer shares it, a later joiner takes it, and changes cross both ways without echo', () => {
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    relay(docA, docB)
    const onA = vi.fn()
    const onB = vi.fn()
    const a = bindFrontmatter(docA, { initial: 'title: Plan', seed: true, readOnly: false, onRemote: onA })
    const b = bindFrontmatter(docB, { initial: '', seed: false, readOnly: false, onRemote: onB })
    expect(onB).toHaveBeenCalledWith('title: Plan')
    a.push('title: Plan v2')
    expect(onB).toHaveBeenLastCalledWith('title: Plan v2')
    expect(onA).not.toHaveBeenCalled()
    b.push('title: Final')
    expect(onA).toHaveBeenLastCalledWith('title: Final')
    a.destroy()
    b.destroy()
  })

  it('a read-only person never writes it', () => {
    const doc = new Y.Doc()
    const map = doc.getMap<string>('markdown')
    const ro = bindFrontmatter(doc, { initial: '', seed: false, readOnly: true, onRemote: () => undefined })
    ro.push('title: Mine')
    expect(map.has('frontmatter')).toBe(false)
    ro.destroy()
  })
})
