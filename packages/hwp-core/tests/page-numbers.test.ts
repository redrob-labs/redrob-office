// Page numbers continue across sections after an edit (Redrob engine fix in
// document_core/queries/rendering.rs, paginate_pass). Found by the edit
// scenarios (task 1.11): a page added to section 0 left section 1 with its
// old numbers until the file was reopened.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '../src/node'

beforeAll(() => initHwpCoreNode())

/** A two-section HWPX built from the repository's own sample. */
async function twoSections(): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(readFileSync(join(__dirname, '../../../apps/hangul/tests/fixtures/sample.hwpx')))
  const section = await zip.file('Contents/section0.xml')!.async('string')
  zip.file('Contents/section1.xml', section)
  const hpf = (await zip.file('Contents/content.hpf')!.async('string'))
    .replace('</opf:manifest>', '<opf:item id="section1" href="Contents/section1.xml" media-type="application/xml"/></opf:manifest>')
    .replace('</opf:spine>', '<opf:itemref idref="section1"/></opf:spine>')
  zip.file('Contents/content.hpf', hpf)
  const header = (await zip.file('Contents/header.xml')!.async('string')).replace('secCnt="1"', 'secCnt="2"')
  zip.file('Contents/header.xml', header)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

const numbers = (d: HwpCoreDocument) => Array.from({ length: d.pageCount() }, (_, k) => d.pageInfo(k).pageNumber)

describe('page numbers across sections after an edit', () => {
  it('section 1 renumbers when section 0 gains a page', async () => {
    const d = HwpCoreDocument.open(await twoSections())
    expect(d.sectionCount()).toBe(2)
    expect(numbers(d)).toEqual([1, 2])
    let p = 1
    for (let i = 0; i < 60; i++) {
      p = JSON.parse(d.raw.splitParagraph(0, p, d.paragraphLength(0, p))).paraIdx
      d.insertText(0, p, 0, `${i} 첫 구역이 한 쪽을 넘도록 길게 이어지는 문단입니다.`)
    }
    const pages = d.pageCount()
    expect(pages).toBeGreaterThan(2)
    const want = Array.from({ length: pages }, (_, k) => k + 1)
    expect(numbers(d)).toEqual(want)
    // and the saved file agrees
    expect(numbers(HwpCoreDocument.open(d.export('hwpx')))).toEqual(want)
  })
})
