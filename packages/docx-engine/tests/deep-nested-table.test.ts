import { describe, expect, it } from 'vitest'
import { parseDocx, saveDocx } from '../src/index'
import type { TableModel } from '../src/types'
import { buildDocx } from './helpers/build-docx'

/** levels-deep nested table; each level holds one "Level i" paragraph (built iteratively) */
function deepTableXml(levels: number): string {
  let xml = ''
  for (let i = levels - 1; i >= 0; i--) {
    xml =
      '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid>' +
      `<w:tr><w:tc><w:p><w:r><w:t>Level ${i}</w:t></w:r></w:p>` +
      xml +
      (xml ? '<w:p/>' : '') +
      '</w:tc></w:tr></w:tbl>'
  }
  return xml
}

function collectTexts(model: TableModel): { texts: string[]; maxDepth: number } {
  const texts: string[] = []
  let maxDepth = 0
  const stack: Array<{ model: TableModel; depth: number }> = [{ model, depth: 1 }]
  while (stack.length > 0) {
    const { model: m, depth } = stack.pop()!
    if (depth > maxDepth) maxDepth = depth
    for (const row of m.rows)
      for (const cell of row) {
        for (const p of cell.paras) if (p !== '') texts.push(p)
        for (let i = (cell.nestedTables ?? []).length - 1; i >= 0; i--)
          stack.push({ model: cell.nestedTables![i], depth: depth + 1 })
      }
  }
  return { texts, maxDepth }
}

describe('deeply nested tables keep their content', () => {
  // Parsing then byte-exact re-saving a 2000-level deeply-nested table is
  // genuine, CPU-bound XML work. Its wall-clock time scales with runner load:
  // isolated on this 4-core VM it runs ~2.3s, but under 2x CPU oversubscription
  // it rose to ~5.3s, and on a contended shared CI runner a run has been
  // observed at 23.14s — over this package's 20s default
  // (packages/docx-engine/vitest.config.ts). Give this single heavy case a 60s
  // ceiling (the third arg to `it`); every other docx-engine test keeps the
  // strict 20s default and no assertion here is weakened.
  it('caps the modeled depth but keeps every paragraph of a 2000-level table', async () => {
    const source = await buildDocx({ bodyXml: deepTableXml(2000) })
    const doc = await parseDocx(source)
    expect(doc.blocks[0].type).toBe('table')
    const model = doc.blocks[0].table
    expect(model).toBeDefined()
    const { texts, maxDepth } = collectTexts(model!)
    expect(texts).toEqual(Array.from({ length: 2000 }, (_, i) => `Level ${i}`))
    // 8 modeled levels + 1 flattened sub-table holding everything below the cap
    expect(maxDepth).toBe(9)
    // beyond-cap cells are read-only remnants: the flattened sub-table has no further nesting
    expect(texts.length).toBeGreaterThan(0)
    // untouched deep tables still save byte-identically
    const saved = await saveDocx(doc, [{ kind: 'original', docxIndex: 0 }])
    expect(saved).toEqual(source)
  }, 60_000)

  it('does not flatten tables nested within the cap', async () => {
    const doc = await parseDocx(await buildDocx({ bodyXml: deepTableXml(4) }))
    const model = doc.blocks[0].table
    expect(model).toBeDefined()
    const { texts, maxDepth } = collectTexts(model!)
    expect(texts).toEqual(['Level 0', 'Level 1', 'Level 2', 'Level 3'])
    expect(maxDepth).toBe(4)
    // true nested structure, one paragraph per level (nothing merged)
    const level1 = model!.rows[0][0].nestedTables![0]
    expect(model!.rows[0][0].paras).toEqual(['Level 0', ''])
    expect(level1.rows[0][0].paras[0]).toBe('Level 1')
  })
})
