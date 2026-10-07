// pnpm --filter @genoffice/hangul-fidelity fidelity <command> [options]
//
//   synthetic  --out DIR                      write the synthetic corpus
//   roundtrip  --corpus DIR --out DIR         engine save round trip (Node, no display)
//   render     --corpus DIR --out DIR         our renderings through Electron (needs a display)
//   reference  --corpus DIR --out DIR         한글 2024 references (Windows runner)
//   compare    --corpus DIR --ours DIR --reference DIR --out DIR
//   all        --corpus DIR --out DIR         roundtrip + render, + reference/compare when available
//
// Common: --dpi N (default 150), --max-diff-pixels N (default 0), --force.
// --corpus defaults to $HANGUL_CORPUS_DIR; without either, `all` uses the synthetic corpus.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { initHwpCoreNode } from '@genoffice/hwp-core/node'
import { entryPath, loadCorpus, writeSyntheticCorpus, type Corpus } from './corpus'
import { diffDocument, type DocumentDiff } from './diff'
import { generateReferences, hancomAvailable } from './hancom'
import { readPng, writePng } from './raster'
import { readRendered, renderWithElectron, type RenderMeta } from './render'
import { buildReport, loadManualCauses, writeReport } from './report'
import { roundTripFile, type RoundTripResult } from './roundtrip'

function args(argv: string[]): { cmd: string; opt: Record<string, string | true> } {
  const [cmd = 'help', ...rest] = argv
  const opt: Record<string, string | true> = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!
    if (!a.startsWith('--')) continue
    const next = rest[i + 1]
    if (next && !next.startsWith('--')) {
      opt[a.slice(2)] = next
      i++
    } else opt[a.slice(2)] = true
  }
  return { cmd, opt }
}

const { cmd, opt } = args(process.argv.slice(2))
const dpi = Number(opt.dpi ?? 150)
const maxDiffPixels = Number(opt['max-diff-pixels'] ?? 0)
const out = resolve(String(opt.out ?? '.fidelity'))

function corpus(): Corpus {
  const dir = (opt.corpus as string | undefined) ?? process.env.HANGUL_CORPUS_DIR
  if (dir) return loadCorpus(resolve(dir))
  console.log('No --corpus or HANGUL_CORPUS_DIR: using the synthetic corpus.')
  return writeSyntheticCorpus(join(out, 'synthetic'))
}

function runRoundTrip(c: Corpus): Map<string, RoundTripResult> {
  const results = new Map<string, RoundTripResult>()
  for (const e of c.entries) {
    const { result } = roundTripFile(e.id, entryPath(c, e), e.format, e.password)
    results.set(e.id, result)
    console.log(`round trip ${result.pass ? 'pass' : 'FAIL'}  ${e.id}  (${result.pagesBefore}→${result.pagesAfter} pages)${result.error ? `  ${result.error}` : ''}`)
  }
  return results
}

function runRender(c: Corpus, dir: string): Map<string, RenderMeta> {
  renderWithElectron(
    c.entries.map((e) => ({ id: e.id, file: entryPath(c, e), password: e.password, outDir: join(dir, e.id) })),
    dpi,
    dir,
  )
  const metas = new Map<string, RenderMeta>()
  for (const e of c.entries) metas.set(e.id, readRendered(join(dir, e.id)).meta)
  return metas
}

function runCompare(c: Corpus, oursDir: string, refDir: string, diffDir: string): { diffs: Map<string, DocumentDiff>; hancomVersion?: string } {
  const diffs = new Map<string, DocumentDiff>()
  let hancomVersion: string | undefined
  for (const e of c.entries) {
    const refMeta = join(refDir, e.id, 'reference.json')
    if (!existsSync(refMeta)) continue
    const ref = JSON.parse(readFileSync(refMeta, 'utf8')) as { saved: boolean; pages?: number; hancomVersion: string }
    hancomVersion ??= ref.hancomVersion
    if (!ref.saved) continue
    const ours = readRendered(join(oursDir, e.id)).pages
    const reference = Array.from({ length: ref.pages ?? 0 }, (_, p) => readPng(join(refDir, e.id, `page-${p}.png`)))
    const d = diffDocument(ours, reference, { maxDiffPixels })
    d.pages.forEach((p) => p.diff && !p.pass && writePng(join(diffDir, e.id, `diff-${p.page}.png`), p.diff))
    diffs.set(e.id, d)
    console.log(`pixel ${d.pass ? 'pass' : 'FAIL'}  ${e.id}  (${d.pages.filter((p) => !p.pass).length} failing page(s))`)
  }
  return { diffs, hancomVersion }
}

async function main() {
  initHwpCoreNode()
  switch (cmd) {
    case 'synthetic': {
      const c = writeSyntheticCorpus(out)
      console.log(`wrote ${c.entries.length} documents to ${out}`)
      return
    }
    case 'roundtrip': {
      const c = corpus()
      const roundTrips = runRoundTrip(c)
      const report = buildReport({ dpi, entries: c.entries, diffs: new Map(), metas: new Map(), roundTrips, manual: loadManualCauses(c.root) })
      writeReport(out, report)
      if (report.summary.roundTripFail > 0) process.exitCode = 1
      return
    }
    case 'render': {
      runRender(corpus(), join(out, 'ours'))
      return
    }
    case 'reference': {
      const c = corpus()
      await generateReferences(c.entries.map((e) => ({ id: e.id, file: entryPath(c, e), outDir: join(out, 'reference', e.id) })), dpi, out, opt.force === true)
      return
    }
    case 'compare': {
      const c = corpus()
      const { diffs, hancomVersion } = runCompare(c, resolve(String(opt.ours)), resolve(String(opt.reference)), join(out, 'diff'))
      const report = buildReport({ dpi, hancomVersion, entries: c.entries, diffs, metas: new Map(), roundTrips: new Map(), manual: loadManualCauses(c.root) })
      writeReport(out, report)
      if (report.summary.pixelFail > 0) process.exitCode = 1
      return
    }
    case 'all': {
      const c = corpus()
      const roundTrips = runRoundTrip(c)
      const metas = runRender(c, join(out, 'ours'))
      let diffs = new Map<string, DocumentDiff>()
      let hancomVersion: string | undefined
      const refDir = (opt.reference as string | undefined) ?? join(out, 'reference')
      if (hancomAvailable() && !opt.reference) {
        await generateReferences(c.entries.map((e) => ({ id: e.id, file: entryPath(c, e), outDir: join(refDir, e.id) })), dpi, out, opt.force === true)
      }
      if (existsSync(refDir)) ({ diffs, hancomVersion } = runCompare(c, join(out, 'ours'), resolve(refDir), join(out, 'diff')))
      const report = buildReport({ dpi, hancomVersion, entries: c.entries, diffs, metas, roundTrips, manual: loadManualCauses(c.root) })
      writeReport(out, report)
      console.log(`report: ${join(out, 'index.html')}`)
      if (report.summary.roundTripFail > 0 || report.summary.pixelFail > 0) process.exitCode = 1
      return
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
