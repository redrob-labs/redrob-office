import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FactsStore, MemoryFactsRepository, waitingFiles } from '../src'
import { JsonFileFactsRepository } from '../src/json-repository'
import { boardState, REV } from './fixture'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rr-facts-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('JsonFileFactsRepository', () => {
  it('starts empty when there is no file', async () => {
    const s = await new JsonFileFactsRepository(join(dir, 'none', 'facts.json')).load()
    expect(s.facts).toEqual({})
  })

  it('saves and loads the same state, leaving no temporary file', async () => {
    const path = join(dir, 'nested', 'facts.json')
    const repo = new JsonFileFactsRepository(path)
    await repo.save(boardState())
    expect(await repo.load()).toEqual(boardState())
    expect(await readdir(join(dir, 'nested'))).toEqual(['facts.json'])
  })

  it('moves a file that does not parse aside and starts empty', async () => {
    const path = join(dir, 'facts.json')
    await writeFile(path, '{ not json', 'utf8')
    const s = await new JsonFileFactsRepository(path).load()
    expect(s.facts).toEqual({})
    const names = await readdir(dir)
    expect(names.some((n) => n.startsWith('facts.json.corrupt-'))).toBe(true)
    const kept = names.find((n) => n.startsWith('facts.json.corrupt-'))!
    expect(await readFile(join(dir, kept), 'utf8')).toBe('{ not json')
  })
})

describe('FactsStore', () => {
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

  it('persists through the JSON file across instances', async () => {
    const path = join(dir, 'facts.json')
    const a = new FactsStore(new JsonFileFactsRepository(path))
    await a.dispatch({ type: 'defineFact', value: 1.5, fact: { id: 'x', label: 'X', source: { file: 'f', ref: 'A1' } } })
    const b = new FactsStore(new JsonFileFactsRepository(path))
    await b.load()
    expect(b.get().values.x).toBe(1.5)
  })
})
