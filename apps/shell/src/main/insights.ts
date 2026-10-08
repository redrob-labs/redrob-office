/*
 * Redrob Office's part of the Redrob Console's AI work insights.
 *
 * The editors' agent loops record facts about each AI session: a message was sent, a tool ran and
 * whether it changed the file, an answer finished, the person stopped the run. Counts, flags and
 * times, never text (packages/agent-core/src/insights.ts). This module folds a session's facts into
 * one tally when it has been quiet for 15 minutes, labels it in the console's vocabulary, keeps it in
 * a small outbox in userData, and sends the outbox to the console with the Redrob Console key.
 *
 * The labels follow Cowork's structural labeler (redrob-cowork apps/server/src/insights/labeler.ts),
 * so a session reads the same whichever app it happened in. What only reading the conversation could
 * tell (the kind of work, whether the first message said what done looks like) is left out, as
 * Cowork leaves it out until a work classifier passes its evaluation.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import {
  INSIGHT_SESSION_QUIET_MS,
  type InsightRecord,
  type InsightSurface,
} from '@genoffice/agent-core'

export const LABELER_ID = 'office-structural'
export const LABELER_VERSION = '1'

/** The console's limit for one request. */
const BATCH = 500
/** Sessions kept while the console is out of reach; the oldest go first past this. */
const OUTBOX_MAX = 2_000
/** Tool calls per message above which the agent did the work, as Cowork counts it. */
const DELEGATED_STEPS_PER_TURN = 6
/** A gap between an answer and the next message counts at most this towards attention. */
const ATTENTION_CAP_MIN = 10

const SURFACES: readonly InsightSurface[] = ['docs', 'sheets', 'slides', 'pdf', 'markdown']
const SESSION_ID = /^of_[0-9a-f]{32}$/

export type SessionTally = {
  sessionId: string
  surface: InsightSurface
  startedAt: number
  lastAt: number
  messages: number
  /** The first message went with the open document, a selection or an image. */
  firstWithContext: boolean
  /** Messages sent in Plan mode, which offers the model no tools. */
  planMessages: number
  tools: number
  changes: number
  answers: number
  stopped: number
  /** A message from the person after a stop: the run was redirected. */
  redirected: number
  /** Minutes from each message to its answer, all added up. */
  busyMinutes: number
  /** Minutes from each answer to the next message, each gap capped. */
  attentionMinutes: number
  /** When the latest message was sent and the latest answer came, for the two sums above. */
  lastMessageAt: number | null
  lastAnswerAt: number | null
  lastWasStop: boolean
}

export type LabeledSession = {
  externalId: string
  startedAt: string
  toolKey: 'office'
  mode: number
  producedOutput: boolean
  brief: boolean
  context: boolean
  checked: boolean
  steerApplicable: boolean
  steered: boolean
  outward: boolean
  sensitiveTouched: boolean
  sensitiveOk: boolean
  turns: number
  agent?: {
    actions: number
    instructions: number
    agentMinutes: number
    attentionMinutes: number
    autoApproved: boolean
    interrupted: boolean
    agentsAtOnce: number
    humanEquivHours: number
  }
  labelerId: string
  labelerVersion: string
}

/** A fact from a renderer, checked before it is believed: only these shapes, nothing extra. */
export function parseRecord(input: unknown): InsightRecord | null {
  if (!input || typeof input !== 'object') return null
  const r = input as Record<string, unknown>
  if (typeof r.sessionId !== 'string' || !SESSION_ID.test(r.sessionId)) return null
  if (!SURFACES.includes(r.surface as InsightSurface)) return null
  if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return null
  const base = { sessionId: r.sessionId, surface: r.surface as InsightSurface, at: r.at }
  const bool = (v: unknown) => v === true
  switch (r.kind) {
    case 'message':
      return { ...base, kind: 'message', context: bool(r.context), readOnly: bool(r.readOnly) }
    case 'tool':
      return { ...base, kind: 'tool', changed: bool(r.changed), failed: bool(r.failed) }
    case 'answer':
      return { ...base, kind: 'answer' }
    case 'stopped':
      return { ...base, kind: 'stopped' }
    default:
      return null
  }
}

const minutes = (ms: number) => Math.max(0, ms) / 60_000

/** Adds one fact to its session's tally. */
export function addFact(tallies: Map<string, SessionTally>, f: InsightRecord): void {
  let t = tallies.get(f.sessionId)
  if (!t) {
    t = {
      sessionId: f.sessionId,
      surface: f.surface,
      startedAt: f.at,
      lastAt: f.at,
      messages: 0,
      firstWithContext: false,
      planMessages: 0,
      tools: 0,
      changes: 0,
      answers: 0,
      stopped: 0,
      redirected: 0,
      busyMinutes: 0,
      attentionMinutes: 0,
      lastMessageAt: null,
      lastAnswerAt: null,
      lastWasStop: false,
    }
    tallies.set(f.sessionId, t)
  }
  t.lastAt = Math.max(t.lastAt, f.at)
  switch (f.kind) {
    case 'message':
      if (t.messages === 0) t.firstWithContext = f.context
      t.messages += 1
      if (f.readOnly) t.planMessages += 1
      if (t.lastWasStop) t.redirected += 1
      if (t.lastAnswerAt !== null) {
        t.attentionMinutes += Math.min(ATTENTION_CAP_MIN, minutes(f.at - t.lastAnswerAt))
      }
      t.lastMessageAt = f.at
      t.lastWasStop = false
      break
    case 'tool':
      t.tools += 1
      if (f.changed) t.changes += 1
      break
    case 'answer':
      t.answers += 1
      if (t.lastMessageAt !== null) t.busyMinutes += minutes(f.at - t.lastMessageAt)
      t.lastAnswerAt = f.at
      t.lastWasStop = false
      break
    case 'stopped':
      t.stopped += 1
      if (t.lastMessageAt !== null) t.busyMinutes += minutes(f.at - t.lastMessageAt)
      t.lastWasStop = true
      break
  }
}

/**
 * The mode, by Crew's definitions as Cowork applies them. Office runs one agent at a time, so it
 * never reaches 5 (Orchestrate).
 *   4 Delegate: the agent took many steps on its own for each message and changed the file.
 *   3 Iterate: the file changed over three or more messages.
 *   2 Draft: the file changed in one or two.
 *   1 Learn: nothing changed, but a back and forth.
 *   0 Look up: one question, nothing changed.
 */
export function modeOf(t: SessionTally): number {
  const produced = t.changes > 0
  if (produced && t.messages > 0 && t.tools / t.messages >= DELEGATED_STEPS_PER_TURN) return 4
  if (produced) return t.messages >= 3 ? 3 : 2
  return t.messages >= 2 ? 1 : 0
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function labelSession(t: SessionTally): LabeledSession {
  const mode = modeOf(t)
  return {
    externalId: t.sessionId,
    startedAt: new Date(t.startedAt).toISOString().replace(/\.\d+Z$/, 'Z'),
    toolKey: 'office',
    mode,
    producedOutput: t.changes > 0,
    // Needs the work classifier, which reads the first message on this machine.
    brief: false,
    context: t.firstWithContext,
    // Office runs no tests or second checks of its own; a check is the person's, and unseen here.
    checked: false,
    steerApplicable: t.stopped > 0 || (mode >= 3 && t.messages >= 3),
    steered: t.redirected > 0,
    // The editors change a file on this computer; nothing is sent to anyone from the AI panel.
    outward: false,
    // Office has no privacy gate yet, so it cannot say what a send touched.
    sensitiveTouched: false,
    sensitiveOk: false,
    turns: t.messages,
    ...(mode >= 4
      ? {
          agent: {
            actions: t.tools,
            instructions: Math.max(1, t.messages),
            agentMinutes: round2(Math.min(100_000, t.busyMinutes)),
            attentionMinutes: round2(Math.min(100_000, t.attentionMinutes)),
            // The editors ask no permission for a step: every step is approved by running the panel.
            autoApproved: true,
            interrupted: t.stopped > 0,
            agentsAtOnce: 1,
            // Crew's "work done by agents" needs the kind of work's baseline; the console estimates it.
            humanEquivHours: 0,
          },
        }
      : {}),
    labelerId: LABELER_ID,
    labelerVersion: LABELER_VERSION,
  }
}

/** Sessions quiet for the window, labeled, and removed from the tallies. A session with no message is dropped. */
export function finishQuiet(
  tallies: Map<string, SessionTally>,
  now: number,
  all = false,
): LabeledSession[] {
  const done: LabeledSession[] = []
  for (const [id, t] of tallies) {
    if (!all && now - t.lastAt < INSIGHT_SESSION_QUIET_MS) continue
    tallies.delete(id)
    if (t.messages > 0) done.push(labelSession(t))
  }
  return done
}

/** The outbox: labeled sessions waiting for the console, in one JSON file in userData. */
export class Outbox {
  constructor(private readonly path: string) {}

  read(): LabeledSession[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'))
      return Array.isArray(parsed) ? (parsed as LabeledSession[]) : []
    } catch {
      return []
    }
  }

  private write(sessions: LabeledSession[]): void {
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(sessions), 'utf8')
    renameSync(tmp, this.path)
  }

  add(sessions: LabeledSession[]): void {
    if (!sessions.length) return
    const byId = new Map(this.read().map((s) => [s.externalId, s]))
    for (const s of sessions) byId.set(s.externalId, s)
    this.write([...byId.values()].slice(-OUTBOX_MAX))
  }

  remove(ids: ReadonlySet<string>): void {
    if (!ids.size) return
    this.write(this.read().filter((s) => !ids.has(s.externalId)))
  }
}

export type SyncOutcome =
  | { status: 'sent'; settled: number }
  | { status: 'empty' }
  | { status: 'no-key' }
  | { status: 'refused'; code: number }
  | { status: 'unreachable' }

/**
 * Sends the outbox to the console in batches. Sessions the console accepted, updated or rejected
 * leave the outbox; anything without an answer (no key, a refused key, the console out of reach)
 * stays for the next run.
 */
export async function syncOnce(opts: {
  outbox: Outbox
  apiKey: string | null
  base: string
  fetch: (url: string, init: RequestInit) => Promise<Response>
}): Promise<SyncOutcome> {
  const pending = opts.outbox.read()
  if (!pending.length) return { status: 'empty' }
  if (!opts.apiKey?.trim()) return { status: 'no-key' }
  let settled = 0
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH)
    let res: Response
    try {
      res = await opts.fetch(`${opts.base}/insights/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({ sessions: batch }),
      })
    } catch {
      return settled ? { status: 'sent', settled } : { status: 'unreachable' }
    }
    if (res.status === 401 || res.status === 403) return { status: 'refused', code: res.status }
    // The console refused the batch's shape. Sending it again would not change that, and keeping
    // it would hold every later session back, so it leaves the outbox.
    if (res.status === 400) {
      opts.outbox.remove(new Set(batch.map((s) => s.externalId)))
      settled += batch.length
      continue
    }
    if (!res.ok) return settled ? { status: 'sent', settled } : { status: 'unreachable' }
    // A 200 settles the whole batch: each session was stored, updated, or refused with a reason
    // that sending it again would not change.
    opts.outbox.remove(new Set(batch.map((s) => s.externalId)))
    settled += batch.length
  }
  return { status: 'sent', settled }
}
