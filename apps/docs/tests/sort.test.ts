import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { canSortSelection, dateKey, numberKey, sortBlocks, sortSelection } from '../src/renderer/editor/sort'

interface JsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  text?: string
}

const para = (t: string, attrs: Record<string, unknown> = {}): JsonNode => ({
  type: 'docParagraph',
  attrs: { docxIndex: null, ...attrs },
  ...(t ? { content: [{ type: 'text', text: t }] } : {}),
})

function createEditor(content: JsonNode[]): Editor {
  return new Editor({ element: document.createElement('div'), extensions: editorExtensions, content: { type: 'doc', content } })
}

const texts = (editor: Editor) => {
  const out: string[] = []
  editor.state.doc.forEach((n) => out.push(n.textContent))
  return out
}

function selectAll(editor: Editor) {
  const size = editor.state.doc.content.size
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, size - 1)))
}

describe('sort keys', () => {
  it('reads the first number and a leading date', () => {
    expect(numberKey('Revenue 1,250 units')).toBe(1250)
    expect(numberKey('₩3.86bn')).toBe(3.86)
    expect(numberKey('−4 below')).toBe(-4)
    expect(numberKey('none')).toBeNull()
    expect(dateKey('2026-10-07 standup')).toBe(Date.UTC(2026, 9, 7))
    expect(dateKey('no date here')).toBeNull()
  })

  it('orders like Word: blanks first ascending, keyless last, stable on ties', () => {
    const items = ['b', '', 'A', 'a', 'c']
    expect(sortBlocks(items, (s) => s, { by: 'text', order: 'asc' })).toEqual(['', 'A', 'a', 'b', 'c'])
    expect(sortBlocks(items, (s) => s, { by: 'text', order: 'desc' })).toEqual(['c', 'b', 'A', 'a', ''])
    expect(sortBlocks(['item 10', 'item 9', 'none', 'item 2'], (s) => s, { by: 'number', order: 'asc' })).toEqual([
      'item 2',
      'item 9',
      'item 10',
      'none',
    ])
    expect(sortBlocks(['x 3', 'none', 'y 30'], (s) => s, { by: 'number', order: 'desc' })).toEqual(['y 30', 'x 3', 'none'])
  })
})

describe('sortSelection', () => {
  it('sorts the selected paragraphs in one undo step, keeping their formatting', () => {
    const editor = createEditor([para('pear', { align: 'center' }), para('apple'), para('fig')])
    selectAll(editor)
    expect(canSortSelection(editor)).toBe(true)
    expect(sortSelection(editor, { by: 'text', order: 'asc' })).toBe(true)
    expect(texts(editor)).toEqual(['apple', 'fig', 'pear'])
    expect(editor.state.doc.child(2).attrs.align).toBe('center')
    editor.commands.undo()
    expect(texts(editor)).toEqual(['pear', 'apple', 'fig'])
    editor.destroy()
  })

  it('only touches the selected run of paragraphs', () => {
    const editor = createEditor([para('z first'), para('c'), para('b'), para('a last')])
    const doc = editor.state.doc
    let from = 0
    let to = 0
    doc.forEach((n, pos, i) => {
      if (i === 1) from = pos + 1
      if (i === 2) to = pos + n.nodeSize - 1
    })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, from, to)))
    sortSelection(editor, { by: 'text', order: 'asc' })
    expect(texts(editor)).toEqual(['z first', 'b', 'c', 'a last'])
    editor.destroy()
  })

  it('refuses a single paragraph', () => {
    const editor = createEditor([para('only'), para('other')])
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)))
    expect(canSortSelection(editor)).toBe(false)
    expect(sortSelection(editor, { by: 'text', order: 'asc' })).toBe(false)
    expect(texts(editor)).toEqual(['only', 'other'])
    editor.destroy()
  })
})
