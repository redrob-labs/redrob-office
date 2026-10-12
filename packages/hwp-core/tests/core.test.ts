import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, HwpPasswordError, coreVersion, initHwpCoreNode } from '../src/node'

const SAMPLE_HWPX = join(__dirname, '../../../apps/hangul/tests/fixtures/sample.hwpx')

beforeAll(() => {
  initHwpCoreNode()
})

function bodyText(doc: HwpCoreDocument): string {
  const out: string[] = []
  for (let s = 0; s < doc.sectionCount(); s++) {
    for (let p = 0; p < doc.paragraphCount(s); p++) out.push(doc.text(s, p))
  }
  return out.join('\n')
}

describe('hwp-core', () => {
  it('reports the pinned engine version', () => {
    const record = JSON.parse(readFileSync(join(__dirname, '../provenance.json'), 'utf8'))
    expect(coreVersion()).toBe(record.upstream.tag.replace(/^v/, ''))
  })

  it('opens an HWPX file and reports its structure', () => {
    const doc = HwpCoreDocument.open(new Uint8Array(readFileSync(SAMPLE_HWPX)))
    expect(doc.sourceFormat()).toBe('hwpx')
    expect(doc.pageCount()).toBe(1)
    const info = doc.info()
    expect(info.sectionCount).toBe(1)
    expect(info.encrypted).toBe(false)
    const page = doc.pageInfo(0)
    // A4 at 96 dpi.
    expect(page.width).toBeCloseTo(793.7, 0)
    expect(page.height).toBeCloseTo(1122.5, 0)
    doc.dispose()
  })

  for (const format of ['hwp', 'hwpx'] as const) {
    it(`round-trips an edit through ${format}`, () => {
      const doc = HwpCoreDocument.blank()
      const r = doc.insertText(0, 0, 0, '대한민국 정부 문서')
      expect(r.ok).toBe(true)
      const bytes = doc.export(format)
      doc.dispose()

      const back = HwpCoreDocument.open(bytes)
      expect(back.sourceFormat()).toBe(format)
      expect(bodyText(back)).toContain('대한민국 정부 문서')
      back.dispose()
    })
  }

  it('hit-tests and measures a caret on the page', () => {
    const doc = HwpCoreDocument.blank()
    doc.insertText(0, 0, 0, '가나다')
    const caret = doc.cursorRect(0, 0, 0)
    expect(caret.pageIndex).toBe(0)
    expect(caret.height).toBeGreaterThan(0)
    const hit = doc.hitTest(0, caret.x + 1, caret.y + caret.height / 2)
    expect(hit.sectionIndex).toBe(0)
    expect(hit.paragraphIndex).toBe(0)
    doc.dispose()
  })

  it('restores a snapshot', () => {
    const doc = HwpCoreDocument.blank()
    doc.insertText(0, 0, 0, '처음')
    const snap = doc.saveSnapshot()
    doc.insertText(0, 0, 2, ' 그리고 나중')
    expect(doc.text(0, 0)).toBe('처음 그리고 나중')
    expect(doc.restoreSnapshot(snap).ok).toBe(true)
    expect(doc.text(0, 0)).toBe('처음')
    doc.discardSnapshot(snap)
    doc.dispose()
  })

  it('keeps password protection through save and rejects a wrong password', () => {
    const doc = HwpCoreDocument.blank()
    doc.insertText(0, 0, 0, '비공개')
    const bytes = doc.export('hwp', 'pa55word')
    doc.dispose()

    const opened = HwpCoreDocument.open(bytes, 'pa55word')
    expect(opened.info().encrypted).toBe(true)
    expect(bodyText(opened)).toContain('비공개')
    opened.dispose()

    expect(() => HwpCoreDocument.open(bytes, 'wrong')).toThrow(HwpPasswordError)
  })
})
