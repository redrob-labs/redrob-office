import { describe, expect, it } from 'vitest'
import type { Slide } from '@genoffice/pptx-engine'
import { cleanLiveParagraphs, liveTextAddress, resolveLiveText } from '../src/main/live-address'
import { applyQueue } from '../src/renderer/live/useLiveShapes'

const sp = (id: string, cnv: number, type = 'text') => ({
  id,
  type,
  anchor: { originalXml: `<p:sp><p:nvSpPr><p:cNvPr id="${cnv}" name="Box ${cnv}"/></p:nvSpPr></p:sp>` },
})

function deck(): Slide[] {
  const group = {
    id: 'g1',
    type: 'group',
    anchor: { originalXml: '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="4" name="Group 4"/></p:nvGrpSpPr></p:grpSp>' },
    children: [{ id: 'c1', type: 'text', nvId: 12, anchor: { originalXml: '' } }],
  }
  return [
    { path: 'ppt/slides/slide1.xml', elements: [sp('a1', 2)] },
    { path: 'ppt/slides/slide7.xml', elements: [sp('b1', 3), group, sp('p1', 9, 'picture')] },
  ] as unknown as Slide[]
}

describe('live slides addresses', () => {
  it('names a box by slide part and cNvPr id, not the parse-time id', () => {
    expect(liveTextAddress(deck(), 0, 'a1')).toEqual({ slideId: 's_1', shapeId: 'e_2' })
    expect(liveTextAddress(deck(), 1, 'b1')).toEqual({ slideId: 's_7', shapeId: 'e_3' })
    expect(liveTextAddress(deck(), 1, 'c1', 'g1')).toEqual({ slideId: 's_7', shapeId: 'e_4>e_12' })
    expect(liveTextAddress(deck(), 3, 'a1')).toBeNull()
    expect(liveTextAddress(deck(), 0, 'missing')).toBeNull()
  })

  it('finds the same box in another copy whose slides moved', () => {
    const moved = deck().reverse()
    expect(resolveLiveText(moved, { slideId: 's_7', shapeId: 'e_3' })).toEqual({ slideIndex: 0, el: 'e_3' })
    expect(resolveLiveText(moved, { slideId: 's_7', shapeId: 'e_4>e_12' })).toEqual({ slideIndex: 0, el: 'e_12', group: 'e_4' })
    expect(resolveLiveText(moved, { slideId: 's_1', shapeId: 'e_2' })).toEqual({ slideIndex: 1, el: 'e_2' })
  })

  it('refuses what this copy does not have, or what is not a text box', () => {
    expect(resolveLiveText(deck(), { slideId: 's_9', shapeId: 'e_3' })).toBeNull()
    expect(resolveLiveText(deck(), { slideId: 's_7', shapeId: 'e_99' })).toBeNull()
    expect(resolveLiveText(deck(), { slideId: 's_7', shapeId: 'e_9' })).toBeNull()
    expect(resolveLiveText(deck(), { slideId: 's_7', shapeId: 'e_4>e_13' })).toBeNull()
    expect(resolveLiveText(deck(), { slideId: 's_7', shapeId: 'b1' })).toBeNull()
    expect(resolveLiveText(deck(), { slideId: '../x', shapeId: 'e_3' })).toBeNull()
  })

  it('accepts only arrays of plain objects as paragraphs', () => {
    expect(cleanLiveParagraphs([{ runs: [] }])).toEqual([{ runs: [] }])
    expect(cleanLiveParagraphs('x')).toBeNull()
    expect(cleanLiveParagraphs([1])).toBeNull()
    expect(cleanLiveParagraphs([[]])).toBeNull()
    expect(cleanLiveParagraphs(Array.from({ length: 5001 }, () => ({})))).toBeNull()
  })
})

describe('applying remote text boxes', () => {
  it('applies in order, skips what this copy lacks, and survives a failure', async () => {
    const calls: string[] = []
    const got: number[] = []
    const apply = applyQueue(
      {
        liveApplyText: async (edit) => {
          calls.push(edit.shapeId)
          if (edit.shapeId === 'e_bad') throw new Error('boom')
          if (edit.shapeId === 'e_gone') return null
          return { slideIndex: Number(edit.shapeId.slice(2)), slide: { nodes: [] } as never }
        },
      },
      (i) => got.push(i),
    )
    void apply([{ slideId: 's_1', shapeId: 'e_1', paragraphs: [] }, { slideId: 's_1', shapeId: 'e_bad', paragraphs: [] }])
    await apply([{ slideId: 's_1', shapeId: 'e_gone', paragraphs: [] }, { slideId: 's_1', shapeId: 'e_2', paragraphs: [] }])
    expect(calls).toEqual(['e_1', 'e_bad', 'e_gone', 'e_2'])
    expect(got).toEqual([1, 2])
  })
})
