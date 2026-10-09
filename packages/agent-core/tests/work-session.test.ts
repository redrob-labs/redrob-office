// A work session as AgentLoop sees it: facts out, never text, except the first instruction once.
import { describe, expect, it } from 'vitest'
import { AgentLoop, WorkSessionTracker } from '../src/index'
import type { AgentStreamCallbacks, AgentStreamRequest, AgentTransport, WorkSessionMessage } from '../src/index'

const SECRET = 'Refund 4,500,000 KRW to 김지원'

/** A model that calls one tool on the first turn, then answers. */
function scriptedTransport(seen: AgentStreamRequest[]): AgentTransport {
  return {
    stream(request: AgentStreamRequest, cb: AgentStreamCallbacks) {
      seen.push(request)
      queueMicrotask(() => {
        if (request.messages.at(-1)?.role === 'user') {
          cb.onToolCall({ id: 'call_1', name: 'edit', input: {} })
          cb.onStopReason?.('tool_use')
        } else {
          cb.onDelta('done')
        }
        cb.onDone()
      })
      return { cancel: () => {} }
    },
  }
}

function setup() {
  const messages: WorkSessionMessage[] = []
  const seen: AgentStreamRequest[] = []
  let n = 0
  const tracker = new WorkSessionTracker((m) => void messages.push(m), () => 1000, () => `id${(n += 1)}`)
  const done: Array<() => void> = []
  const loop = new AgentLoop({
    transport: scriptedTransport(seen),
    skill: {
      id: 'test',
      systemPrompt: 'sys',
      tools: [{ name: 'edit', description: 'edit', inputSchema: { type: 'object', properties: {} } }],
      async executeTool() {
        return { output: 'ok', mutated: true, summary: 'edited' }
      },
    },
    session: tracker,
    events: { onDone: () => done.shift()?.() },
  })
  const run = (text: string) =>
    new Promise<void>((resolve) => {
      done.push(resolve)
      loop.run(text)
    })
  return { messages, seen, loop, run }
}

const facts = (messages: WorkSessionMessage[]) => messages.flatMap((m) => (m.type === 'facts' ? m.facts : []))

describe('work session tracking', () => {
  it('reports turns, the tool that changed the file, and the end of the run, keyed to one session', async () => {
    const { messages, seen, run } = setup()
    await run(SECRET)
    expect(facts(messages).map((f) => f.kind)).toEqual(['user-turn', 'busy', 'tool', 'tool', 'assistant-done', 'busy', 'idle'])
    expect(facts(messages).find((f) => f.kind === 'tool' && f.status === 'completed')).toMatchObject({ effect: 'artifact' })
    expect(new Set(facts(messages).map((f) => f.sessionID))).toEqual(new Set(['id1']))
    expect(seen.every((r) => r.session === 'id1')).toBe(true)
  })

  it('sends the first instruction once, and no text in any fact', async () => {
    const { messages, run } = setup()
    await run(SECRET)
    await run('and the second one')
    const firsts = messages.filter((m) => m.type === 'first-message')
    expect(firsts).toEqual([{ type: 'first-message', sessionID: 'id1', messageID: 'id2', text: SECRET }])
    const factText = JSON.stringify(messages.filter((m) => m.type === 'facts'))
    expect(factText).not.toContain('김지원')
    expect(factText).not.toContain('second')
  })

  it('a new chat is a new session', async () => {
    const { messages, seen, loop, run } = setup()
    await run('first')
    loop.reset()
    await run('second')
    const sessions = [...new Set(facts(messages).map((f) => f.sessionID))]
    expect(sessions).toHaveLength(2)
    expect(messages.filter((m) => m.type === 'first-message')).toHaveLength(2)
    expect(seen.at(-1)?.session).toBe(sessions[1])
  })

  it('a loop without a tracker sends no session', async () => {
    const seen: AgentStreamRequest[] = []
    await new Promise<void>((resolve) => {
      const loop = new AgentLoop({
        transport: scriptedTransport(seen),
        skill: { id: 'test', systemPrompt: 's', tools: [], async executeTool() { return { output: '', summary: '' } } },
        events: { onDone: () => resolve() },
      })
      loop.run('hi')
    })
    expect(seen.every((r) => !('session' in r))).toBe(true)
  })
})
