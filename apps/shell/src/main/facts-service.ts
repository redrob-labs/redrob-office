/// The linked-figure store for the whole app. Kept apart from index.ts so the
/// command parsing and the store wiring are unit-testable without Electron.
import {
  FactsStore,
  normalizeFactDef,
  normalizeFactUse,
  type FactsAction,
  type FactsState,
} from '@genoffice/facts'
import { FACTS_CHANNELS, type FactsCommand } from '../shared/facts-api'

/** Longest id or file path a command may carry. */
const MAX_ID = 4096

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID
const DECISIONS = new Set(['keepFile', 'keepOld', 'keepSentence', 'declineSentence'])

/** A command from a renderer, checked field by field; null when it is not one. */
export function parseFactsCommand(raw: unknown): FactsCommand | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as Record<string, unknown>
  switch (c.type) {
    case 'defineFact': {
      const fact = normalizeFactDef(c.fact)
      if (!fact || fact.id.length > MAX_ID || typeof c.value !== 'number' || !Number.isFinite(c.value)) return null
      return { type: 'defineFact', fact, value: c.value }
    }
    case 'useFact': {
      const use = normalizeFactUse(c.use)
      return isId(c.file) && use ? { type: 'useFact', file: c.file, use } : null
    }
    case 'dropUse':
      if (!isId(c.file) || !isId(c.fact)) return null
      if (c.where !== undefined && typeof c.where !== 'string') return null
      return c.where === undefined
        ? { type: 'dropUse', file: c.file, fact: c.fact }
        : { type: 'dropUse', file: c.file, fact: c.fact, where: c.where }
    case 'editSource':
      if (!isId(c.fact) || !isId(c.file) || typeof c.to !== 'number' || !Number.isFinite(c.to)) return null
      return { type: 'editSource', fact: c.fact, file: c.file, to: c.to }
    default:
      if (typeof c.type === 'string' && DECISIONS.has(c.type) && isId(c.update) && isId(c.file)) {
        return { type: c.type as 'keepFile', update: c.update, file: c.file }
      }
      return null
  }
}

export interface FactsServiceDeps {
  store: FactsStore
  /** Sends the new state to every view. */
  broadcast: (state: FactsState) => void
  /** Who is editing on this computer. */
  author: () => string
  now: () => Date
  newId: () => string
}

export function toFactsAction(cmd: FactsCommand, deps: Pick<FactsServiceDeps, 'author' | 'now' | 'newId'>): FactsAction {
  if (cmd.type !== 'editSource') return cmd
  return { ...cmd, by: deps.author(), at: deps.now().toISOString(), id: deps.newId() }
}

/** Runs one renderer command; throws on a malformed one so the caller sees it failed. */
export async function handleFactsCommand(raw: unknown, deps: FactsServiceDeps): Promise<FactsState> {
  const cmd = parseFactsCommand(raw)
  if (!cmd) throw new Error('Invalid facts command.')
  await deps.store.load()
  const before = deps.store.get()
  const after = await deps.store.dispatch(toFactsAction(cmd, deps))
  if (after !== before) deps.broadcast(after)
  return after
}

export interface IpcHandleLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
}

export function registerFactsIpc(ipc: IpcHandleLike, deps: FactsServiceDeps): void {
  ipc.handle(FACTS_CHANNELS.get, async () => {
    await deps.store.load()
    return deps.store.get()
  })
  ipc.handle(FACTS_CHANNELS.command, (_event, raw) => handleFactsCommand(raw, deps))
}
