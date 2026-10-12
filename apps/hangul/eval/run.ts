// Runs the Hangul AI evaluation (spec task 3.8): the real agent loop and the
// real Hangul skill on a document, over any transport. Each result is saved in
// both formats and reopened by the engine; with `outDir` the files are kept
// for the 한글 2024 runner, which opens them (no repair prompt) and diffs them
// against the original (blocked on the runner, P-1).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AgentLoop, type AgentTransport } from '@genoffice/agent-core'
import { HwpCoreDocument } from '@genoffice/hwp-core'
import { Session } from '@genoffice/hwp-editor'
import { createHangulSkill } from '../src/renderer/ai/hangul-skill'
import { snapshot, type EvalTask } from './tasks'

export interface EvalResult {
  doc: string
  task: string
  kind: EvalTask['kind']
  pass: boolean
  problems: string[]
  reply: string
  tools: Array<{ name: string; ok: boolean }>
  ms: number
}

export async function runEvalTask(docId: string, bytes: Uint8Array, task: EvalTask, transport: AgentTransport, outDir?: string): Promise<EvalResult | null> {
  const doc = HwpCoreDocument.open(bytes)
  if (!task.applies(doc)) {
    doc.dispose()
    return null
  }
  const format = doc.sourceFormat() === 'hwpx' ? 'hwpx' : 'hwp'
  const s = new Session(doc, format)
  const selected = task.select?.(s) ?? []
  const before = snapshot(s)
  const tools: EvalResult['tools'] = []
  let mutated = false
  const started = Date.now()
  const result = await new Promise<{ text: string; error?: string }>((resolve) => {
    const loop = new AgentLoop({
      transport,
      skill: createHangulSkill({ getSession: () => s }),
      maxTurns: 30,
      events: {
        onToolExecuted: ({ call, execution }) => {
          tools.push({ name: call.name, ok: !execution.isError })
          if (execution.mutated) mutated = true
        },
        onDone: ({ text }) => resolve({ text }),
        onError: (error) => resolve({ text: '', error }),
      },
    })
    loop.run(task.prompt)
  })
  const problems: string[] = []
  if (result.error) problems.push(`run failed: ${result.error}`)
  s.settle()
  const after = snapshot(s)
  problems.push(...task.check(before, after, { selected, reply: result.text, mutated }))
  for (const f of ['hwp', 'hwpx'] as const) {
    try {
      const saved = s.export(f)
      const back = HwpCoreDocument.open(saved)
      const reopened = back.outline().sections[0]?.paragraphs.map((p) => back.readNodes([p.id])[0]).map((r) => (r && !r.missing ? r.text : '')) ?? []
      const want = after.paragraphs.map((p) => p.text)
      if (f === format && JSON.stringify(reopened) !== JSON.stringify(want)) problems.push(`the ${f} save reopens with different text`)
      back.dispose()
      if (outDir) {
        mkdirSync(outDir, { recursive: true })
        writeFileSync(join(outDir, `${docId}--${task.id}.${f}`), saved)
      }
    } catch (e) {
      problems.push(`${f} save or reopen failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  s.dispose()
  doc.dispose()
  return { doc: docId, task: task.id, kind: task.kind, pass: problems.length === 0, problems, reply: result.text, tools, ms: Date.now() - started }
}

/** Pass rate by task kind, for the report. */
export function summarise(results: EvalResult[]): Record<string, { pass: number; total: number }> {
  const out: Record<string, { pass: number; total: number }> = {}
  for (const r of results) {
    const k = (out[r.kind] ??= { pass: 0, total: 0 })
    k.total += 1
    if (r.pass) k.pass += 1
  }
  return out
}
