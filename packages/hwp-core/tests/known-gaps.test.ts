// Known gaps in the engine, pinned so they can't change unnoticed.
// Each test states today's behaviour. When an engine extension fixes a gap,
// the test fails and is rewritten to assert the fix (spec E5, R3.3, R8.2).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '../src/node'

beforeAll(() => initHwpCoreNode())

describe('known gap: HWPX tracked changes (docs/decisions/2026-10-hangul-format-research.md, finding 3)', () => {
  // tracked-changes.hwpx is apps/hangul/tests/fixtures/sample.hwpx with one
  // insertion ("NEW") and one deletion ("OLD") marked the way OWPML defines
  // them: <hp:insertBegin/>…<hp:insertEnd/> and <hp:deleteBegin/>…<hp:deleteEnd/>
  // inside <hp:t>, and <hh:trackChanges>/<hh:trackChangeAuthors> in the header.
  const bytes = new Uint8Array(readFileSync(join(__dirname, 'fixtures/tracked-changes.hwpx')))

  it('the fixture really carries revision marks', async () => {
    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file('Contents/section0.xml')!.async('string')).toMatch(/<hp:deleteBegin [^>]*\/>OLD<hp:deleteEnd/)
    expect(await zip.file('Contents/header.xml')!.async('string')).toContain('<hh:trackChangeAuthor name="검토자"')
  })

  it('reads deleted text as ordinary text', () => {
    const doc = HwpCoreDocument.open(bytes)
    expect(doc.text(0, 1)).toBe('NEXT NEW OLDPARAGRAPH')
    doc.dispose()
  })

  it('drops the revision marks and the revision tables on save', async () => {
    const doc = HwpCoreDocument.open(bytes)
    const zip = await JSZip.loadAsync(doc.export('hwpx'))
    doc.dispose()
    const section = await zip.file('Contents/section0.xml')!.async('string')
    const header = await zip.file('Contents/header.xml')!.async('string')
    expect(section).not.toMatch(/insertBegin|deleteBegin/)
    expect(section).toContain('NEXT NEW OLDPARAGRAPH')
    expect(header).not.toMatch(/trackChanges|trackChangeAuthors/)
  })
})
