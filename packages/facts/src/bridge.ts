import { FACTS_CHANNELS, type FactsCommand } from './ipc'
import type { FactsState } from './model'
import { normalizeFactsState } from './normalize'

/** What an editor preload exposes to read and change the shell's linked-figure index. */
export interface FactsBridgeApi {
  /** null outside the suite, or when the shell could not read its index */
  getFacts(): Promise<FactsState | null>
  /** rejects when the shell refused or could not save the command */
  factsCommand(cmd: FactsCommand): Promise<FactsState>
  onFactsChanged(handler: (state: FactsState) => void): () => void
}

/** the slice of ipcRenderer the bridge needs (structural: no Electron import here) */
export interface FactsIpcLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
}

/** The facts bridge for an editor preload; every crossing is re-normalised. */
export function factsBridge(ipc: FactsIpcLike): FactsBridgeApi {
  return {
    getFacts: () =>
      ipc
        .invoke(FACTS_CHANNELS.get)
        .then((s) => normalizeFactsState(s))
        .catch(() => null),
    factsCommand: (cmd) => ipc.invoke(FACTS_CHANNELS.command, cmd).then((s) => normalizeFactsState(s)),
    onFactsChanged: (handler) => {
      const listener = (_e: unknown, s: unknown) => handler(normalizeFactsState(s))
      ipc.on(FACTS_CHANNELS.changed, listener)
      return () => {
        ipc.removeListener(FACTS_CHANNELS.changed, listener)
      }
    },
  }
}
