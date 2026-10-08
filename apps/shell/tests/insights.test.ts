import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { INSIGHT_SESSION_QUIET_MS, type InsightRecord } from '@genoffice/agent-core'
import {
  addFact,
  finishQuiet,
  labelSession,
  LABELER_ID,
  Outbox,
  parseRecord,
  syncOnce,
  type LabeledSession,
  type SessionTally,
} from '../src/main/insights'

const ID = `of_${'a'.repeat(32)}`
const T0 = Date.UTC(2026, 9, 6, 1, 2, 3)

function tallyOf(facts: Array<Partial<InsightRecord> & { kind: InsightRecord['kind'] }>) {
  const tallies = new Map<string, SessionTally>()
  let at = T0
  for (const f of facts) {
    at += 60_000
    addFact(tallies, parseRecord({ sessionId: ID, surface: 'docs', at, ...f })!)
  }
  return tallies.get(ID)!
}
const msg = (context = false) => ({ kind: 'message' as const, context, readOnly: false })
const tool = (changed = true) => ({ kind: 'tool' as const, changed, failed: false })
const answer = { kind: 'answer' as const }

describe('parseRecord', () => {
  it('takes only the fact shapes, and drops anything extra', () => {
    const r = parseRecord({ sessionId: ID, surface: 'docs', at: 1, kind: 'message', context: true, readOnly: false, text: 'secret' })
    expect(r).toEqual({ sessionId: ID, surface: 'docs', at: 1, kind: 'message', context: true, readOnly: false })
    expect(parseRecord({ sessionId: 'not-ours', surface: 'docs', at: 1, kind: 'answer' })).toBeNull()
    expect(parseRecord({ sessionId: ID, surface: 'hangul', at: 1, kind: 'answer' })).toBeNull()
    expect(parseRecord({ sessionId: ID, surface: 'docs', at: 1, kind: 'prompt' })).toBeNull()
  })
})

describe('labels', () => {
  it('one question with nothing changed is a look-up', () => {
    expect(labelSession(tallyOf([msg(), answer]))).toMatchObject({ mode: 0, producedOutput: false, turns: 1 })
  })

  it('a back and forth with nothing changed is learning', () => {
    expect(labelSession(tallyOf([msg(), answer, msg(), answer])).mode).toBe(1)
  })

  it('a change in one or two messages is a draft, in three or more iterating', () => {
    expect(labelSession(tallyOf([msg(true), tool(), answer])).mode).toBe(2)
    expect(labelSession(tallyOf([msg(), tool(), answer, msg(), answer, msg(), tool(), answer])).mode).toBe(3)
  })

  it('many steps per message ending in a change is delegating, with agent figures', () => {
    const l = labelSession(tallyOf([msg(), tool(), tool(), tool(), tool(), tool(false), tool(), answer]))
    expect(l.mode).toBe(4)
    expect(l.agent).toMatchObject({ actions: 6, instructions: 1, agentsAtOnce: 1, interrupted: false })
    expect(l.agent!.agentMinutes).toBeGreaterThan(0)
  })

  it('reads context from the first message, and a message after a stop as steering', () => {
    const l = labelSession(tallyOf([msg(true), { kind: 'stopped' }, msg(), tool(), answer]))
    expect(l).toMatchObject({ context: true, steerApplicable: true, steered: true })
  })

  it('carries only labels, as Office and as its own labeler', () => {
    const l = labelSession(tallyOf([msg(), tool(), answer]))
    expect(l).toMatchObject({ externalId: ID, toolKey: 'office', labelerId: LABELER_ID, startedAt: '2026-10-06T01:03:03Z' })
    expect(Object.keys(l).sort()).toEqual(
      ['brief', 'checked', 'context', 'externalId', 'familyKey', 'labelerId', 'labelerVersion', 'mode', 'outward', 'producedOutput', 'sensitiveOk', 'sensitiveTouched', 'startedAt', 'steerApplicable', 'steered', 'toolKey', 'turns'].sort(),
    )
  })

  it('names the family of work from the editor, and none for Slides', () => {
    const family = (surface: string) => {
      const tallies = new Map<string, SessionTally>()
      addFact(tallies, parseRecord({ sessionId: ID, surface, at: T0, ...msg() })!)
      return labelSession(tallies.get(ID)!).familyKey
    }
    expect(family('docs')).toBe('write')
    expect(family('markdown')).toBe('write')
    expect(family('pdf')).toBe('write')
    expect(family('sheets')).toBe('sheet')
    expect(family('slides')).toBeUndefined()
  })
})

describe('finishing sessions', () => {
  it('labels a session once it has been quiet for the window, and drops one with no message', () => {
    const tallies = new Map<string, SessionTally>()
    addFact(tallies, parseRecord({ sessionId: ID, surface: 'sheets', at: T0, ...msg() })!)
    addFact(tallies, parseRecord({ sessionId: `of_${'b'.repeat(32)}`, surface: 'sheets', at: T0, ...tool() })!)
    expect(finishQuiet(tallies, T0 + INSIGHT_SESSION_QUIET_MS - 1)).toEqual([])
    const done = finishQuiet(tallies, T0 + INSIGHT_SESSION_QUIET_MS)
    expect(done.map((s) => s.externalId)).toEqual([ID])
    expect(tallies.size).toBe(0)
  })
})

describe('outbox and sync', () => {
  const session = (n: number): LabeledSession => ({
    ...labelSession(tallyOf([msg(), answer])),
    externalId: `of_${n.toString(16).padStart(32, '0')}`,
  })
  const box = () => new Outbox(join(mkdtempSync(join(tmpdir(), 'insights-')), 'outbox.json'))

  it('sends batches with the key and empties what the console answered', async () => {
    const outbox = box()
    outbox.add(Array.from({ length: 501 }, (_, i) => session(i)))
    const fetch = vi.fn(async () => new Response('{"accepted":1,"updated":0,"rejected":[]}', { status: 200 }))
    const out = await syncOnce({ outbox, apiKey: 'rk-1', base: 'https://console.test/v1', fetch })
    expect(out).toEqual({ status: 'sent', settled: 501 })
    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit]
    expect(url).toBe('https://console.test/v1/insights/sessions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer rk-1')
    expect(JSON.parse(init.body as string).sessions).toHaveLength(500)
    expect(outbox.read()).toEqual([])
  })

  it('keeps everything without a key, with a refused key, or when the console is out of reach', async () => {
    const outbox = box()
    outbox.add([session(1)])
    expect(await syncOnce({ outbox, apiKey: null, base: 'x', fetch: vi.fn() })).toEqual({ status: 'no-key' })
    const refused = vi.fn(async () => new Response('', { status: 401 }))
    expect((await syncOnce({ outbox, apiKey: 'k', base: 'x', fetch: refused })).status).toBe('refused')
    const olderConsole = vi.fn(async () => new Response('', { status: 400 }))
    expect((await syncOnce({ outbox, apiKey: 'k', base: 'x', fetch: olderConsole })).status).toBe('refused')
    const down = vi.fn(async () => {
      throw new Error('offline')
    })
    expect((await syncOnce({ outbox, apiKey: 'k', base: 'x', fetch: down })).status).toBe('unreachable')
    expect(outbox.read()).toHaveLength(1)
  })

  it('stores labels only, never text', () => {
    const outbox = box()
    outbox.add([session(1)])
    const raw = readFileSync((outbox as unknown as { path: string }).path, 'utf8')
    expect(raw).not.toMatch(/"text"|"prompt"|"content"/)
  })
})
