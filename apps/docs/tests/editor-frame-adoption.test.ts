/**
 * @vitest-environment jsdom
 *
 * Docs in the shared EditorFrame (handoff 02-document-nda): the simplified
 * toolbar's commands, the tools the title bar search runs, and the wiring
 * that puts Redrob on the right in place of the old left-hand dock.
 */
import { Editor } from '@tiptap/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { docsCommands, docsTools } from '../src/renderer/components/SimpleToolbar'
import type { TFunc } from '../src/renderer/i18n/locale'

function editorWith(text: string): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [{ type: 'docParagraph', attrs: { docxIndex: null }, content: [{ type: 'text', text }] }],
    },
  })
}

const t = ((k: string) => k) as unknown as TFunc

describe('the simplified toolbar commands', () => {
  it('bold, a heading and a bulleted list act on the selection', () => {
    const editor = editorWith('Mutual NDA')
    editor.commands.selectAll()
    const cmd = docsCommands(editor, () => '7', [])
    cmd.bold()
    expect(editor.isActive('bold')).toBe(true)
    cmd.style('h1')
    expect(editor.isActive('docHeading')).toBe(true)
    cmd.style('p')
    cmd.bullets()
    expect(editor.isActive('docListItem', { kind: 'bullet' })).toBe(true)
    // a second press turns the list back into a paragraph
    cmd.bullets()
    expect(editor.isActive('docListItem')).toBe(false)
    editor.destroy()
  })

  it('reuses the numbering an existing list already has', () => {
    const editor = editorWith('Item')
    editor.commands.selectAll()
    const allocate = vi.fn(() => 'new')
    const cmd = docsCommands(editor, allocate, [
      { id: 'b', type: 'listItem', docxIndex: 0, originalXml: null, list: { kind: 'ordered', numId: '3', ilvl: 0 } },
    ])
    cmd.numbering()
    expect(allocate).not.toHaveBeenCalled()
    let numId: unknown
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'docListItem') numId = n.attrs.numId
    })
    expect(numId).toBe('3')
    editor.destroy()
  })

  it('sets the size in half-points on the text style mark', () => {
    const editor = editorWith('Body')
    editor.commands.selectAll()
    docsCommands(editor, () => null, []).size(10.5)
    expect(editor.getAttributes('docTextStyle').sizeHalfPoints).toBe(21)
    editor.destroy()
  })
})

describe('the title bar search', () => {
  const redrob = { ask: vi.fn(), run: vi.fn(), comment: vi.fn() }
  const editor = editorWith('x')
  const cmd = docsCommands(editor, () => null, [])

  it('lists every simplified-toolbar command by name', () => {
    const ids = docsTools(t, cmd, redrob, true).map((tool) => tool.id)
    for (const id of ['ask', 'summarize', 'risks', 'polish', 'bold', 'italic', 'bullets', 'numbering', 'h1', 'comment']) {
      expect(ids).toContain(id)
    }
  })

  it('runs Redrob requests through the panel', () => {
    const summarize = docsTools(t, cmd, redrob, true).find((tool) => tool.id === 'summarize')!
    summarize.run()
    expect(redrob.run).toHaveBeenCalledWith('appSimpleSummarizePrompt')
  })

  it('leaves editing commands out while the file cannot be edited (Viewing)', () => {
    const tools = docsTools(t, cmd, redrob, false)
    expect(tools.find((x) => x.id === 'bold')!.disabled).toBe(true)
    expect(tools.find((x) => x.id === 'summarize')!.disabled).toBeFalsy()
  })
})

describe('App wiring', () => {
  const app = readFileSync(join(__dirname, '../src/renderer/App.tsx'), 'utf8')

  it('hosts the editor in the shared EditorFrame, ribbon as Classic', () => {
    expect(app).toContain('<EditorFrame')
    expect(app).toMatch(/classicToolbar=\{\s*<Ribbon/)
    expect(app).toContain('<SimpleToolbar')
  })

  it('puts the Redrob panel in the frame on the right, no longer the left dock', () => {
    expect(app).not.toContain('className={`ai-dock')
    // the panel slot holds the catch-up (when there is one) above the Redrob panel
    expect(app).toMatch(/panel=\{\s*doc \? \(\s*<div className="doc-panel-stack">[\s\S]{0,400}?<AiPanel/)
    expect(app).toContain('hosted')
  })

  it('offers a .docx copy for an older .doc and never overwrites it', () => {
    expect(app).toContain('<OldFormatBanner')
    expect(app).toContain('onSaveCopy={() => void save(true)}')
  })
})
