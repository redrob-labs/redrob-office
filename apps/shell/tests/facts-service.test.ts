import { describe, expect, it, vi } from 'vitest'
import { FactsStore, MemoryFactsRepository, waitingFiles } from '@genoffice/facts'
import {
  handleFactsCommand,
  parseFactsCommand,
  registerFactsIpc,
  type FactsServiceDeps,
} from '../src/main/facts-service'
import { FACTS_CHANNELS } from '../src/shared/facts-api'

const REV = 'q3-revenue'

function deps(): FactsServiceDeps & { broadcast: ReturnType<typeof vi.fn> } {
  let n = 0
  return {
    store: new FactsStore(new MemoryFactsRepository()),
    broadcast: vi.fn(),
    author: () => 'felix',
    now: () => new Date('2026-10-04T10:00:00.000Z'),
    newId: () => `id${++n}`,
  }
}

async function seed(d: FactsServiceDeps) {
  await handleFactsCommand(
    { type: 'defineFact', value: 3.86, fact: { id: REV, label: 'Q3 revenue', source: { file: '/b/forecast.xlsx', ref: 'Summary!C2' } } },
    d,
  )
  for (const file of ['/b/forecast.xlsx', '/b/memo.docx', '/b/deck.pptx']) {
    await handleFactsCommand({ type: 'useFact', file, use: { fact: REV, kind: 'value', where: 'A' } }, d)
  }
}

describe('parseFactsCommand', () => {
  it('accepts each command shape', () => {
    expect(parseFactsCommand({ type: 'editSource', fact: REV, file: 'f', to: 4 })).toEqual({ type: 'editSource', fact: REV, file: 'f', to: 4 })
    expect(parseFactsCommand({ type: 'keepOld', update: 'u', file: 'f' })).toEqual({ type: 'keepOld', update: 'u', file: 'f' })
    expect(parseFactsCommand({ type: 'dropUse', file: 'f', fact: REV })).toEqual({ type: 'dropUse', file: 'f', fact: REV })
  })

  it('refuses anything else, and never takes the author, time or id from the renderer', () => {
    expect(parseFactsCommand(null)).toBeNull()
    expect(parseFactsCommand({ type: 'editSource', fact: REV, file: 'f', to: 'four' })).toBeNull()
    expect(parseFactsCommand({ type: 'editSource', fact: REV, file: 'f', to: Infinity })).toBeNull()
    expect(parseFactsCommand({ type: 'keepFile', update: '', file: 'f' })).toBeNull()
    expect(parseFactsCommand({ type: 'useFact', file: 'f', use: { fact: REV, kind: 'bogus', where: 'x' } })).toBeNull()
    expect(parseFactsCommand({ type: 'nuke' })).toBeNull()
    const cmd = parseFactsCommand({ type: 'editSource', fact: REV, file: 'f', to: 4, by: 'mallory', id: 'forged' })
    expect(cmd).toEqual({ type: 'editSource', fact: REV, file: 'f', to: 4 })
  })
})

describe('handleFactsCommand', () => {
  it('stamps an edit with this computer\'s author, time and a fresh id, then broadcasts', async () => {
    const d = deps()
    await seed(d)
    d.broadcast.mockClear()
    const s = await handleFactsCommand({ type: 'editSource', fact: REV, file: '/b/forecast.xlsx', to: 3.9 }, d)
    expect(s.updates[0]).toMatchObject({ by: 'felix', at: '2026-10-04T10:00:00.000Z', id: 'id1', from: 3.86, to: 3.9 })
    expect(waitingFiles(s)).toEqual(['/b/memo.docx', '/b/deck.pptx'])
    expect(d.broadcast).toHaveBeenCalledOnce()
    expect(d.broadcast).toHaveBeenCalledWith(s)
  })

  it('does not broadcast when nothing changed, and throws on a malformed command', async () => {
    const d = deps()
    await seed(d)
    d.broadcast.mockClear()
    await handleFactsCommand({ type: 'keepFile', update: 'missing', file: '/b/memo.docx' }, d)
    expect(d.broadcast).not.toHaveBeenCalled()
    await expect(handleFactsCommand({ type: 'editSource' }, d)).rejects.toThrow('Invalid facts command.')
  })
})

describe('registerFactsIpc', () => {
  it('serves get and command on the facts channels', async () => {
    const d = deps()
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    registerFactsIpc({ handle: (ch, fn) => handlers.set(ch, fn) }, d)
    expect([...handlers.keys()].sort()).toEqual([FACTS_CHANNELS.command, FACTS_CHANNELS.get].sort())
    await seed(d)
    const s = (await handlers.get(FACTS_CHANNELS.get)!({})) as { values: Record<string, number> }
    expect(s.values[REV]).toBe(3.86)
  })
})
