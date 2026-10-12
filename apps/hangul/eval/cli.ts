// pnpm --filter @genoffice/hangul eval --corpus DIR [--out DIR] [--tasks id,id]
//
// Runs the evaluation tasks on every .hwp/.hwpx in the corpus against the
// Redrob engine and writes report.json plus the saved files for the 한글 2024
// runner. The model call goes through ai-provider's engine route, the same as
// the app's main process; the Console key comes from REDROB_CONSOLE_KEY in the
// environment of the person running it, is never written anywhere, and the
// endpoint is the engine's own (no caller-supplied URL).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { AgentTransport } from '@genoffice/agent-core'
import { REDROB_ENGINE_ID, streamForProvider } from '@genoffice/ai-provider'
import { initHwpCoreNode } from '@genoffice/hwp-core/node'
import { EVAL_TASKS } from './tasks'
import { runEvalTask, summarise, type EvalResult } from './run'

function engineTransport(apiKey: string, model: string): AgentTransport {
  return {
    stream(request, cb) {
      const controller = new AbortController()
      void streamForProvider(REDROB_ENGINE_ID, { apiKey, model }, request.system, request.messages, request.tools, 8192, {
        onDelta: cb.onDelta,
        onToolCall: cb.onToolCall,
        onReasoningDelta: (t) => cb.onReasoning?.(t),
        onStopReason: (r) => cb.onStopReason?.(r),
        signal: controller.signal,
      })
        .then(() => cb.onDone())
        .catch((e: unknown) => {
          cb.onError(e instanceof Error ? e.message : String(e))
          cb.onDone()
        })
      return { cancel: () => controller.abort() }
    },
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const opt = (name: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const corpus = resolve(opt('corpus') ?? process.env.HANGUL_CORPUS_DIR ?? '')
  const out = resolve(opt('out') ?? '.hangul-eval')
  const only = opt('tasks')?.split(',')
  const key = process.env.REDROB_CONSOLE_KEY ?? ''
  if (!key) throw new Error('set REDROB_CONSOLE_KEY to run the evaluation against the Redrob engine')
  if (!opt('corpus') && !process.env.HANGUL_CORPUS_DIR) throw new Error('give --corpus DIR or HANGUL_CORPUS_DIR')
  initHwpCoreNode()
  const transport = engineTransport(key, process.env.REDROB_EVAL_MODEL ?? '')
  const files = readdirSync(corpus, { recursive: true }).map(String).filter((f) => /\.hwpx?$/i.test(f))
  const results: EvalResult[] = []
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(join(corpus, f)))
    const id = basename(f).replace(/\.[^.]+$/, '')
    for (const task of EVAL_TASKS.filter((t) => !only || only.includes(t.id))) {
      const r = await runEvalTask(id, bytes, task, transport, join(out, 'saved'))
      if (!r) continue
      results.push(r)
      console.log(`${r.pass ? 'pass' : 'FAIL'}  ${id}  ${task.id}  ${r.ms} ms${r.problems.length ? `\n      ${r.problems.join('\n      ')}` : ''}`)
    }
  }
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'report.json'), JSON.stringify({ summary: summarise(results), results }, null, 2))
  console.log(JSON.stringify(summarise(results)))
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
