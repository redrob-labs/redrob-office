import { describe, expect, it } from 'vitest'
import { FactsStore, MemoryFactsRepository, waitingFiles } from '../src'
import { boardState, REV } from './fixture'

// The Node-backed JsonFileFactsRepository (and its persistence tests) was
// dropped in the UI-only build: it is the only part of @genoffice/facts that
// touches the filesystem. The in-memory repository below is what the renderer
// uses, so these tests cover the kept, browser-safe surface.

describe('FactsStore (MemoryFactsRepository)', () => {
  it('applies actions in order, saves each, and tells listeners', async () => {
    const repo = new MemoryFactsRepository(boardState())
    const store = new FactsStore(repo)
    const seen: number[] = []
    store.subscribe((s) => seen.push(s.values[REV] ?? 0))
    await store.load()
    await Promise.all([
      store.dispatch({ type: 'editSource', fact: REV, file: 'forecast', to: 3.9, by: 'felix', at: 'now', id: 'a' }),
      store.dispatch({ type: 'keepFile', update: 'a', file: 'deck' }),
    ])
    expect(seen).toEqual([3.86, 3.9, 3.9])
    const saved = await repo.load()
    expect(saved.kept[REV]!.deck).toBe(3.9)
    expect(waitingFiles(saved)).toEqual(['memo', 'update'])
  })

  it('does not save or notify when an action changes nothing', async () => {
    const repo = new MemoryFactsRepository(boardState())
    const store = new FactsStore(repo)
    await store.load()
    let calls = 0
    store.subscribe(() => (calls += 1))
    await store.dispatch({ type: 'keepFile', update: 'missing', file: 'memo' })
    expect(calls).toBe(0)
  })

  it('persists through the in-memory repository across store instances', async () => {
    const repo = new MemoryFactsRepository()
    const a = new FactsStore(repo)
    await a.dispatch({ type: 'defineFact', value: 1.5, fact: { id: 'x', label: 'X', source: { file: 'f', ref: 'A1' } } })
    const b = new FactsStore(repo)
    await b.load()
    expect(b.get().values.x).toBe(1.5)
  })
})
