import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { initHwpCoreNode } from '@genoffice/hwp-core/node'
import { SCENARIOS, entryPath, runScenario, undoAllMatchesNoop, writeSyntheticCorpus } from '../src'

initHwpCoreNode() // the corpus is generated while tests are collected

describe('scripted edit scenarios (task 1.11)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hangul-scenarios-'))
  const corpus = writeSyntheticCorpus(join(dir, 'corpus'))
  const outDir = join(dir, 'saved')

  for (const entry of corpus.entries) {
    for (const scenario of SCENARIOS) {
      it(`${scenario.id} on ${entry.id} saves and reopens identically in both formats`, () => {
        const results = runScenario(entry.id, new Uint8Array(readFileSync(entryPath(corpus, entry))), scenario, undefined, outDir)
        for (const r of results) expect(r.problems, `${r.doc} ${r.scenario} → ${r.format}`).toEqual([])
      })
    }
  }

  it('the table scenario ran where there is a table', () => {
    const tables = corpus.entries.filter((e) => e.tags.includes('table'))
    expect(tables.length).toBeGreaterThan(0)
    const saved = readdirSync(outDir).filter((f) => f.includes('--table-cell.'))
    expect(saved.length).toBe(tables.length * 2)
  })

  it('undoing every edit saves exactly what a no-op save does', () => {
    for (const e of corpus.entries) expect(undoAllMatchesNoop(new Uint8Array(readFileSync(entryPath(corpus, e)))), e.id).toBe(true)
  })

  it('also holds on the existing HWPX fixture and an encrypted document', () => {
    const sample = new Uint8Array(readFileSync(join(__dirname, '../../../apps/hangul/tests/fixtures/sample.hwpx')))
    for (const s of SCENARIOS) for (const r of runScenario('sample', sample, s)) expect(r.problems, `${s.id} ${r.format}`).toEqual([])
  })
})
