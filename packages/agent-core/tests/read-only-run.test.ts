import { describe, expect, it, vi } from 'vitest'
import { AgentLoop, type AgentSkill, type AgentStreamCallbacks, type AgentTransport } from '../src'

/** records how many tools each request offered */
function transport(): AgentTransport & { toolCounts: number[] } {
  const t = {
    toolCounts: [] as number[],
    stream(request: { tools: unknown[] }, cb: AgentStreamCallbacks) {
      t.toolCounts.push(request.tools.length)
      queueMicrotask(() => {
        cb.onDelta('1. Read the parties\n2. Fill them in')
        cb.onDone()
      })
      return { cancel: () => {} }
    },
  }
  return t
}

const skill: AgentSkill = {
  id: 'test',
  systemPrompt: 'system',
  tools: [{ name: 'edit', description: 'd', inputSchema: { type: 'object' } }],
  executeTool: vi.fn(() => ({ output: 'ok', summary: 'done', mutated: true })),
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('read-only runs (Plan mode)', () => {
  it('offers the model no tools, so nothing in the file can change', async () => {
    const tr = transport()
    const loop = new AgentLoop({ transport: tr, skill })
    loop.run('plan it', undefined, { readOnly: true })
    await flush()
    expect(tr.toolCounts).toEqual([0])
    expect(skill.executeTool).not.toHaveBeenCalled()
  })

  it('the next normal run offers the tools again', async () => {
    const tr = transport()
    const loop = new AgentLoop({ transport: tr, skill })
    loop.run('plan it', undefined, { readOnly: true })
    await flush()
    loop.run('run it')
    await flush()
    expect(tr.toolCounts).toEqual([0, 1])
  })
})
