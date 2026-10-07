/**
 * The Docs Redrob panel's Plan or Run, status line and receipt (handoff
 * 55-agents, Redrob Office): a Plan run is read-only, the plan renders as a
 * document, and Run sends the approved steps as a normal run.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const panel = readFileSync(join(__dirname, '../src/renderer/ai/AiPanel.tsx'), 'utf8')

describe('Docs Redrob panel', () => {
  it('sends a Plan message as a read-only run, so nothing in the file can change', () => {
    expect(panel).toContain("if (mode === 'plan') runWith(planRequest(text), text, undefined, { planOf: text })")
    expect(panel).toContain('loop.run(instruction, images, { readOnly: !!runOptions?.planOf })')
  })

  it('renders the plan as a document and runs the approved steps as a normal run', () => {
    expect(panel).toContain('<PlanReply')
    expect(panel).toContain('runWith(runPlanRequest(request, steps), request, undefined, { planSteps: steps.length })')
  })

  it('carries Plan or Run in the composer bar and the status line under it', () => {
    expect(panel).toMatch(/tools=\{<RedrobModeSwitch/)
    expect(panel).toMatch(/status=\{\s*<RedrobStatus/)
  })

  it('ends each finished answer with one receipt, never on a failure', () => {
    expect(panel).toContain('{entry.report && !entry.error && !entry.streaming && turnEnded && (')
  })

  it('keeps the fail-closed failure and the rollback action', () => {
    expect(panel).toContain('<AgentFailure')
    expect(panel).toContain('onClick={() => rollback(i, entry.snapshot!)}')
  })
})
