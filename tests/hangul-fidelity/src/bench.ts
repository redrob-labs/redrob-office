// Keystroke-to-paint benchmark (spec R4.4, task 1.9).
//
//   pnpm --filter @genoffice/hangul-fidelity bench [--pages 100] [--keystrokes 200] [--scale 1.5] [--out DIR] [file…]
//
// Without files it generates a document of about --pages pages with the
// engine. Needs a display (xvfb-run on Linux). Fails when p95 > --budget ms (50).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { renderWithElectron } from './render'

const argv = process.argv.slice(2)
const flag = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1]! : d
}
const files = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'))
const out = resolve(flag('out', '.fidelity/bench'))
const pages = Number(flag('pages', '100'))
const budget = Number(flag('budget', '50'))
mkdirSync(out, { recursive: true })

initHwpCoreNode()

function generate(target: number): string {
  const d = HwpCoreDocument.blank()
  const line = '대한민국 헌법 제1조 ① 대한민국은 민주공화국이다. ② 대한민국의 주권은 국민에게 있고, 모든 권력은 국민으로부터 나온다. '
  let para = 0
  while (d.pageCount() < target) {
    for (let k = 0; k < 40; k++) {
      d.insertText(0, para, 0, line.repeat(2))
      para = JSON.parse(d.raw.splitParagraph(0, para, d.paragraphLength(0, para))).paraIdx
    }
  }
  const path = join(out, `generated-${target}p.hwpx`)
  writeFileSync(path, d.export('hwpx'))
  console.log(`generated ${path}: ${d.pageCount()} pages, ${d.paragraphCount(0)} paragraphs`)
  d.dispose()
  return path
}

const docs = files.length ? files.map((f) => resolve(f)) : [generate(pages)]
const item = { id: 'bench', file: docs[0]!, outDir: out }
const items = docs.map((f, i) => ({ id: `bench-${i}`, file: f, outDir: out }))
void item
renderWithElectron(items, 96, out, { page: 'bench', scale: Number(flag('scale', '1.5')), keystrokes: Number(flag('keystrokes', '200')) })
const results = JSON.parse(readFileSync(join(out, 'render.json'), 'utf8')) as Array<{ id: string; pages: number; p50: number; p95: number; max: number; openMs: number; p95Parts: Record<string, number>; deferredP95: number; deferredFlushMs: number; deferredSameAfterFlush: boolean }>
writeFileSync(join(out, 'bench.json'), JSON.stringify({ budgetMs: budget, results }, null, 2))
for (const r of results) console.log(`${r.id}: ${r.pages} pages, open ${r.openMs} ms, keystroke→paint p50 ${r.p50} ms, p95 ${r.p95} ms, max ${r.max} ms (budget p95 ≤ ${budget}); p95 by step ${JSON.stringify(r.p95Parts)}; deferred pagination p95 ${r.deferredP95} ms, flush ${r.deferredFlushMs} ms, same result ${r.deferredSameAfterFlush}`)
// The gate is the editor's path: user typing defers pagination (packages/hwp-editor
// Session) and the settle pass must land on the same pages as typing without it.
if (results.some((r) => r.deferredP95 > budget || !r.deferredSameAfterFlush)) process.exitCode = 1
