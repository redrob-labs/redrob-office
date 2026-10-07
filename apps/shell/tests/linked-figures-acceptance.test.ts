/**
 * The acceptance check (handoff product.md): change Q3 revenue in
 * forecast.xlsx; every file that uses it says so within one click, and
 * nothing in any other file changes until someone keeps it.
 *
 * Runs the real pieces end to end without Electron: the Sheets linked-cell
 * rules, the shell's facts service (command parsing, stamping, broadcast) over
 * a JSON file in a temp folder, and the Docs figure rules.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FactsStore, figState, pending, waitingFiles, type FactsState } from '@genoffice/facts'
import { JsonFileFactsRepository } from '@genoffice/facts/json-repository'
import { handleFactsCommand, type FactsServiceDeps } from '../src/main/facts-service'
import { linkCellCommands, sourceEdits } from '../../sheets/src/renderer/linked-cells'
import { figureRewrites, syncUsesCommands, type DocFigure } from '../../docs/src/renderer/linked/figures'

const FORECAST = 'C:\\Board\\forecast.xlsx'
const MEMO = 'C:\\Board\\Q3 board memo.docx'
const UPDATE = 'C:\\Series B\\October investor update.docx'

let dir = ''
let broadcasts: FactsState[] = []
let deps: FactsServiceDeps

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rr-acceptance-'))
  broadcasts = []
  let n = 0
  deps = {
    store: new FactsStore(new JsonFileFactsRepository(join(dir, 'linked-figures.json'))),
    broadcast: (s) => broadcasts.push(s),
    author: () => 'felix',
    now: () => new Date('2026-10-05T09:00:00.000Z'),
    newId: () => `u${++n}`,
  }
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** a document's figures as Docs reads them: the value, kept text as shown */
const figuresOf = (fact: string, text: string): DocFigure[] => [{ fact, part: 'figures', pos: 4, text, paragraph: 1 }]

describe('the acceptance check', () => {
  it('a source edit reaches every using file in one step and changes none of them until kept', async () => {
    // Sheets: link Summary!C2 (3.86) in forecast.xlsx
    const link = linkCellCommands({ path: FORECAST, ref: { sheet: 'Summary', a1: 'C2' }, value: 3.86, labelLeft: 'Q3 revenue' })
    if (!link.ok) throw new Error('link failed')
    for (const c of link.commands) await handleFactsCommand(c, deps)
    const id = link.fact.id

    // Docs: the memo and the investor update each insert the figure and save
    for (const file of [MEMO, UPDATE]) {
      for (const c of syncUsesCommands(deps.store.get(), file, figuresOf(id, '3.86'))) await handleFactsCommand(c, deps)
    }
    expect(waitingFiles(deps.store.get())).toEqual([])

    // Sheets: someone types 3.9 into Summary!C2; the settled change sends one edit
    const edits = sourceEdits(deps.store.get(), FORECAST, () => 3.9)
    expect(edits).toEqual([{ type: 'editSource', fact: id, file: FORECAST, to: 3.9 }])
    broadcasts = []
    for (const c of edits) await handleFactsCommand(c, deps)

    const s = deps.store.get()
    // one broadcast tells every open view at once
    expect(broadcasts).toHaveLength(1)
    // every other file that uses it says so: Home's Updates count, the tab, the figure
    expect(waitingFiles(s)).toEqual([MEMO, UPDATE])
    expect(figState(s, id, MEMO)?.upd?.to).toBe(3.9)
    expect(pending(s, FORECAST)).toBe(false)
    expect(s.updates[0]).toMatchObject({ by: 'felix', where: FORECAST, from: 3.86, to: 3.9 })

    // nothing in any other file changes: the documents still show 3.86
    expect(figureRewrites(s, MEMO, figuresOf(id, '3.86'))).toEqual([])
    expect(figureRewrites(s, UPDATE, figuresOf(id, '3.86'))).toEqual([])

    // a person keeps it in the memo only; the memo's figure is rewritten, the update's is not
    await handleFactsCommand({ type: 'keepFile', update: s.updates[0]!.id, file: MEMO }, deps)
    const kept = deps.store.get()
    expect(figureRewrites(kept, MEMO, figuresOf(id, '3.86'))).toEqual([{ pos: 4, text: '3.9' }])
    expect(figureRewrites(kept, UPDATE, figuresOf(id, '3.86'))).toEqual([])
    expect(waitingFiles(kept)).toEqual([UPDATE])

    // and the decision survives a restart: a fresh store over the same file agrees
    const reopened = new FactsStore(new JsonFileFactsRepository(join(dir, 'linked-figures.json')))
    await reopened.load()
    expect(waitingFiles(reopened.get())).toEqual([UPDATE])
  })

  it('a renderer cannot forge who made the change', async () => {
    const link = linkCellCommands({ path: FORECAST, ref: { sheet: 'Summary', a1: 'C2' }, value: 3.86 })
    if (!link.ok) throw new Error('link failed')
    for (const c of link.commands) await handleFactsCommand(c, deps)
    await handleFactsCommand({ type: 'editSource', fact: link.fact.id, file: FORECAST, to: 4, by: 'mallory', id: 'forged' }, deps)
    expect(deps.store.get().updates[0]).toMatchObject({ by: 'felix', id: 'u1' })
  })
})
