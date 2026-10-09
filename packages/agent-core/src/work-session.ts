/**
 * One AI work session, as the Redrob Console's insights count it, reduced to facts on the way out.
 *
 * A session is one conversation in a panel: from its first run until "New chat" (`AgentLoop.reset()`).
 * The tracker turns the loop's runs and events into facts (counts, flags and times, never text) and hands
 * them to a sink; the shell's main process folds them into labels (@redrob-labs/work-labeller). The one
 * exception is the session's first instruction, sent once on its own so the main process can classify the
 * kind of work on this machine and drop the text.
 *
 * The fact shapes are the package's `Fact`, written out here so agent-core keeps no dependency on it;
 * the main process re-checks every one with its `parseFact`.
 */
import type { AgentLoopEvents } from './loop'

export type WorkFact =
  | { kind: 'user-turn'; sessionID: string; messageID: string; at: number; attachedSource: boolean }
  | { kind: 'assistant-done'; sessionID: string; messageID: string; at: number }
  | {
      kind: 'tool'
      sessionID: string
      callID: string
      at: number
      status: 'running' | 'completed' | 'error'
      effect: 'artifact' | 'other'
    }
  | { kind: 'busy'; sessionID: string; at: number; busy: boolean }
  | { kind: 'aborted'; sessionID: string; at: number }
  | { kind: 'idle'; sessionID: string; at: number }

export type WorkSessionMessage =
  | { type: 'facts'; facts: WorkFact[] }
  | { type: 'first-message'; sessionID: string; messageID: string; text: string }

/** What AgentLoop calls; `key()` is what its model requests carry as the session. */
export interface AgentSessionObserver {
  run(instruction: string, attachedSource: boolean): void
  reset(): void
  key(): string | undefined
  readonly events: AgentLoopEvents<unknown>
}

export class WorkSessionTracker implements AgentSessionObserver {
  private current: string | null = null
  readonly events: AgentLoopEvents<unknown>

  constructor(
    private readonly sink: (message: WorkSessionMessage) => void,
    private readonly now: () => number = Date.now,
    private readonly id: () => string = () => crypto.randomUUID(),
  ) {
    this.events = {
      onToolStart: (call) => this.emit({ kind: 'tool', sessionID: this.session(), callID: call.id, at: this.now(), status: 'running', effect: 'other' }),
      onToolExecuted: ({ call, execution }) =>
        this.emit({
          kind: 'tool',
          sessionID: this.session(),
          callID: call.id,
          at: this.now(),
          status: execution.isError ? 'error' : 'completed',
          effect: execution.mutated ? 'artifact' : 'other',
        }),
      onDone: (result) => this.end(result.cancelled),
      onError: () => this.end(false),
    }
  }

  key(): string | undefined {
    return this.current ?? undefined
  }

  private session(): string {
    this.current ??= this.id()
    return this.current
  }

  private emit(...facts: WorkFact[]): void {
    if (!this.current) return
    try {
      this.sink({ type: 'facts', facts })
    } catch {
      // Insights never break a run.
    }
  }

  run(instruction: string, attachedSource: boolean): void {
    const first = this.current === null
    const sessionID = this.session()
    const messageID = this.id()
    const at = this.now()
    this.emit({ kind: 'user-turn', sessionID, messageID, at, attachedSource }, { kind: 'busy', sessionID, at, busy: true })
    if (first) {
      try {
        this.sink({ type: 'first-message', sessionID, messageID, text: instruction })
      } catch {
        // as above
      }
    }
  }

  private end(cancelled: boolean): void {
    if (!this.current) return
    const sessionID = this.current
    const at = this.now()
    const facts: WorkFact[] = []
    if (cancelled) facts.push({ kind: 'aborted', sessionID, at })
    else facts.push({ kind: 'assistant-done', sessionID, messageID: this.id(), at })
    facts.push({ kind: 'busy', sessionID, at, busy: false }, { kind: 'idle', sessionID, at })
    this.emit(...facts)
  }

  reset(): void {
    this.current = null
  }
}
