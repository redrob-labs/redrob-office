// Fidelity report: per-document, per-page scores with a cause per failure
// (spec R1.1, R1.2). Causes come from a heuristic first and from the Corpus's
// causes.json when a person has classified the failure by hand.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CorpusEntry } from './corpus'
import type { DocumentDiff } from './diff'
import type { RenderMeta } from './render'
import type { RoundTripResult } from './roundtrip'

export const CAUSES = ['font', 'line-breaking', 'table', 'object-placement', 'equation', 'numbering', 'other', 'unclassified'] as const
export type Cause = (typeof CAUSES)[number]

/**
 * Whether a cause is a limit of the engine's architecture rather than a bug.
 * Only a person can say; this field exists so the 0.8 decision is recorded
 * per failure rather than in prose.
 */
export type Nature = 'bug' | 'missing-feature' | 'architecture' | 'unknown'

export interface ManualCause {
  cause: Cause
  nature: Nature
  note?: string
}

export interface DocumentReport {
  id: string
  format: string
  tags: string[]
  diff?: Omit<DocumentDiff, 'pages'> & { pages: Array<Omit<DocumentDiff['pages'][number], 'diff'>> }
  roundTrip?: RoundTripResult
  fonts?: { used: string[]; substitutions: unknown[] }
  cause?: Cause
  nature?: Nature
  note?: string
}

export interface FidelityReport {
  generatedAt: string
  dpi: number
  hancomVersion?: string
  documents: DocumentReport[]
  summary: {
    documents: number
    pixelPass: number
    pixelFail: number
    pixelNotCompared: number
    roundTripPass: number
    roundTripFail: number
    byCause: Record<string, number>
    architectureLimits: string[]
  }
}

/** Heuristic cause for a failing comparison; a manual entry always wins. */
export function classify(diff: DocumentDiff | undefined, meta: RenderMeta | undefined, manual?: ManualCause): ManualCause | undefined {
  if (manual) return manual
  if (!diff || diff.pass) return undefined
  if (meta && meta.fontSubstitutions.length > 0) return { cause: 'font', nature: 'unknown', note: 'fonts were substituted (R2.4)' }
  if (diff.pagesOurs !== diff.pagesReference) return { cause: 'line-breaking', nature: 'unknown', note: `page count ${diff.pagesOurs} vs ${diff.pagesReference}` }
  return { cause: 'unclassified', nature: 'unknown' }
}

export function loadManualCauses(corpusRoot: string): Record<string, ManualCause> {
  const path = join(corpusRoot, 'causes.json')
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, ManualCause>) : {}
}

export function buildReport(input: {
  dpi: number
  hancomVersion?: string
  entries: CorpusEntry[]
  diffs: Map<string, DocumentDiff>
  metas: Map<string, RenderMeta>
  roundTrips: Map<string, RoundTripResult>
  manual: Record<string, ManualCause>
}): FidelityReport {
  const documents: DocumentReport[] = input.entries.map((e) => {
    const diff = input.diffs.get(e.id)
    const meta = input.metas.get(e.id)
    const c = classify(diff, meta, input.manual[e.id])
    return {
      id: e.id,
      format: e.format,
      tags: e.tags,
      diff: diff && { ...diff, pages: diff.pages.map(({ diff: _bitmap, ...rest }) => rest) },
      roundTrip: input.roundTrips.get(e.id),
      fonts: meta && { used: meta.fontsUsed, substitutions: meta.fontSubstitutions },
      cause: c?.cause,
      nature: c?.nature,
      note: c?.note,
    }
  })
  const byCause: Record<string, number> = {}
  for (const d of documents) if (d.cause) byCause[d.cause] = (byCause[d.cause] ?? 0) + 1
  return {
    generatedAt: new Date().toISOString(),
    dpi: input.dpi,
    hancomVersion: input.hancomVersion,
    documents,
    summary: {
      documents: documents.length,
      pixelPass: documents.filter((d) => d.diff?.pass).length,
      pixelFail: documents.filter((d) => d.diff && !d.diff.pass).length,
      pixelNotCompared: documents.filter((d) => !d.diff).length,
      roundTripPass: documents.filter((d) => d.roundTrip?.pass).length,
      roundTripFail: documents.filter((d) => d.roundTrip && !d.roundTrip.pass).length,
      byCause,
      architectureLimits: documents.filter((d) => d.nature === 'architecture').map((d) => d.id),
    },
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function writeReport(dir: string, report: FidelityReport): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2))
  const s = report.summary
  const rows = report.documents
    .map((d) => {
      const px = d.diff ? (d.diff.pass ? 'pass' : `fail (${d.diff.pages.filter((p) => !p.pass).length}/${d.diff.pages.length} pages)`) : 'not compared'
      const rt = d.roundTrip ? (d.roundTrip.pass ? 'pass' : `fail${d.roundTrip.error ? `: ${esc(d.roundTrip.error)}` : ''}`) : ''
      return `<tr><td>${esc(d.id)}</td><td>${d.format}</td><td>${esc(d.tags.join(', '))}</td><td>${px}</td><td>${rt}</td><td>${d.cause ?? ''}</td><td>${d.nature ?? ''}</td><td>${esc(d.note ?? '')}</td></tr>`
    })
    .join('\n')
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Hangul fidelity</title>
<style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}</style>
<h1>Hangul fidelity</h1>
<p>${esc(report.generatedAt)} · ${report.dpi} dpi · 한글 ${esc(report.hancomVersion ?? 'reference not generated')}</p>
<p>Pixel: ${s.pixelPass} pass, ${s.pixelFail} fail, ${s.pixelNotCompared} not compared · Save round trip: ${s.roundTripPass} pass, ${s.roundTripFail} fail</p>
<p>Architecture limits: ${s.architectureLimits.length ? esc(s.architectureLimits.join(', ')) : 'none recorded'}</p>
<table><tr><th>Document</th><th>Format</th><th>Tags</th><th>Pixel</th><th>Round trip</th><th>Cause</th><th>Nature</th><th>Note</th></tr>
${rows}
</table>`,
  )
}
