import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { PDFDocument, rgb } from 'pdf-lib'
import {
  CorpusError,
  buildReport,
  classify,
  diffDocument,
  diffPage,
  entryPath,
  parseHancomOutput,
  rasterizePdf,
  roundTripBytes,
  roundTripFile,
  validateManifest,
  writeSyntheticCorpus,
  type Bitmap,
} from '../src'

beforeAll(() => initHwpCoreNode())

function solid(width: number, height: number, v = 255): Bitmap {
  return { width, height, data: new Uint8Array(width * height * 4).fill(v) }
}

describe('corpus manifest', () => {
  it('accepts a valid manifest', () => {
    const c = validateManifest({ entries: [{ id: 'gov-form-1', file: 'a.hwp', format: 'hwp', tags: ['table'], source: 'https://example.go.kr', permission: 'public' }] }, '/c')
    expect(c.entries[0]!.tags).toEqual(['table'])
    expect(entryPath(c, c.entries[0]!)).toBe('/c/a.hwp')
  })

  it.each([
    [{}, /entries/],
    [{ entries: [{ id: 'X', file: 'a', format: 'hwp', source: 's', permission: 'p' }] }, /lower-case/],
    [{ entries: [{ id: 'a', file: 'a', format: 'doc', source: 's', permission: 'p' }] }, /format/],
    [{ entries: [{ id: 'a', file: 'a', format: 'hwp', source: 's' }] }, /permission/],
    [{ entries: [{ id: 'a', file: 'a', format: 'hwp', source: 's', permission: 'p', tags: ['nope'] }] }, /unknown tag/],
    [{ entries: [{ id: 'a', file: 'a', format: 'hwp', source: 's', permission: 'p' }, { id: 'a', file: 'b', format: 'hwp', source: 's', permission: 'p' }] }, /duplicated/],
  ])('rejects %j', (raw, msg) => {
    expect(() => validateManifest(raw, '/c')).toThrow(CorpusError)
    expect(() => validateManifest(raw, '/c')).toThrow(msg)
  })
})

describe('pixel diff', () => {
  it('passes identical pages and counts differing pixels', () => {
    const a = solid(20, 10)
    expect(diffPage(a, solid(20, 10), 0).diffPixels).toBe(0)
    const b = solid(20, 10)
    for (let i = 0; i < 4; i++) b.data.set([0, 0, 0, 255], (5 * 20 + 5 + i) * 4)
    const d = diffPage(a, b, 0)
    expect(d.diffPixels).toBeGreaterThan(0)
    expect(d.pass).toBe(false)
    expect(diffPage(a, b, 0, { maxDiffPixels: 10 }).pass).toBe(true)
  })

  it('tolerates a one-pixel size difference but not more', () => {
    expect(diffPage(solid(20, 10), solid(21, 10), 0).problem).toBeUndefined()
    expect(diffPage(solid(20, 10), solid(25, 10), 0).problem).toBe('size-mismatch')
  })

  it('fails a document whose page count differs', () => {
    const d = diffDocument([solid(4, 4), solid(4, 4)], [solid(4, 4)])
    expect(d.pass).toBe(false)
    expect(d.pages[1]!.problem).toBe('missing-reference')
    expect(classify(d, undefined)?.cause).toBe('line-breaking')
  })
})

describe('PDF rasterisation (한글 2024 references)', () => {
  it('rasterises at the requested dpi', async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595.28, 841.89]) // A4 in points
    page.drawRectangle({ x: 0, y: 841.89 - 72, width: 72, height: 72, color: rgb(0, 0, 0) })
    const [bmp] = await rasterizePdf(await pdf.save(), 150)
    expect(bmp!.width).toBe(Math.round((595.28 * 150) / 72))
    expect(bmp!.height).toBe(Math.round((841.89 * 150) / 72))
    // The 1-inch black square in the top-left corner covers pixel (10, 10).
    expect(Array.from(bmp!.data.subarray((10 * bmp!.width + 10) * 4, (10 * bmp!.width + 10) * 4 + 3))).toEqual([0, 0, 0])
    // And not pixel (200, 200), 150 px = 1 inch beyond it.
    expect(bmp!.data[(200 * bmp!.width + 200) * 4]).toBe(255)
  })

  it('parses reference.ps1 output', () => {
    const out = 'noise\r\n{"id":"a","opened":true,"saved":true,"hancomVersion":"13.0.0.1","error":null}\n{"id":"b","opened":false,"saved":false,"hancomVersion":"13.0.0.1","error":"x"}\n'
    expect(parseHancomOutput(out).map((r) => [r.id, r.saved])).toEqual([['a', true], ['b', false]])
  })
})

describe('save round trip (R1.4, R3.1, engine side)', () => {
  it('round-trips every synthetic document in both formats with identical paint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hangul-fidelity-'))
    const corpus = writeSyntheticCorpus(dir)
    expect(corpus.entries.length).toBeGreaterThanOrEqual(8)
    expect(new Set(corpus.entries.map((e) => e.format))).toEqual(new Set(['hwp', 'hwpx']))
    for (const e of corpus.entries) {
      const { result } = roundTripFile(e.id, entryPath(corpus, e), e.format)
      expect(result, `${e.id}: ${result.error ?? JSON.stringify(result.pages.find((p) => !p.equal))}`).toMatchObject({ pass: true })
    }
    const long = corpus.entries.find((e) => e.id === 'synthetic-long-hwp')!
    expect(roundTripFile(long.id, entryPath(corpus, long), 'hwp').result.pagesBefore).toBeGreaterThan(1)
  })

  it('round-trips the existing HWPX fixture and an encrypted document', () => {
    const sample = new Uint8Array(readFileSync(join(__dirname, '../../../apps/hangul/tests/fixtures/sample.hwpx')))
    expect(roundTripBytes('sample', sample, 'hwpx').result.pass).toBe(true)

    const doc = HwpCoreDocument.blank()
    doc.insertText(0, 0, 0, '대외비 문서')
    const locked = doc.export('hwp', 'secret')
    doc.dispose()
    const { result, saved } = roundTripBytes('locked', locked, 'hwp', 'secret')
    expect(result.pass).toBe(true)
    const reopened = HwpCoreDocument.open(saved!, 'secret')
    expect(reopened.info().encrypted).toBe(true)
    reopened.dispose()
  })

  it('reports a failure instead of throwing on a broken file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hangul-fidelity-'))
    writeFileSync(join(dir, 'broken.hwp'), 'not a document')
    const { result } = roundTripFile('broken', join(dir, 'broken.hwp'), 'hwp')
    expect(result.pass).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('report', () => {
  it('summarises pass, fail and architecture limits', () => {
    const entries = [
      { id: 'a', file: 'a', format: 'hwp' as const, tags: [], source: 's', permission: 'p' },
      { id: 'b', file: 'b', format: 'hwpx' as const, tags: [], source: 's', permission: 'p' },
    ]
    const pass = diffDocument([solid(2, 2)], [solid(2, 2)])
    const fail = diffDocument([solid(2, 2)], [solid(2, 2, 0)])
    const r = buildReport({
      dpi: 150,
      entries,
      diffs: new Map([['a', pass], ['b', fail]]),
      metas: new Map(),
      roundTrips: new Map(),
      manual: { b: { cause: 'table', nature: 'architecture', note: 'row split model' } },
    })
    expect(r.summary).toMatchObject({ pixelPass: 1, pixelFail: 1, byCause: { table: 1 }, architectureLimits: ['b'] })
  })
})
