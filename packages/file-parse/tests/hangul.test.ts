import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { parseFileToText } from '../src/index'

const fixture = (name: string) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url))

describe('parseFileToText: hwpx and hwp', () => {
  it('extracts body paragraphs and table cells from .hwpx', async () => {
    const r = await parseFileToText(fixture('sample.hwpx'))
    expect(r).toMatchObject({ ok: true, kind: 'text' })
    expect(r.text!.split('\n')).toEqual(['CELL', 'NEXT PARAGRAPH'])
  })

  it('reads a .hwp written by the engine, with tables as rows and headers once', async () => {
    initHwpCoreNode()
    const doc = HwpCoreDocument.blank()
    doc.insertText(0, 0, 0, '대한민국 헌법')
    doc.raw.splitParagraph(0, 0, doc.paragraphLength(0, 0))
    doc.raw.createTable(0, 1, 0, 2, 2)
    doc.raw.insertTextInCell(0, 1, 0, 0, 0, 0, '구분')
    doc.raw.insertTextInCell(0, 1, 0, 1, 0, 0, '값')
    doc.raw.insertTextInCell(0, 1, 0, 3, 0, 0, '1')
    doc.raw.createHeaderFooter(0, true, 0)
    doc.raw.insertTextInHeaderFooter(0, true, 0, 0, 0, '제1장')
    const dir = mkdtempSync(join(tmpdir(), 'fp-hwp-'))
    const path = join(dir, '헌법.hwp')
    writeFileSync(path, doc.export('hwp'))
    const r = await parseFileToText(path)
    expect(r.ok).toBe(true)
    const lines = r.text!.split('\n')
    expect(lines[0]).toBe('대한민국 헌법')
    expect(lines).toContain('구분\t값')
    expect(lines).toContain('\t1')
    expect(lines.filter((l) => l.includes('제1장'))).toEqual(['[머리말] 제1장'])
  })

  it('reports a damaged file as a failure, not as empty text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fp-hwp-'))
    const path = join(dir, 'broken.hwp')
    writeFileSync(path, 'not a hangul file')
    const r = await parseFileToText(path)
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })
})
