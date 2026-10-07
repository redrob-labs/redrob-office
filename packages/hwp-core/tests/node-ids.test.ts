import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '../src/node'

beforeAll(() => initHwpCoreNode())

function threeParagraphs(): HwpCoreDocument {
  const d = HwpCoreDocument.blank()
  d.insertText(0, 0, 0, '첫째')
  d.raw.splitParagraph(0, 0, 2)
  d.insertText(0, 1, 0, '둘째')
  d.raw.splitParagraph(0, 1, 2)
  d.insertText(0, 2, 0, '셋째')
  return d
}

describe('session node ids (E1)', () => {
  it('gives every body paragraph a unique id', () => {
    const d = threeParagraphs()
    const ids = [0, 1, 2].map((p) => d.nodeIdAt(0, p))
    expect(new Set(ids).size).toBe(3)
    expect(ids.every((i) => typeof i === 'number' && i > 0)).toBe(true)
    expect(d.nodeIdAt(0, 99)).toBeNull()
    d.dispose()
  })

  it('keeps an id on its paragraph when another is inserted before it', () => {
    const d = threeParagraphs()
    const third = d.nodeIdAt(0, 2)!
    d.raw.splitParagraph(0, 0, 0) // new empty paragraph at the top
    expect(d.locate(third)).toMatchObject({ section: 0, para: 3, path: [] })
    expect(d.text(0, 3)).toBe('셋째')
    d.dispose()
  })

  it('a split keeps the id on the head and gives the tail a new one', () => {
    const d = threeParagraphs()
    const first = d.nodeIdAt(0, 0)!
    d.raw.splitParagraph(0, 0, 1)
    expect(d.nodeIdAt(0, 0)).toBe(first)
    const tail = d.nodeIdAt(0, 1)!
    expect(tail).not.toBe(first)
    d.dispose()
  })

  it('a deleted paragraph is gone and its id is not reused', () => {
    const d = threeParagraphs()
    const second = d.nodeIdAt(0, 1)!
    d.deleteRange(0, 0, d.paragraphLength(0, 0), 1, d.paragraphLength(0, 1)) // merge 0 and 1, removing 1
    expect(d.locate(second)).toBeNull()
    d.raw.splitParagraph(0, 0, 0)
    expect([0, 1, 2].map((p) => d.nodeIdAt(0, p))).not.toContain(second)
    d.dispose()
  })

  it('ids come back with a snapshot restore', () => {
    const d = threeParagraphs()
    const ids = [0, 1, 2].map((p) => d.nodeIdAt(0, p))
    const snap = d.saveSnapshot()
    d.deleteRange(0, 0, 0, 2, 1)
    d.restoreSnapshot(snap)
    expect([0, 1, 2].map((p) => d.nodeIdAt(0, p))).toEqual(ids)
    d.dispose()
  })

  it('ids are never written to the file', () => {
    const d = threeParagraphs()
    const a = d.export('hwpx')
    d.outline() // assigns ids if not yet
    const b = d.export('hwpx')
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true)
    d.dispose()
  })
})

describe('outline and node reads (E3)', () => {
  it('lists body paragraphs and tables with their cells', () => {
    const d = threeParagraphs()
    d.raw.createTable(0, 2, d.paragraphLength(0, 2), 2, 2)
    const o = d.outline()
    const paras = o.sections[0]!.paragraphs
    expect(paras.map((p) => p.preview).slice(0, 2)).toEqual(['첫째', '둘째'])
    const table = paras.flatMap((p) => p.controls ?? []).find((c) => c.kind === 'table')!
    expect(table).toMatchObject({ rows: 2, cols: 2 })
    expect(table.cells).toHaveLength(4)
    const cellPara = table.cells![3]!.paragraphs[0]!
    const loc = d.locate(cellPara.id)!
    expect(loc.path).toHaveLength(1)
    expect(loc.path[0]).toMatchObject({ kind: 'cell', cellIndex: 3, para: 0 })
    d.dispose()
  })

  it('reads node text and reports missing ids', () => {
    const d = threeParagraphs()
    const id = d.nodeIdAt(0, 1)!
    const [hit, miss] = d.readNodes([id, 999999])
    expect(hit).toMatchObject({ id, text: '둘째', location: { section: 0, para: 1 } })
    expect(miss).toEqual({ id: 999999, missing: true })
    d.dispose()
  })
})
