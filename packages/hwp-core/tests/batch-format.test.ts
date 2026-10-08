// Formatting calls defer pagination in batch mode (Redrob engine change in
// document_core/commands/formatting.rs). Before it, applyCharFormat,
// applyParaFormat, setParaShapeId and applyStyle repaginated the whole section
// on every call even inside a batch: on a 763-page government document that is
// about 2 s per call, so one AI rewrite of a paragraph took 14 s.
//
// The guarantee pinned here: the same edits, batched or not, give the same
// pages and the same saved formatting.
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '../src/node'

beforeAll(() => initHwpCoreNode())

function doc(): HwpCoreDocument {
  const d = HwpCoreDocument.blank()
  const line = '대한민국은 민주공화국이다. 대한민국의 주권은 국민에게 있고, 모든 권력은 국민으로부터 나온다. '
  for (let i = 0; i < 60; i++) {
    d.insertText(0, i, 0, line.repeat(4))
    d.raw.splitParagraph(0, i, d.paragraphLength(0, i))
  }
  return d
}

function edits(d: HwpCoreDocument): void {
  const raw = d.raw
  // Bigger text and wider spacing push later paragraphs onto new pages.
  raw.applyCharFormat(0, 3, 0, d.paragraphLength(0, 3), JSON.stringify({ fontSize: 2400 }))
  raw.applyParaFormat(0, 10, JSON.stringify({ lineSpacingType: 'Percent', lineSpacing: 300 }))
  raw.applyStyle(0, 20, 2)
  raw.setParaShapeId(0, 30, Number(JSON.parse(raw.getParaPropertiesAt(0, 10)).paraShapeId))
}

const pages = (d: HwpCoreDocument) => Array.from({ length: d.pageCount() }, (_, i) => d.pageSvg(i))

describe('formatting in batch mode', () => {
  it('lands on the same pages and saves the same formatting as unbatched calls', () => {
    const direct = doc()
    edits(direct)
    const batched = doc()
    const before = batched.pageCount()
    batched.raw.beginBatch()
    edits(batched)
    batched.raw.endBatch()
    expect(batched.pageCount()).toBeGreaterThan(before)
    expect(batched.pageCount()).toBe(direct.pageCount())
    expect(pages(batched)).toEqual(pages(direct))
    const a = HwpCoreDocument.open(batched.export('hwpx'))
    const b = HwpCoreDocument.open(direct.export('hwpx'))
    for (const p of [3, 10, 20, 30]) {
      expect(a.charPropertiesAt(0, p, 1)).toEqual(b.charPropertiesAt(0, p, 1))
      expect(a.paraPropertiesAt(0, p)).toEqual(b.paraPropertiesAt(0, p))
    }
  })
})
