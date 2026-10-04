/**
 * @vitest-environment jsdom
 *
 * Linked figures in Docs: a DOCVARIABLE field opens as an atom, saves back as
 * the same field, follows what the file keeps, and keeps the index in step.
 */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { linkedFigureInstr, parseDocx, parseLinkedFigureInstr, saveDocx } from '@genoffice/docx-engine'
import { emptyFactsState, factsReducer, type FactsAction, type FactsState } from '@genoffice/facts'
import { buildDocx } from '../../../packages/docx-engine/tests/helpers/build-docx'
import { blocksToPmDoc, pmDocToSavePlan, type PmNode } from '../src/renderer/editor/convert'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { collectFigures, figureCss, figureRewrites, syncUsesCommands } from '../src/renderer/linked/figures'

const MEMO = '/b/memo.docx'
const FORECAST = '/b/forecast.xlsx'

const field = (instr: string, cached: string) =>
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  `<w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  `<w:r><w:rPr><w:b/></w:rPr><w:t>${cached}</w:t></w:r>` +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>'

const BODY =
  `<w:p><w:r><w:t xml:space="preserve">Q3 revenue was </w:t></w:r>${field(linkedFigureInstr('q3'), '₩3.86bn')}<w:r><w:t>.</w:t></w:r></w:p>` +
  `<w:p>${field(linkedFigureInstr('q3', 'sentence'), 'Revenue grew by about a fifth on Q2')}</w:p>`

function world(): FactsState {
  const actions: FactsAction[] = [
    {
      type: 'defineFact',
      value: 3.86,
      fact: {
        id: 'q3',
        label: 'Q3 revenue',
        source: { file: FORECAST, ref: 'Summary!C2' },
        display: { prefix: '₩', suffix: 'bn', decimals: 2 },
        bands: [{ below: 4, words: 'Revenue grew by about a fifth on Q2' }, { words: 'Revenue grew by almost a third on Q2' }],
      },
    },
    { type: 'useFact', file: FORECAST, use: { fact: 'q3', kind: 'value', where: 'Summary!C2' } },
  ]
  return actions.reduce(factsReducer, emptyFactsState())
}

async function open() {
  const parsed = await parseDocx(await buildDocx({ bodyXml: BODY }))
  const editor = new Editor({ element: document.createElement('div'), extensions: editorExtensions })
  editor.commands.setContent(blocksToPmDoc(parsed.blocks) as never)
  return { parsed, editor }
}

describe('Docs linked figures', () => {
  it('opens each field as a linked figure atom with its cached text', async () => {
    const { editor } = await open()
    const figs = collectFigures(editor.state.doc)
    expect(figs.map((f) => [f.fact, f.part, f.text, f.paragraph])).toEqual([
      ['q3', 'figures', '₩3.86bn', 1],
      ['q3', 'sentence', 'Revenue grew by about a fifth on Q2', 2],
    ])
    expect(editor.state.doc.nodeAt(figs[0]!.pos)?.type.name).toBe('docLinkedFigure')
    expect(editor.view.dom.querySelector('.doc-fig[data-linked-fact="q3"]')?.textContent).toBe('₩3.86bn')
    editor.destroy()
  })

  it('an untouched document saves with no changed blocks', async () => {
    const { parsed, editor } = await open()
    const plan = pmDocToSavePlan(editor.getJSON() as PmNode, parsed.blocks)
    expect(plan.changedCount).toBe(0)
    editor.destroy()
  })

  it('a rewritten figure saves as the same field with the new result, keeping its formatting', async () => {
    const { parsed, editor } = await open()
    let s = world()
    s = factsReducer(s, { type: 'useFact', file: MEMO, use: { fact: 'q3', kind: 'value', where: 'Paragraph 1' } })
    s = factsReducer(s, { type: 'useFact', file: MEMO, use: { fact: 'q3', kind: 'sentence', where: 'Paragraph 2' } })
    s = factsReducer(s, { type: 'editSource', fact: 'q3', file: FORECAST, to: 4.1, by: 'felix', at: 'now', id: 'u1' })
    // waiting: nothing rewrites yet
    expect(figureRewrites(s, MEMO, collectFigures(editor.state.doc))).toEqual([])
    s = factsReducer(s, { type: 'keepFile', update: 'u1', file: MEMO })
    s = factsReducer(s, { type: 'keepSentence', update: 'u1', file: MEMO })
    const rewrites = figureRewrites(s, MEMO, collectFigures(editor.state.doc))
    expect(rewrites.map((r) => r.text)).toEqual(['₩4.10bn', 'Revenue grew by almost a third on Q2'])
    let tr = editor.state.tr
    for (const r of rewrites) tr = tr.setNodeMarkup(r.pos, undefined, { ...tr.doc.nodeAt(r.pos)!.attrs, text: r.text })
    editor.view.dispatch(tr)

    const plan = pmDocToSavePlan(editor.getJSON() as PmNode, parsed.blocks)
    const saved = await saveDocx(parsed, plan.saveBlocks)
    const re = await parseDocx(saved)
    const run = re.blocks[0]!.runs!.find((r) => r.instrField)!
    expect(run.text).toBe('₩4.10bn')
    expect(run.bold).toBe(true)
    expect(parseLinkedFigureInstr(run.instrField!)).toEqual({ fact: 'q3', part: 'figures' })
    const sentence = re.blocks[1]!.runs!.find((r) => r.instrField)!
    expect(sentence.text).toBe('Revenue grew by almost a third on Q2')
    editor.destroy()
  })

  it('syncs the index to the file: a use per figure, a drop for one that went', async () => {
    const { editor } = await open()
    let s = world()
    s = factsReducer(s, { type: 'useFact', file: MEMO, use: { fact: 'q3', kind: 'value', where: 'Paragraph 9' } })
    const cmds = syncUsesCommands(s, MEMO, collectFigures(editor.state.doc))
    expect(cmds).toEqual([
      { type: 'dropUse', file: MEMO, fact: 'q3', where: 'Paragraph 9' },
      { type: 'useFact', file: MEMO, use: { fact: 'q3', kind: 'value', where: 'Paragraph 1' } },
      { type: 'useFact', file: MEMO, use: { fact: 'q3', kind: 'sentence', where: 'Paragraph 2' } },
    ])
    for (const c of cmds) s = factsReducer(s, c as FactsAction)
    expect(syncUsesCommands(s, MEMO, collectFigures(editor.state.doc))).toEqual([])
    // a fact the index does not know is left alone
    expect(syncUsesCommands(emptyFactsState(), MEMO, collectFigures(editor.state.doc))).toEqual([])
    editor.destroy()
  })

  it('styles a waiting figure and an out-of-date one from paper tokens only', async () => {
    const { editor } = await open()
    let s = world()
    s = factsReducer(s, { type: 'useFact', file: MEMO, use: { fact: 'q3', kind: 'value', where: 'Paragraph 1' } })
    const figs = collectFigures(editor.state.doc)
    expect(figureCss(s, MEMO, figs)).toBe('')
    s = factsReducer(s, { type: 'editSource', fact: 'q3', file: FORECAST, to: 3.9, by: 'felix', at: 'now', id: 'u1' })
    expect(figureCss(s, MEMO, figs)).toContain('--docs-paper-fig-wait-bg')
    s = factsReducer(s, { type: 'keepOld', update: 'u1', file: MEMO })
    const css = figureCss(s, MEMO, figs)
    expect(css).toContain('--docs-paper-fig-stale-line')
    expect(css).not.toMatch(/--(surface|ink|status|action)-/)
    editor.destroy()
  })
})
