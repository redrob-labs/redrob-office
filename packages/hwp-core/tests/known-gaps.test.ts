// HWPX tracked changes survive open, edit and save (spec E5a, task 4.0, R3.3).
//
// This file pinned the loss until E5a landed (docs/decisions/2026-10-hangul-
// format-research.md, finding 3): the parser dropped <hp:insertBegin>…
// <hp:deleteEnd> inside <hp:t>, and the serializer wrote neither the marks nor
// the header's revision tables. It now asserts preservation. What is still a
// gap is pinned at the end: deleted text reads as ordinary text (showing,
// accepting and rejecting revisions is E5b, task 4.3).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '../src/node'

beforeAll(() => initHwpCoreNode())

// tracked-changes.hwpx is apps/hangul/tests/fixtures/sample.hwpx with one
// insertion ("NEW") and one deletion ("OLD") marked the way OWPML defines
// them: <hp:insertBegin/>…<hp:insertEnd/> and <hp:deleteBegin/>…<hp:deleteEnd/>
// inside <hp:t>, and <hh:trackChanges>/<hh:trackChangeAuthors> in the header.
const bytes = new Uint8Array(readFileSync(join(__dirname, 'fixtures/tracked-changes.hwpx')))

const INS_B = '<hp:insertBegin Id="1" TcId="1"/>'
const INS_E = '<hp:insertEnd Id="1" TcId="1" paraend="0"/>'
const DEL_B = '<hp:deleteBegin Id="2" TcId="2"/>'
const DEL_E = '<hp:deleteEnd Id="2" TcId="2" paraend="0"/>'

async function parts(b: Uint8Array): Promise<{ section: string; header: string }> {
  const zip = await JSZip.loadAsync(b)
  return { section: await zip.file('Contents/section0.xml')!.async('string'), header: await zip.file('Contents/header.xml')!.async('string') }
}

/** The body text of section 0 with revision marks kept as tags and everything else stripped. */
function marked(section: string): string {
  const texts = [...section.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => m[1]!)
  return texts.join('').replace(/<(?!\/?hp:(?:insert|delete))[^>]+>/g, '')
}

describe('E5a: HWPX tracked changes are preserved', () => {
  it('the fixture really carries revision marks', async () => {
    const { section, header } = await parts(bytes)
    expect(section).toContain(`${DEL_B}OLD${DEL_E}`)
    expect(header).toContain('<hh:trackChangeAuthor name="검토자"')
  })

  it('a save without edits writes every mark back where it was, and the revision tables', async () => {
    const doc = HwpCoreDocument.open(bytes)
    const { section, header } = await parts(doc.export('hwpx'))
    doc.dispose()
    expect(marked(section)).toContain(`NEXT ${INS_B}NEW${INS_E} ${DEL_B}OLD${DEL_E}PARAGRAPH`)
    expect(header).toContain('<hh:trackChanges itemCnt="2"><hh:trackChange type="Insert" date="2026-10-06T09:00:00Z" authorID="1" hide="0" id="1"/>')
    expect(header).toContain('<hh:trackChangeAuthors itemCnt="1"><hh:trackChangeAuthor name="검토자" mark="1" color="#FF0000" id="1"/></hh:trackChangeAuthors>')
    // The tables sit inside refList, after the other resource tables.
    expect(header.indexOf('<hh:trackChanges')).toBeLessThan(header.indexOf('</hh:refList>'))
    expect(header.indexOf('<hh:trackChanges')).toBeGreaterThan(header.indexOf('</hh:styles>'))
  })

  it('marks follow typing before them, and an edit between them stays inside', async () => {
    const doc = HwpCoreDocument.open(bytes)
    doc.insertText(0, 1, 0, '[앞] ') // before every mark
    doc.insertText(0, 1, [...'[앞] NEXT NE'].length, 'W-') // inside the insertion
    const { section } = await parts(doc.export('hwpx'))
    doc.dispose()
    expect(marked(section)).toContain(`[앞] NEXT ${INS_B}NEW-W${INS_E} ${DEL_B}OLD${DEL_E}PARAGRAPH`)
  })

  it('a split between the two revisions keeps each mark pair with its text', async () => {
    const doc = HwpCoreDocument.open(bytes)
    doc.raw.splitParagraph(0, 1, 'NEXT NEW '.length)
    expect(doc.text(0, 1)).toBe('NEXT NEW ')
    expect(doc.text(0, 2)).toBe('OLDPARAGRAPH')
    const { section } = await parts(doc.export('hwpx'))
    const back = HwpCoreDocument.open(doc.export('hwpx'))
    doc.dispose()
    const m = marked(section)
    expect(m).toContain(`NEXT ${INS_B}NEW${INS_E} `)
    expect(m).toContain(`${DEL_B}OLD${DEL_E}PARAGRAPH`)
    // and the split document reopens with the same text
    expect([back.text(0, 1), back.text(0, 2)]).toEqual(['NEXT NEW ', 'OLDPARAGRAPH'])
    back.dispose()
  })

  it('a second save of a saved file is byte-stable in the marked text', async () => {
    const once = HwpCoreDocument.open(bytes)
    const first = once.export('hwpx')
    once.dispose()
    const twice = HwpCoreDocument.open(first)
    const second = twice.export('hwpx')
    twice.dispose()
    expect(marked((await parts(second)).section)).toBe(marked((await parts(first)).section))
    expect((await parts(second)).header).toContain('<hh:trackChangeAuthors')
  })
})

describe('still a gap until E5b (task 4.3)', () => {
  it('deleted text reads as ordinary text', () => {
    const doc = HwpCoreDocument.open(bytes)
    expect(doc.text(0, 1)).toBe('NEXT NEW OLDPARAGRAPH')
    doc.dispose()
  })
})
