import { emptyFactsState, type FactsState } from './model'
import { factsReducer, type FactsAction } from './reducer'

/** Where the facts index lives. The shell uses a JSON file; tests use memory. */
export interface FactsRepository {
  load(): Promise<FactsState>
  save(state: FactsState): Promise<void>
}

export class MemoryFactsRepository implements FactsRepository {
  private state: FactsState
  constructor(initial: FactsState = emptyFactsState()) {
    this.state = structuredClone(initial)
  }
  async load(): Promise<FactsState> {
    return structuredClone(this.state)
  }
  async save(state: FactsState): Promise<void> {
    this.state = structuredClone(state)
  }
}

export type FactsListener = (state: FactsState) => void

/**
 * The reducer plus a repository: one place that applies actions in order,
 * persists after each one, and tells listeners. Saves are serialised so the
 * file on disk always reflects the latest state.
 */
export class FactsStore {
  private state: FactsState = emptyFactsState()
  private readonly listeners = new Set<FactsListener>()
  private saving: Promise<void> = Promise.resolve()
  private loaded: Promise<void> | null = null

  constructor(private readonly repo: FactsRepository) {}

  load(): Promise<void> {
    this.loaded ??= this.repo.load().then((s) => {
      this.state = s
      this.emit()
    })
    return this.loaded
  }

  get(): FactsState {
    return this.state
  }

  /** Applies `action`; resolves once the result is saved. Returns the new state. */
  async dispatch(action: FactsAction): Promise<FactsState> {
    await this.load()
    const next = factsReducer(this.state, action)
    if (next === this.state) return next
    this.state = next
    this.emit()
    const snapshot = next
    this.saving = this.saving.catch(() => undefined).then(() => this.repo.save(snapshot))
    await this.saving
    return next
  }

  subscribe(fn: FactsListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state)
  }
}
