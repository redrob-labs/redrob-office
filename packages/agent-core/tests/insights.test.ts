import { describe, expect, it, vi } from 'vitest'
import {
  AgentLoop,
  INSIGHT_SESSION_QUIET_MS,
  type AgentSkill,
  type AgentStreamCallbacks,
  type AgentStreamRequest,
  type AgentTransport,
  type InsightRecord,
} from '../src'

/** Odd requests call `edit` once, even ones answer. Records each request. */
function transport(): AgentTransport & { requests: AgentStreamRequest[] } {
  const t = {
    requests: [] as AgentStreamRequest[],
    stream(request: AgentStreamRequest, cb: AgentStreamCallbacks) {
      t.requests.push(request)
      const first = t.requests.length % 2 === 1
      queueMicrotask(() => {
        if (first) cb.onToolCall({ id: `c${t.requests.length}`, name: 'edit', input: {} })
        else cb.onDelta('Done.')
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
  executeTool: vi.fn(() => ({ output: 'secret cell contents', summary: 'done', mutated: true })),
  buildContext: () => 'the open document',
}

const flush = async () => {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('insights facts', () => {
  it('records counts and flags, never text', async () => {
    const facts: InsightRecord[] = []
    const loop = new AgentLoop({
      transport: transport(),
      skill,
      insights: { surface: 'sheets', record: (f) => facts.push(f) },
    })
    loop.run('total the Q3 column for ACME Corp')
    await flush()
    expect(facts.map((f) => f.kind)).toEqual(['message', 'tool', 'answer'])
    expect(facts[0]).toMatchObject({ kind: 'message', context: true, readOnly: false })
    expect(facts[1]).toMatchObject({ kind: 'tool', changed: true, failed: false })
    const wire = JSON.stringify(facts)
    expect(wire).not.toContain('ACME')
    expect(wire).not.toContain('secret')
    expect(new Set(facts.map((f) => f.sessionId)).size).toBe(1)
    expect(facts[0]!.sessionId).toMatch(/^of_[0-9a-f]{32}$/)
  })

  it('sends the session id with each request, and only when insights are on', async () => {
    const on = transport()
    const facts: InsightRecord[] = []
    const surface = { surface: 'docs' as const, record: (f: InsightRecord) => facts.push(f) }
    new AgentLoop({ transport: on, skill, insights: surface }).run('go')
    await flush()
    expect(on.requests.length).toBe(2)
    expect(on.requests.every((r) => r.sessionId === facts[0]!.sessionId)).toBe(true)

    const off = transport()
    new AgentLoop({ transport: off, skill }).run('go')
    await flush()
    expect(off.requests[0]!.sessionId).toBeUndefined()
  })

  it('starts a new session after a quiet stretch, and after reset', async () => {
    const facts: InsightRecord[] = []
    let t = 1_000_000
    const now = vi.spyOn(Date, 'now').mockImplementation(() => t)
    const loop = new AgentLoop({
      transport: transport(),
      skill,
      insights: { surface: 'docs', record: (f) => facts.push(f) },
    })
    loop.run('one')
    await flush()
    t += INSIGHT_SESSION_QUIET_MS - 1
    loop.run('two')
    await flush()
    t += INSIGHT_SESSION_QUIET_MS + 1
    loop.run('three')
    await flush()
    loop.reset()
    loop.run('four')
    await flush()
    now.mockRestore()
    const ids = facts.filter((f) => f.kind === 'message').map((f) => f.sessionId)
    expect(ids).toHaveLength(4)
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[1])
    expect(ids[3]).not.toBe(ids[2])
  })

  it('records a stop', async () => {
    const facts: InsightRecord[] = []
    const slow: AgentTransport = { stream: () => ({ cancel: () => {} }) }
    const loop = new AgentLoop({
      transport: slow,
      skill,
      insights: { surface: 'slides', record: (f) => facts.push(f) },
    })
    loop.run('make a deck')
    await flush()
    loop.cancel()
    expect(facts.map((f) => f.kind)).toEqual(['message', 'stopped'])
  })

  it('never lets a failing recorder stop the work', async () => {
    const tr = transport()
    const loop = new AgentLoop({
      transport: tr,
      skill,
      insights: {
        surface: 'docs',
        record: () => {
          throw new Error('disk full')
        },
      },
    })
    loop.run('go')
    await flush()
    expect(tr.requests.length).toBe(2)
  })
})
