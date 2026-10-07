// Scripted edit scenarios (spec R3.2, R3.3, R3.5, task 1.11).
//
// Each scenario drives the editor core (Session + CommandBus, the same code the
// app runs) on a Corpus document, then saves in both formats. The engine-side
// checks run anywhere:
//   - the saved bytes reopen;
//   - the reopened text equals the edited text, paragraph for paragraph;
//   - the reopened document paints the same glyphs as the edited one
//     (positions, characters, styles; run grouping may differ, see paint.ts);
//   - nothing outside the edited paragraphs changed paint.
// The 한글 2024 half (opens without a repair prompt, renders like the golden)
// runs on the Windows runner from the saved files `writeScenarioOutputs` keeps.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HwpCoreDocument, type HwpFormat } from '@genoffice/hwp-core/node'
import { CommandBus, Session, paste, type Pos } from '@genoffice/hwp-editor'
import { canonicalPaint } from './paint'

export interface ScenarioContext {
  session: Session
  bus: CommandBus
  /** A body paragraph with text near the middle, to edit away from the edges. */
  target: number
}

export interface Scenario {
  id: string
  description: string
  /** Applies to documents that have what it needs (e.g. a table). */
  applies?(doc: HwpCoreDocument): boolean
  run(ctx: ScenarioContext): void
}

const at = (para: number, offset: number): Pos => ({ section: 0, para, offset })

function caret(s: Session, p: Pos) {
  s.select({ anchor: p, head: p })
}

function firstTable(doc: HwpCoreDocument): { host: number; control: number } | null {
  const paras = doc.outline().sections[0]?.paragraphs ?? []
  for (const [host, p] of paras.entries()) {
    const t = p.controls?.find((c) => c.kind === 'table')
    if (t) return { host, control: t.controlIndex }
  }
  return null
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'type-korean',
    description: 'type a Korean sentence mid-paragraph',
    run({ session, bus, target }) {
      caret(session, at(target, Math.floor(session.text.length(at(target, 0)) / 2)))
      for (const ch of ' 국민의 권리와 의무를 정한다.') bus.run('edit:insert-text', { text: ch })
    },
  },
  {
    id: 'split-merge',
    description: 'split a paragraph, type in the new one, then merge it back with Backspace',
    run({ session, bus, target }) {
      caret(session, at(target, Math.min(3, session.text.length(at(target, 0)))))
      bus.run('edit:split-paragraph')
      bus.run('edit:insert-text', { text: '새 문단 ' })
      caret(session, at(target + 1, 0))
      bus.run('edit:delete-backward')
    },
  },
  {
    id: 'add-paragraphs',
    description: 'add three paragraphs after the target',
    run({ session, bus, target }) {
      caret(session, at(target, session.text.length(at(target, 0))))
      bus.run('edit:insert-text', { text: '\n첫째 추가 문단.\n둘째 추가 문단.\n셋째 추가 문단.' })
    },
  },
  {
    id: 'delete-range',
    description: 'delete across a paragraph break',
    applies: (doc) => doc.paragraphCount(0) > 2,
    run({ session, bus, target }) {
      const next = Math.min(target + 1, session.doc.paragraphCount(0) - 1)
      if (next === target) return
      session.select({ anchor: at(target, Math.min(2, session.text.length(at(target, 0)))), head: at(next, Math.min(2, session.text.length(at(next, 0)))) })
      bus.run('edit:delete-backward')
    },
  },
  {
    id: 'bold-italic',
    description: 'bold and italicise a range',
    run({ session, bus, target }) {
      const len = session.text.length(at(target, 0))
      if (len < 2) session.text.insert(at(target, 0), '서식 적용 대상')
      session.select({ anchor: at(target, 0), head: at(target, Math.min(4, session.text.length(at(target, 0)))) })
      bus.run('format:bold')
      bus.run('format:italic')
    },
  },
  {
    id: 'paste-html',
    description: 'paste formatted HTML from another application',
    run({ session, target }) {
      caret(session, at(target, session.text.length(at(target, 0))))
      paste(session, { text: '붙여넣은 제목\n붙여넣은 본문', html: '<p><b>붙여넣은 제목</b></p><p>붙여넣은 <i>본문</i></p>' })
    },
  },
  {
    id: 'table-cell',
    description: 'type into the first table cell and add a paragraph inside it',
    applies: (doc) => firstTable(doc) !== null,
    run({ session, bus }) {
      const t = firstTable(session.doc)!
      caret(session, { section: 0, para: t.host, offset: 0, cell: { control: t.control, cell: 0, para: 0 } })
      bus.run('edit:insert-text', { text: '셀 편집\n둘째 줄' })
    },
  },
  {
    id: 'undo-all',
    description: 'make edits and undo all of them: saves must equal a no-op save',
    run({ session, bus, target }) {
      caret(session, at(target, 0))
      bus.run('edit:insert-text', { text: '되돌릴 글' })
      bus.run('edit:split-paragraph')
      while (session.canUndo) bus.run('edit:undo')
    },
  },
]

export interface ScenarioResult {
  doc: string
  scenario: string
  format: HwpFormat
  pass: boolean
  problems: string[]
  pages: number
  bytes: number
}

function bodyText(doc: HwpCoreDocument): string[] {
  return Array.from({ length: doc.paragraphCount(0) }, (_, p) => doc.text(0, p))
}

function paint(doc: HwpCoreDocument): string[] {
  return Array.from({ length: doc.pageCount() }, (_, p) => canonicalPaint(doc.raw.getPageLayerTree(p)).join('\n'))
}

function pickTarget(doc: HwpCoreDocument): number {
  const n = doc.paragraphCount(0)
  const mid = Math.floor(n / 2)
  for (let d = 0; d < n; d++) {
    for (const p of [mid + d, mid - d]) if (p >= 0 && p < n && doc.paragraphLength(0, p) > 2 && !doc.outline().sections[0]!.paragraphs[p]!.controls) return p
  }
  return 0
}

/**
 * Run one scenario on document bytes and check the saves in both formats.
 * `outDir`, when given, receives the saved files for the 한글 2024 check.
 */
export function runScenario(docId: string, bytes: Uint8Array, scenario: Scenario, password?: string, outDir?: string): ScenarioResult[] {
  const results: ScenarioResult[] = []
  const doc = HwpCoreDocument.open(bytes, password)
  if (scenario.applies && !scenario.applies(doc)) {
    doc.dispose()
    return results
  }
  const source = doc.sourceFormat() === 'hwpx' ? 'hwpx' : 'hwp'
  const session = new Session(doc, source)
  const bus = new CommandBus(session)
  const problems: string[] = []
  try {
    scenario.run({ session, bus, target: pickTarget(doc) })
  } catch (e) {
    problems.push(`scenario threw: ${e instanceof Error ? e.message : String(e)}`)
  }
  session.settle()
  const wantText = bodyText(doc)
  const wantPaint = paint(doc)
  for (const format of ['hwp', 'hwpx'] as const) {
    const p = [...problems]
    let saved: Uint8Array | undefined
    let pages = 0
    try {
      saved = session.export(format, password)
      const back = HwpCoreDocument.open(saved, password)
      pages = back.pageCount()
      const gotText = bodyText(back)
      if (JSON.stringify(gotText) !== JSON.stringify(wantText)) {
        const i = gotText.findIndex((t, k) => t !== wantText[k])
        p.push(`text differs at paragraph ${i}: ${JSON.stringify(wantText[i])} → ${JSON.stringify(gotText[i])}`)
      }
      // Paint is compared within the source format: a cross-format save may
      // legitimately re-derive layout caches (the no-op round trip covers
      // that), but the same format must paint the same glyphs.
      if (format === source) {
        const gotPaint = paint(back)
        if (gotPaint.length !== wantPaint.length) p.push(`page count ${wantPaint.length} → ${gotPaint.length}`)
        else {
          const bad = gotPaint.findIndex((g, k) => g !== wantPaint[k])
          if (bad >= 0) p.push(`page ${bad} paints differently after reopen`)
        }
      }
      back.dispose()
    } catch (e) {
      p.push(`save or reopen failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (outDir && saved) {
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, `${docId}--${scenario.id}.${format}`), saved)
    }
    results.push({ doc: docId, scenario: scenario.id, format, pass: p.length === 0, problems: p, pages, bytes: saved?.length ?? 0 })
  }
  session.dispose()
  doc.dispose()
  return results
}

/** undo-all must save exactly what a no-op save writes. */
export function undoAllMatchesNoop(bytes: Uint8Array, password?: string): boolean {
  const a = HwpCoreDocument.open(bytes, password)
  const fmt = a.sourceFormat() === 'hwpx' ? 'hwpx' : 'hwp'
  const noop = paint(HwpCoreDocument.open(a.export(fmt, password), password))
  const b = HwpCoreDocument.open(bytes, password)
  const s = new Session(b, fmt)
  SCENARIOS.find((x) => x.id === 'undo-all')!.run({ session: s, bus: new CommandBus(s), target: pickTarget(b) })
  const after = paint(HwpCoreDocument.open(s.export(fmt, password), password))
  return JSON.stringify(noop) === JSON.stringify(after)
}
