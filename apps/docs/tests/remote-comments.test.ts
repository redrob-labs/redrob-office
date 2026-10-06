/**
 * @vitest-environment jsdom
 *
 * Someone who may comment on a live file but not edit it: their comments go
 * through the sync service instead of changing the text or the local list.
 */
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { deleteComment, replyToComment, resolveComment, submitNewComment, type RemoteComments, type ReviewContext } from '../src/renderer/review-actions'

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((e) => e.destroy()))

function ctx(remote: RemoteComments | null) {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({
    element,
    extensions: editorExtensions,
    content: { type: 'doc', content: [{ type: 'docParagraph', content: [{ type: 'text', text: 'Net 30 days' }] }] } as never,
  })
  editors.push(editor)
  const c = {
    editor,
    comments: [{ id: '123456789', author: 'Kim', text: 'Thread' }],
    setComments: vi.fn(),
    setCommentsDirty: vi.fn(),
    setCommentComposing: vi.fn(),
    setStatus: vi.fn(),
    dirtyRef: { current: false },
    remoteComments: remote,
  }
  return c as unknown as ReviewContext & typeof c
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('comments through the service', () => {
  it('a new thread sends the selected range and leaves the text and the list alone', async () => {
    const remote = { add: vi.fn(async () => ({ ok: true as const })), reply: vi.fn(), resolve: vi.fn() }
    const c = ctx(remote)
    c.editor!.commands.setTextSelection({ from: 1, to: 7 })
    const before = JSON.stringify(c.editor!.getJSON())
    expect(submitNewComment(c, 'Is 30 right?')).toBeNull()
    expect(remote.add).toHaveBeenCalledWith('Is 30 right?', 1, 7)
    expect(JSON.stringify(c.editor!.getJSON())).toBe(before)
    expect(c.setComments).not.toHaveBeenCalled()
    expect(c.setCommentsDirty).not.toHaveBeenCalled()
    await flush()
    expect(c.setStatus).toHaveBeenCalled()
  })

  it('reply and resolve go to the service; a failure is shown; delete is refused', async () => {
    const remote = {
      add: vi.fn(),
      reply: vi.fn(async () => ({ ok: false as const, error: 'Your role on this file does not allow that.' })),
      resolve: vi.fn(async () => ({ ok: true as const })),
    }
    const c = ctx(remote)
    expect(replyToComment(c, '123456789', 'Agreed')).toBe(true)
    expect(remote.reply).toHaveBeenCalledWith('123456789', 'Agreed')
    resolveComment(c, '123456789', true)
    expect(remote.resolve).toHaveBeenCalledWith('123456789', true)
    await flush()
    expect(c.setStatus).toHaveBeenCalledWith('Your role on this file does not allow that.')
    deleteComment(c, '123456789')
    expect(c.setComments).not.toHaveBeenCalled()
  })

  it('without the service path, a comment marks the text as before', () => {
    const c = ctx(null)
    c.editor!.commands.setTextSelection({ from: 1, to: 7 })
    const id = submitNewComment(c, 'Local')
    expect(id).toBeTruthy()
    expect(c.setComments).toHaveBeenCalled()
  })
})
