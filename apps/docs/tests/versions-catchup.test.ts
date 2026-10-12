/**
 * @vitest-environment jsdom
 *
 * Version history behind the save status, and the catch-up on open.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionInfo } from '@genoffice/versions'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { CatchUp, catchUpLine } from '@genoffice/ui'
import { VersionHistory } from '@genoffice/ui'
import { collectRevisions } from '../src/renderer/versions/revisions'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)))

describe('collectRevisions', () => {
  it('reads every tracked insertion and deletion with its author and date', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'docParagraph',
            content: [
              { type: 'text', text: 'New York', marks: [{ type: 'del', attrs: { author: 'Jae', date: '2026-10-04T18:40:00Z' } }] },
              { type: 'text', text: 'Delaware', marks: [{ type: 'ins', attrs: { author: 'Jae', date: '2026-10-04T18:40:00Z' } }] },
              { type: 'text', text: ' law' },
            ],
          },
        ],
      },
    })
    const revs = collectRevisions(editor.state.doc)
    expect(revs.map((r) => [r.kind, r.author, r.date])).toEqual([
      ['del', 'Jae', '2026-10-04T18:40:00Z'],
      ['ins', 'Jae', '2026-10-04T18:40:00Z'],
    ])
    editor.destroy()
  })
})

describe('CatchUp', () => {
  it('says each change once with a Show me per line', () => {
    const onShow = vi.fn()
    const items = [
      { kind: 'comment' as const, author: 'Jae Gardner', text: 'Delaware?', commentId: '1', reply: false },
      { kind: 'suggestion' as const, author: 'Jae Gardner', count: 2, at: 4 },
      { kind: 'figures' as const, count: 1 },
    ]
    act(() => root.render(createElement(CatchUp, { since: '2026-10-04T16:20:00Z', items, onShow, onDismiss: vi.fn() })))
    expect([...host.querySelectorAll('li > span')].map((s) => s.textContent)).toEqual([
      'Jae Gardner commented: "Delaware?"',
      'Jae Gardner suggested 2 changes.',
      '1 linked figure waits for you.',
    ])
    const show = [...host.querySelectorAll('button')].filter((b) => b.textContent === 'Show me')
    expect(show).toHaveLength(3)
    act(() => show[1]!.click())
    expect(onShow).toHaveBeenCalledWith(items[1])
    expect(catchUpLine({ kind: 'suggestion', author: 'Seunghyun', count: 1, at: 0 })).toBe('Seunghyun suggested a change.')
  })
})

describe('VersionHistory', () => {
  const versions: VersionInfo[] = [
    { id: '00000000-0000-0000-0000-000000000002', at: '2026-10-05T10:02:00Z', by: 'felix', sha256: 'b'.repeat(64), size: 2 },
    { id: '00000000-0000-0000-0000-000000000001', at: '2026-09-21T16:20:00Z', by: 'felix', sha256: 'a'.repeat(64), size: 1, name: 'First draft' },
  ]

  it('lists newest first with Current, a named version, and Restore that opens a copy', async () => {
    const api = {
      listVersions: vi.fn(async () => versions),
      restoreVersion: vi.fn(async () => 'C:\\Docs\\NDA (version).docx'),
      nameVersion: vi.fn(async () => versions[0]!),
    }
    act(() => root.render(createElement(VersionHistory, { open: true, onClose: vi.fn(), path: 'C:\\Docs\\NDA.docx', fileName: 'NDA.docx', api })))
    await flush()
    const rows = [...document.querySelectorAll('.doc-versions__list li')]
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('Current')
    expect(rows[1]!.textContent).toContain('First draft')
    const restore = rows[1]!.querySelector('button')!
    await act(async () => restore.click())
    await flush()
    expect(api.restoreVersion).toHaveBeenCalledWith('C:\\Docs\\NDA.docx', versions[1]!.id)
    expect(document.body.textContent).toContain('A copy of this version opens beside the current one.')
  })

  it('says how to start the history before the first save', async () => {
    act(() => root.render(createElement(VersionHistory, { open: true, onClose: vi.fn(), path: null, fileName: '', api: undefined })))
    await flush()
    expect(document.body.textContent).toContain('Save once to start the history.')
  })
})
