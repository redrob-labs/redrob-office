/**
 * Hands the outbox to the engine's `POST /api/insights/sessions` (redrob-code), which posts it to the
 * Console with the Redrob key the engine holds. Office never sees that key (AGENTS.md).
 *
 * Batches of 500, the Console's limit. Sessions the Console answered for (accepted, updated or
 * rejected) leave the outbox; a rejection is permanent and would only be refused again. A 404 means the
 * engine holds no Redrob key yet, and anything else unanswered stays for the next run.
 */
import type { EngineTarget } from '@genoffice/ai-provider'

import type { FileOutbox } from './outbox'

const BATCH = 500

export type SyncOutcome =
  | { status: 'nothing' }
  | { status: 'not-connected' }
  | { status: 'sent'; accepted: number; updated: number; rejected: number }
  | { status: 'refused'; code: number }
  | { status: 'unreachable' }

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

export async function syncToEngine(
  outbox: Pick<FileOutbox, 'list' | 'remove'>,
  target: () => Promise<EngineTarget>,
  fetchImpl: FetchLike = fetch,
): Promise<SyncOutcome> {
  const entries = await outbox.list()
  if (!entries.length) return { status: 'nothing' }
  let engine: EngineTarget
  try {
    engine = await target()
  } catch {
    return { status: 'unreachable' }
  }
  const authorization = `Basic ${Buffer.from(`${engine.username}:${engine.password}`, 'utf8').toString('base64')}`
  const url = new URL('/api/insights/sessions', engine.baseUrl).toString()
  const totals = { accepted: 0, updated: 0, rejected: 0 }
  for (let start = 0; start < entries.length; start += BATCH) {
    const batch = entries.slice(start, start + BATCH).map((entry) => entry.session)
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ sessions: batch }),
        signal: AbortSignal.timeout(40_000),
      })
    } catch {
      return totals.accepted + totals.updated + totals.rejected ? { status: 'sent', ...totals } : { status: 'unreachable' }
    }
    if (response.status === 404) return { status: 'not-connected' }
    if (!response.ok) return { status: 'refused', code: response.status }
    const answer = (await response.json().catch(() => ({}))) as { accepted?: unknown; updated?: unknown; rejected?: unknown }
    totals.accepted += count(answer.accepted)
    totals.updated += count(answer.updated)
    totals.rejected += Array.isArray(answer.rejected) ? answer.rejected.length : 0
    await outbox.remove(batch.map((session) => session.externalId))
  }
  return { status: 'sent', ...totals }
}
