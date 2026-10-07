import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/renderer/editor/extensions'
import { figureMarkdown, matchFigure } from '../src/renderer/editor/linkedFigure'
import { collectMdFigures } from '../src/renderer/linked/useMdLinkedFigures'

const editors: Editor[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
})

function createEditor(md: string): Editor {
  const editor = new Editor({
    extensions: buildExtensions({
      slashController: { onOpen: () => {}, onUpdate: () => {}, onKeyDown: () => false, onClose: () => {} },
      slashItems: () => [],
    }),
    content: '',
  })
  editor.commands.setContent(md, { contentType: 'markdown' })
  editors.push(editor)
  return editor
}

describe('linked figure markdown', () => {
  it('writes and reads the link form, escaping brackets in the text', () => {
    expect(figureMarkdown('q3-revenue', 'figures', '₩3.86bn')).toBe('[₩3.86bn](redrob-fact:q3-revenue)')
    expect(figureMarkdown('q3', 'sentence', 'grew [a lot]')).toBe('[grew \\[a lot\\]](redrob-fact:q3#sentence)')
    expect(matchFigure('[grew \\[a lot\\]](redrob-fact:q3#sentence) tail')).toEqual({
      raw: '[grew \\[a lot\\]](redrob-fact:q3#sentence)',
      fact: 'q3',
      part: 'sentence',
      text: 'grew [a lot]',
    })
    expect(matchFigure('[x](https://example.com)')).toBeNull()
    expect(matchFigure('[x](redrob-fact:bad id)')).toBeNull()
  })

  it('parses into figure atoms and survives a save', () => {
    const editor = createEditor('Revenue was [₩3.86bn](redrob-fact:q3-revenue), see [docs](https://example.com).\n\n[Revenue grew](redrob-fact:q3-revenue#sentence)')
    const figs = collectMdFigures(editor.state.doc)
    expect(figs.map((f) => [f.fact, f.part, f.text, f.where])).toEqual([
      ['q3-revenue', 'figures', '₩3.86bn', 'Paragraph 1'],
      ['q3-revenue', 'sentence', 'Revenue grew', 'Paragraph 2'],
    ])
    const md = editor.getMarkdown()
    expect(md).toContain('[₩3.86bn](redrob-fact:q3-revenue)')
    expect(md).toContain('[docs](https://example.com)')
    expect(md).toContain('[Revenue grew](redrob-fact:q3-revenue#sentence)')
  })

  it('reads as its text for word counts and the AI', () => {
    const editor = createEditor('Total [42](redrob-fact:total) units')
    expect(editor.state.doc.textContent.replace(/\s+/g, ' ')).toContain('Total')
    expect(editor.getText()).toContain('42')
  })
})
