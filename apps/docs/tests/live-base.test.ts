/**
 * @vitest-environment jsdom
 *
 * Live typing keeps every person's original bytes on the version the shared
 * text is based on.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { prosemirrorToYXmlFragment } from 'y-prosemirror'
import { editorExtensions } from '../src/renderer/editor/extensions'
import type { LiveState } from '../src/renderer/live/useLive'
import { useLiveText, type LiveTextDeps } from '../src/renderer/live/useLiveText'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let editor: Editor
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: { type: 'doc', content: [{ type: 'docParagraph', content: [{ type: 'text', text: 'Mine' }] }] },
  })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  editor.destroy()
})

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)))
const FILE = '11111111-2222-4333-8444-555555555555'
const latest = new Uint8Array([9, 9])

function deps(doc: Y.Doc, over: Partial<LiveTextDeps> = {}, liveOver: Partial<Extract<LiveState, { kind: 'live' }>> = {}): LiveTextDeps {
  return {
    editor,
    live: { kind: 'live', fileId: FILE, role: 'edit', readOnly: false, version: 2, doc, ...liveOver },
    peers: [],
    api: { livePull: vi.fn(async () => ({ ok: true as const, bytes: latest, version: 5 })), livePresence: vi.fn() },
    path: 'C:\\x\\Plan.docx',
    loadBytes: vi.fn(async () => true),
    rebaseParsed: vi.fn(async () => true),
    comments: { get: () => [], set: vi.fn(), markDirty: vi.fn() },
    setStatus: vi.fn(),
    ...over,
  }
}

let seen: ReturnType<typeof useLiveText> | null = null
function Probe(props: LiveTextDeps) {
  seen = useLiveText(props)
  return null
}

describe('live base version', () => {
  it('the first writer in an empty room loads the latest shared bytes, seeds and records their version', async () => {
    const doc = new Y.Doc()
    const d = deps(doc)
    act(() => root.render(createElement(Probe, d)))
    await flush()
    await flush()
    expect(d.loadBytes).toHaveBeenCalledWith(latest)
    expect(d.rebaseParsed).not.toHaveBeenCalled()
    expect(doc.getMap('meta').get('base')).toBe(5)
    expect(doc.getXmlFragment('prosemirror').length).toBeGreaterThan(0)
    expect(seen!.status).toBe('on')
  })

  it('a later person on an older version re-parses the base bytes and keeps the shared text', async () => {
    const doc = new Y.Doc()
    const other = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: { type: 'doc', content: [{ type: 'docParagraph', content: [{ type: 'text', text: 'Shared' }] }] },
    })
    prosemirrorToYXmlFragment(other.state.doc, doc.getXmlFragment('prosemirror'))
    doc.getMap('meta').set('base', 5)
    other.destroy()
    const d = deps(doc)
    act(() => root.render(createElement(Probe, d)))
    await flush()
    await flush()
    expect(d.rebaseParsed).toHaveBeenCalledWith(latest)
    expect(d.loadBytes).not.toHaveBeenCalled()
    expect(editor.state.doc.textContent).toBe('Shared')
  })

  it('a save elsewhere moves the base, and this view rebases onto it', async () => {
    const doc = new Y.Doc()
    const d = deps(doc, { api: { livePull: vi.fn(async () => ({ ok: true as const, bytes: latest, version: 2 })), livePresence: vi.fn() } })
    act(() => root.render(createElement(Probe, d)))
    await flush()
    await flush()
    expect(d.loadBytes).not.toHaveBeenCalled()
    expect(doc.getMap('meta').get('base')).toBe(2)
    ;(d.api!.livePull as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, bytes: latest, version: 3 })
    // the base set by the room, as another computer's save makes it
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc))
    remote.getMap('meta').set('base', 3)
    await act(async () => Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'room'))
    await flush()
    expect(d.rebaseParsed).toHaveBeenCalledWith(latest)
    expect(d.setStatus).toHaveBeenCalledWith('Updated to the latest shared version.')
  })

  it('a viewer in an empty room does not seed', async () => {
    const doc = new Y.Doc()
    const d = deps(doc, {}, { readOnly: true, role: 'view' })
    act(() => root.render(createElement(Probe, d)))
    await flush()
    expect(doc.getXmlFragment('prosemirror').length).toBe(0)
    expect(seen!.status).toBe('off')
  })
})
