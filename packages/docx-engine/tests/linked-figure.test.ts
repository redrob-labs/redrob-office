import { describe, expect, it } from 'vitest'
import {
  generateParagraphXml,
  linkedFigureInstr,
  parseDocx,
  parseLinkedFigureInstr,
} from '../src/index'
import type { GenerateContext } from '../src/index'
import { buildDocx } from './helpers/build-docx'

const ctx: GenerateContext = { headingStyleIds: new Map(), allocateHyperlinkRel: () => 'rId1' }

const field = (instr: string, cached: string) =>
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  `<w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  `<w:r><w:t>${cached}</w:t></w:r>` +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>'

describe('linked figure instructions', () => {
  it('names the value and the sentence apart', () => {
    expect(linkedFigureInstr('q3-revenue')).toBe('DOCVARIABLE RedrobFact_q3-revenue \\* MERGEFORMAT')
    expect(parseLinkedFigureInstr(linkedFigureInstr('q3-revenue'))).toEqual({ fact: 'q3-revenue', part: 'figures' })
    expect(parseLinkedFigureInstr(linkedFigureInstr('q3', 'sentence'))).toEqual({ fact: 'q3', part: 'sentence' })
    expect(parseLinkedFigureInstr(' DOCVARIABLE RedrobFact_q3 ')).toEqual({ fact: 'q3', part: 'figures' })
  })

  it('refuses other fields and ids Word could not name', () => {
    expect(parseLinkedFigureInstr('DOCVARIABLE Client')).toBeNull()
    expect(parseLinkedFigureInstr('PAGE')).toBeNull()
    expect(() => linkedFigureInstr('has space')).toThrow()
    expect(() => linkedFigureInstr('')).toThrow()
  })
})

describe('linked figure round trip', () => {
  it('a paragraph with a linked figure stays editable, the figure an inline field run', async () => {
    const body = `<w:p><w:r><w:t xml:space="preserve">Q3 revenue was </w:t></w:r>${field(linkedFigureInstr('q3'), '₩3.86bn')}<w:r><w:t>.</w:t></w:r></w:p>`
    const doc = await parseDocx(await buildDocx({ bodyXml: body }))
    expect(doc.blocks[0]!.type).toBe('paragraph')
    const runs = doc.blocks[0]!.runs!
    expect(runs.map((r) => r.text)).toEqual(['Q3 revenue was ', '₩3.86bn', '.'])
    expect(parseLinkedFigureInstr(runs[1]!.instrField!)).toEqual({ fact: 'q3', part: 'figures' })
  })

  it('writes the figure back as the same field with the kept value as its result', async () => {
    const xml = generateParagraphXml(
      { type: 'paragraph', runs: [{ text: '₩3.90bn', instrField: linkedFigureInstr('q3') }] },
      ctx,
    )
    expect(xml).toContain('DOCVARIABLE RedrobFact_q3 \\* MERGEFORMAT')
    expect(xml).toContain('₩3.90bn')
    const doc = await parseDocx(await buildDocx({ bodyXml: xml }))
    expect(doc.blocks[0]!.runs![0]).toMatchObject({ text: '₩3.90bn' })
    expect(parseLinkedFigureInstr(doc.blocks[0]!.runs![0]!.instrField!)?.fact).toBe('q3')
  })

  it('any other DOCVARIABLE keeps the paragraph protected', async () => {
    const doc = await parseDocx(await buildDocx({ bodyXml: `<w:p>${field('DOCVARIABLE Client', 'Acme')}</w:p>` }))
    expect(doc.blocks[0]!.type).toBe('passthrough')
  })
})
