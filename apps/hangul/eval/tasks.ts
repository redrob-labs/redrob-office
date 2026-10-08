// AI evaluation tasks for Hangul (spec task 3.8, R6.2, R3.2).
//
// Each task gives the agent a 한글 document and a Korean instruction of the
// kind a government office writes, then checks the result by structure, not
// by taste: the right paragraphs changed and nothing else did, formatting was
// inherited, headings use the document's 개요 styles, a table really exists,
// the header says what was asked. Every result is saved in both formats, and
// the saved files go to the 한글 2024 runner for the open-without-repair and
// fidelity-diff half of the check (blocked on the runner, P-1).
import type { HwpCoreDocument } from '@genoffice/hwp-core'
import { styleList, type Pos, type Session } from '@genoffice/hwp-editor'

export type EvalKind = 'rewrite' | 'restructure' | 'table' | 'header' | 'question'

export interface EvalSnapshot {
  paragraphs: Array<{ id: number; text: string; styleId: number; paraShapeId: number; charShapeId: number; tables: number }>
  header: string
  tables: number
}

export interface EvalTask {
  id: string
  kind: EvalKind
  prompt: string
  /** Whether the document has what the task needs. */
  applies(doc: HwpCoreDocument): boolean
  /** Set the selection the prompt refers to, if any; returns the paragraph ids it covers. */
  select?(s: Session): number[]
  /** Problems with the result (empty = pass). */
  check(before: EvalSnapshot, after: EvalSnapshot, ctx: { selected: number[]; reply: string; mutated: boolean }): string[]
}

export function snapshot(s: Session): EvalSnapshot {
  const doc = s.doc
  const paragraphs: EvalSnapshot['paragraphs'] = []
  let tables = 0
  for (const p of doc.outline().sections[0]?.paragraphs ?? []) {
    const r = doc.readNodes([p.id])[0]!
    const t = (p.controls ?? []).filter((c) => c.kind === 'table').length
    tables += t
    if (r.missing) continue
    paragraphs.push({ id: p.id, text: r.text, styleId: r.styleId, paraShapeId: r.paraShapeId, charShapeId: r.charShapes[0]?.charShapeId ?? 0, tables: t })
  }
  const hf = JSON.parse(doc.raw.getHeaderFooter(0, true, 0)) as { exists?: boolean; text?: string }
  return { paragraphs, header: hf.exists ? (hf.text ?? '') : '', tables }
}

/** Body paragraphs with at least `min` characters, not headings or table hosts. */
function bodyParagraphs(s: Session, min = 20): Array<{ index: number; id: number }> {
  const out: Array<{ index: number; id: number }> = []
  const names = new Map(styleList(s).map((x) => [x.id, x.name]))
  s.doc.outline().sections[0]?.paragraphs.forEach((p, index) => {
    if (p.length >= min && !p.controls?.length && !/^(개요|Outline)/.test(names.get(p.styleId) ?? '')) out.push({ index, id: p.id })
  })
  return out
}

function selectParagraph(s: Session, index: number): void {
  const a: Pos = { section: 0, para: index, offset: 0 }
  s.select({ anchor: a, head: { ...a, offset: s.text.length(a) } })
}

function untouched(before: EvalSnapshot, after: EvalSnapshot, allowed: Set<number>): string[] {
  const now = new Map(after.paragraphs.map((p) => [p.id, p]))
  const problems: string[] = []
  for (const p of before.paragraphs) {
    if (allowed.has(p.id)) continue
    const q = now.get(p.id)
    if (!q) problems.push(`paragraph ${p.id} outside the target was deleted`)
    else if (q.text !== p.text) problems.push(`paragraph ${p.id} outside the target changed: ${JSON.stringify(p.text.slice(0, 30))} → ${JSON.stringify(q.text.slice(0, 30))}`)
    else if (q.paraShapeId !== p.paraShapeId || q.charShapeId !== p.charShapeId) problems.push(`paragraph ${p.id} outside the target lost its formatting`)
  }
  return problems
}

/** Paragraphs new since `before`. */
const added = (before: EvalSnapshot, after: EvalSnapshot) => {
  const old = new Set(before.paragraphs.map((p) => p.id))
  return after.paragraphs.filter((p) => !old.has(p.id))
}

const hangulRatio = (t: string) => (t.match(/[가-힣]/g)?.length ?? 0) / Math.max(1, t.replace(/\s/g, '').length)

export const EVAL_TASKS: EvalTask[] = [
  {
    id: 'rewrite-formal',
    kind: 'rewrite',
    prompt: '선택한 문단을 공문서 문체로 더 간결하게 다듬어 주세요. 내용과 숫자는 바꾸지 마세요.',
    applies: (doc) => doc.paragraphCount(0) > 1,
    select(s) {
      const p = bodyParagraphs(s, 30)[0]
      if (!p) return []
      selectParagraph(s, p.index)
      return [p.id]
    },
    check(before, after, { selected }) {
      const problems = untouched(before, after, new Set(selected))
      const target = before.paragraphs.find((p) => p.id === selected[0])!
      const replaced = [...added(before, after), ...after.paragraphs.filter((p) => p.id === target.id)]
      const text = replaced.map((p) => p.text).join(' ')
      if (!replaced.length || text === target.text) problems.push('the selected paragraph was not rewritten')
      if (replaced.some((p) => p.paraShapeId !== target.paraShapeId)) problems.push('the rewrite did not keep the paragraph shape')
      if (replaced.some((p) => p.charShapeId !== target.charShapeId)) problems.push('the rewrite did not keep the character shape')
      const digits = (t: string) => (t.match(/\d+(?:[.,]\d+)?/g) ?? []).sort().join(' ')
      if (digits(text) !== digits(target.text)) problems.push(`numbers changed: [${digits(target.text)}] → [${digits(text)}]`)
      if (hangulRatio(text) < 0.5) problems.push('the rewrite is not in Korean')
      return problems
    },
  },
  {
    id: 'restructure-headings',
    kind: 'restructure',
    prompt: '이 문서의 맨 앞에 "개요"라는 1단계 제목을 넣고, 선택한 문단 앞에 그 내용을 요약한 2단계 제목을 넣어 주세요. 다른 문단은 그대로 두세요.',
    applies: (doc) => doc.paragraphCount(0) > 2,
    select(s) {
      const p = bodyParagraphs(s, 20)[1] ?? bodyParagraphs(s, 20)[0]
      if (!p) return []
      selectParagraph(s, p.index)
      return [p.id]
    },
    check(before, after, _ctx) {
      const problems = untouched(before, after, new Set())
      const fresh = added(before, after)
      if (fresh.length < 2) problems.push(`expected two new headings, got ${fresh.length} new paragraphs`)
      if (after.paragraphs[0]?.text.trim() !== '개요') problems.push(`the document does not start with "개요": ${JSON.stringify(after.paragraphs[0]?.text)}`)
      const first = fresh.find((p) => p.text.trim() === '개요')
      const second = fresh.find((p) => p !== first)
      if (first && second && first.styleId === second.styleId) problems.push('the two headings use the same level')
      if (first && first.styleId === 0) problems.push('the level-1 heading has no outline style')
      return problems
    },
  },
  {
    id: 'table-from-lines',
    kind: 'table',
    prompt: '선택한 문단 바로 뒤에 "구분 | 내용" 두 열의 표를 만들어 이 문단의 핵심 항목 세 가지를 정리해 주세요.',
    applies: (doc) => doc.paragraphCount(0) > 1,
    select(s) {
      const p = bodyParagraphs(s, 30)[0]
      if (!p) return []
      selectParagraph(s, p.index)
      return [p.id]
    },
    check(before, after, { selected }) {
      const problems = untouched(before, after, new Set())
      if (after.tables <= before.tables) problems.push('no table was added')
      const order = after.paragraphs.map((p) => p.id)
      const at = order.indexOf(selected[0]!)
      const host = after.paragraphs.findIndex((p, i) => i > at && p.tables > 0 && !before.paragraphs.some((b) => b.id === p.id))
      if (at >= 0 && (host < 0 || host > at + 2)) problems.push('the table is not right after the selected paragraph')
      return problems
    },
  },
  {
    id: 'header-set',
    kind: 'header',
    prompt: '머리말을 "2026년 업무계획(안) — 대외비"로 설정해 주세요.',
    applies: () => true,
    check(before, after) {
      const problems = untouched(before, after, new Set())
      if (after.header.replace(/\s+/g, ' ').trim() !== '2026년 업무계획(안) — 대외비') problems.push(`header is ${JSON.stringify(after.header)}`)
      return problems
    },
  },
  {
    id: 'question-only',
    kind: 'question',
    prompt: '이 문서는 무엇에 관한 문서인지 한두 문장으로 알려 주세요. 문서는 고치지 마세요.',
    applies: () => true,
    check(before, after, { reply, mutated }) {
      const problems = untouched(before, after, new Set())
      if (mutated) problems.push('a question changed the document')
      if (!reply.trim()) problems.push('no answer')
      return problems
    },
  },
]
