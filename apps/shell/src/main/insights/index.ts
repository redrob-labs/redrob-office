/**
 * Work labels for the Redrob Console's insights, on this machine (redrob-cowork
 * docs/features/ai-work-insights/office-and-design.md).
 *
 * Each editor's AgentLoop reports its session through agent-core's `WorkSessionTracker`, over
 * `insights:event`: facts (counts, flags and times) and, once per session, the first instruction. Here:
 *   - the facts fold into one tally per session (@redrob-labs/work-labeller's `SessionRecorder`);
 *   - the first instruction goes to the work classifier in a utility process, and only its labels are kept;
 *   - a session quiet for 15 minutes is labeled and queued in `insights-outbox.json`;
 *   - the queue goes to the engine's insights route, which sends it with the key it holds.
 *
 * The model (multilingual-e5-base, 278 MB) is downloaded on first use, silently, after a chat has
 * finished, from the release the package pins. Until it is ready, sessions are labeled without a kind of
 * work; their text is never kept to label later.
 */
import { join } from 'node:path'

import { app, ipcMain, utilityProcess, type UtilityProcess } from 'electron'

import { engineCustody } from '@genoffice/ai-provider'
import {
  SessionRecorder,
  WorkModelFetcher,
  parseFact,
  type LabelingApp,
  type WorkLabel,
  type WorkModelState,
} from '@redrob-labs/work-labeller/node'

import type { InsightsStatus } from '../../shared/home-api'

import { FileOutbox } from './outbox'
import { syncToEngine } from './sync'
import type { LabelReply, LabelRequest } from './worker'

export const OFFICE_LABELING: LabelingApp = { toolKey: 'office', idPrefix: 'of_', labelerId: 'office', labelerVersion: '1' }

const MINUTE = 60_000
const SYNC_EVERY_MS = 10 * MINUTE
const SYNC_JITTER_MS = 2 * MINUTE
const LABEL_TIMEOUT_MS = 30_000
/** What the classifier reads of a first message; it reads 256 tokens at most anyway. */
const MAX_TEXT = 4_000

export type InsightsDeps = {
  recorder: Pick<SessionRecorder, 'observe' | 'observeFirstMessage'>
  label: (text: string) => Promise<WorkLabel | null>
  /** Called after a run ends: the moment the model may be fetched. */
  afterRun: () => void
}

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0

/** One message from a renderer. Exported for tests: everything is re-checked, nothing else is kept. */
export async function handleInsightsMessage(message: unknown, deps: InsightsDeps): Promise<void> {
  if (typeof message !== 'object' || message === null) return
  const record = message as Record<string, unknown>
  if (record.type === 'facts' && Array.isArray(record.facts)) {
    for (const raw of record.facts.slice(0, 200)) {
      const fact = parseFact(raw)
      if (!fact) continue
      deps.recorder.observe(fact)
      if (fact.kind === 'busy' && !fact.busy) deps.afterRun()
    }
    return
  }
  if (record.type === 'first-message' && isString(record.sessionID) && isString(record.messageID) && isString(record.text)) {
    await deps.recorder.observeFirstMessage(record.sessionID, record.messageID, record.text.slice(0, MAX_TEXT), deps.label)
  }
}

export function toStatus(state: WorkModelState): InsightsStatus {
  switch (state.state) {
    case 'downloading':
      return { state: 'downloading', percent: state.total ? Math.min(100, Math.floor((state.received / state.total) * 100)) : null }
    case 'ready':
      return { state: 'ready' }
    case 'failed':
      return { state: 'failed', reason: state.reason }
    default:
      return { state: 'absent' }
  }
}

/** The classifier process, started on first label and kept for the rest of the session. */
function workerClient(): (directory: string, text: string) => Promise<WorkLabel | null> {
  let child: UtilityProcess | null = null
  let next = 1
  const pending = new Map<number, (label: WorkLabel | null) => void>()
  const start = () => {
    const forked = utilityProcess.fork(join(__dirname, 'insights-worker.js'), [], { serviceName: 'Redrob work labels' })
    forked.on('message', (reply: LabelReply) => {
      pending.get(reply.id)?.(reply.label)
      pending.delete(reply.id)
    })
    forked.on('exit', () => {
      child = null
      for (const resolve of pending.values()) resolve(null)
      pending.clear()
    })
    return forked
  }
  return (directory, text) =>
    new Promise((resolve) => {
      child ??= start()
      const id = next++
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve(null)
      }, LABEL_TIMEOUT_MS)
      pending.set(id, (label) => {
        clearTimeout(timer)
        resolve(label)
      })
      const request: LabelRequest = { id, directory, text }
      child.postMessage(request)
    })
}

export function registerInsights(): () => void {
  const userData = app.getPath('userData')
  const outbox = new FileOutbox(join(userData, 'insights-outbox.json'))
  const recorder = new SessionRecorder(OFFICE_LABELING, (session) => outbox.add(session))
  const fetcher = new WorkModelFetcher(join(userData, 'models', 'insights'))
  const classify = workerClient()
  const deps: InsightsDeps = {
    recorder,
    label: async (text) => {
      const state = fetcher.state()
      return state.state === 'ready' ? classify(state.directory, text) : null
    },
    afterRun: () => void fetcher.request(),
  }

  ipcMain.on('insights:event', (_event, message: unknown) => {
    void handleInsightsMessage(message, deps).catch(() => undefined)
  })
  ipcMain.handle('insights:status', () => toStatus(fetcher.state()))

  const sweep = setInterval(() => void recorder.sweep(Date.now()).catch(() => undefined), MINUTE)
  sweep.unref()
  let syncTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleSync = (delay: number) => {
    syncTimer = setTimeout(() => {
      const custody = engineCustody()
      const run = custody ? syncToEngine(outbox, () => custody.target()) : Promise.resolve(null)
      void run.catch(() => undefined).finally(() => scheduleSync(SYNC_EVERY_MS + Math.floor((Math.random() * 2 - 1) * SYNC_JITTER_MS)))
    }, delay)
    syncTimer.unref()
  }
  scheduleSync(MINUTE)
  return () => {
    clearInterval(sweep)
    if (syncTimer) clearTimeout(syncTimer)
  }
}
