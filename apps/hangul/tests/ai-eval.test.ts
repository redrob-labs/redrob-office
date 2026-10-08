// @vitest-environment jsdom
// The AI evaluation harness (spec task 3.8) on a real document with scripted
// agents: an agent that does the task right passes every check, and agents
// that overreach or do nothing are caught. The live run against the Redrob
// engine is `pnpm --filter @genoffice/hangul eval` (needs a Corpus and a key).
import { beforeAll, describe, expect, it } from 'vitest'
import type { AgentToolCall, AgentTransport } from '@genoffice/agent-core'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { EVAL_TASKS } from '../eval/tasks'
import { runEvalTask } from '../eval/run'

beforeAll(() => initHwpCoreNode())

function corpusDoc(): Uint8Array {
  const doc = HwpCoreDocument.blank()
  const lines = [
    '국립국어원은 2026년에 국어 정책의 기반을 다지고 국민의 언어생활을 지원하기 위하여 5대 과제를 추진한다.',
    '첫째, 공공언어 개선을 위해 중앙행정기관 48곳의 보도자료를 점검하고 개선 사례를 공유한다.',
    '둘째, 한국어 교원 3,200명을 대상으로 연수를 실시하여 교육의 질을 높인다.',
    '끝.',
  ]
  lines.forEach((l, i) => {
    doc.insertText(0, i, 0, l)
    if (i < lines.length - 1) doc.raw.splitParagraph(0, i, doc.paragraphLength(0, i))
  })
  return doc.export('hwpx')
}

/** A transport that plays a script: each turn either calls tools (computed from the request) or answers. */
function scripted(turns: Array<(req: { messages: unknown[] }) => { calls?: AgentToolCall[]; text?: string }>): AgentTransport {
  let n = 0
  return {
    stream(req, cb) {
      const turn = turns[n++] ?? (() => ({ text: '완료했습니다.' }))
      setTimeout(() => {
        const r = turn(req)
        if (r.text) cb.onDelta(r.text)
        for (const c of r.calls ?? []) cb.onToolCall(c)
        cb.onDone()
      }, 0)
      return { cancel() {} }
    },
  }
}

/** Node ids from the user turn's context ("id | kind | preview" lines). */
function ids(req: { messages: unknown[] }): number[] {
  const text = JSON.stringify(req.messages)
  return [...text.matchAll(/\\n(\d+) \| p/g)].map((m) => Number(m[1]))
}
function selected(req: { messages: unknown[] }): number {
  return Number(/User selection: paragraphs (\d+)/.exec(JSON.stringify(req.messages))![1])
}
const call = (name: string, input: Record<string, unknown>): AgentToolCall => ({ id: `${name}-${Math.random()}`, name, input })

const IDEAL: Record<string, Parameters<typeof scripted>[0]> = {
  'rewrite-formal': [(r) => ({ calls: [call('replace_blocks', { ids: [selected(r)], html: '<p>국립국어원은 2026년 국어 정책 기반 강화와 국민 언어생활 지원을 위해 5대 과제를 추진한다.</p>' })] })],
  'restructure-headings': [
    (r) => ({ calls: [call('insert_content', { where: 'start', html: '<h1>개요</h1>' }), call('insert_content', { id: selected(r), where: 'before', html: '<h2>한국어 교원 연수</h2>' })] }),
  ],
  'table-from-lines': [(r) => ({ calls: [call('insert_content', { id: selected(r), html: '<table><tr><th>구분</th><th>내용</th></tr><tr><td>대상</td><td>중앙행정기관</td></tr><tr><td>규모</td><td>48곳</td></tr><tr><td>방법</td><td>점검과 공유</td></tr></table>' })] })],
  'header-set': [() => ({ calls: [call('set_header_footer', { kind: 'header', text: '2026년 업무계획(안) — 대외비' })] })],
  'question-only': [() => ({ text: '국립국어원의 2026년 업무계획 문서입니다.' })],
}

describe('AI evaluation harness', () => {
  for (const task of EVAL_TASKS) {
    it(`an agent that does "${task.id}" right passes`, async () => {
      const r = await runEvalTask('plan', corpusDoc(), task, scripted(IDEAL[task.id]!))
      expect(r!.problems).toEqual([])
      expect(r!.pass).toBe(true)
    })
  }

  it('catches a rewrite that changes numbers and other paragraphs', async () => {
    const task = EVAL_TASKS.find((t) => t.id === 'rewrite-formal')!
    const r = await runEvalTask('plan', corpusDoc(), task, scripted([(q) => ({ calls: [call('replace_blocks', { ids: [selected(q)], html: '<p>공공언어를 50곳에서 개선한다.</p>' }), call('replace_text', { find: '3,200', replace: '3,000' })] })]))
    expect(r!.pass).toBe(false)
    expect(r!.problems.join('\n')).toMatch(/numbers changed/)
    expect(r!.problems.join('\n')).toMatch(/outside the target changed/)
  })

  it('catches an agent that claims an edit and makes none', async () => {
    const task = EVAL_TASKS.find((t) => t.id === 'header-set')!
    const r = await runEvalTask('plan', corpusDoc(), task, scripted([() => ({ text: '머리말을 설정했습니다.' }), () => ({ text: '머리말을 설정했습니다.' })]))
    expect(r!.pass).toBe(false)
    expect(r!.problems.join('\n')).toMatch(/header is ""/)
  })

  it('catches an edit on a question', async () => {
    const task = EVAL_TASKS.find((t) => t.id === 'question-only')!
    const r = await runEvalTask('plan', corpusDoc(), task, scripted([(q) => ({ calls: [call('delete_blocks', { ids: [ids(q).at(-1)] })] }), () => ({ text: '문서 요약입니다.' })]))
    expect(r!.pass).toBe(false)
    expect(r!.problems.join('\n')).toMatch(/question changed the document/)
  })
})
