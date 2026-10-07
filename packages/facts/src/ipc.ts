import type { FactDef, FactsState, FactUse } from './model'

/**
 * Linked figures over IPC. The shell's main process owns the store; Home and
 * every editor read it and send commands on these channels, and every change
 * is broadcast on `changed` to all views.
 */
export const FACTS_CHANNELS = {
  get: 'facts:get',
  command: 'facts:command',
  changed: 'facts:changed',
} as const

/**
 * What a view may ask for. The main process fills in who made an edit, when,
 * and the update id, so a renderer can never forge them.
 */
export type FactsCommand =
  | { type: 'defineFact'; fact: FactDef; value: number }
  | { type: 'useFact'; file: string; use: FactUse }
  | { type: 'dropUse'; file: string; fact: string; where?: string }
  | { type: 'editSource'; fact: string; file: string; to: number }
  | { type: 'keepFile' | 'keepOld' | 'keepSentence' | 'declineSentence'; update: string; file: string }

export interface FactsApi {
  get(): Promise<FactsState>
  /** Applies one command; resolves with the state after it was saved. */
  command(cmd: FactsCommand): Promise<FactsState>
  onChanged(handler: (state: FactsState) => void): () => void
}
