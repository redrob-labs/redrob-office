/**
 * @vitest-environment jsdom
 *
 * Updates: one changed figure, every file that uses it, each kept by a person.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyFactsState, factsReducer, type FactsAction, type FactsState } from '@genoffice/facts'
import { LocaleProvider } from '../src/renderer/src/locale'
import { UpdatesView, splitFilePath } from '../src/renderer/src/home/UpdatesView'
import type { FactsHook } from '../src/renderer/src/home/useFacts'

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnv.IS_REACT_ACT_ENVIRONMENT = true

const REV = 'q3-revenue'
const FORECAST = 'C:\\Board\\forecast.xlsx'
const MEMO = '/Users/felix/Board/memo.docx'

function world(): FactsState {
  const actions: FactsAction[] = [
    {
      type: 'defineFact',
      value: 3.86,
      fact: {
        id: REV,
        label: 'Q3 revenue',
        source: { file: FORECAST, ref: 'Summary!C2' },
        display: { prefix: '₩', suffix: 'bn', decimals: 2 },
        bands: [{ below: 4, words: 'Revenue grew by about a fifth on Q2' }, { words: 'Revenue grew by almost a third on Q2' }],
      },
    },
    { type: 'useFact', file: FORECAST, use: { fact: REV, kind: 'value', where: 'Summary!C2' } },
    { type: 'useFact', file: MEMO, use: { fact: REV, kind: 'value', where: 'Paragraph 1' } },
    { type: 'useFact', file: MEMO, use: { fact: REV, kind: 'sentence', where: 'Paragraph 2' } },
    { type: 'editSource', fact: REV, file: FORECAST, to: 4.1, by: 'felix', at: '2026-10-04T10:00:00.000Z', id: 'u1' },
  ]
  return actions.reduce(factsReducer, emptyFactsState())
}

function hook(state: FactsState | null, extra: Partial<FactsHook> = {}): FactsHook {
  return { state, loadFailed: false, retry: vi.fn(), command: vi.fn(async () => state!), ...extra }
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (facts: FactsHook, openPath = vi.fn()) =>
  act(() => {
    root.render(createElement(LocaleProvider, { initial: 'en' }, createElement(UpdatesView, { facts, openPath })))
  })

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined

describe('splitFilePath', () => {
  it('reads either separator', () => {
    expect(splitFilePath(FORECAST)).toEqual({ name: 'forecast.xlsx', dir: 'Board' })
    expect(splitFilePath(MEMO)).toEqual({ name: 'memo.docx', dir: 'Board' })
    expect(splitFilePath('memo.docx')).toEqual({ name: 'memo.docx', dir: '' })
  })
})

describe('UpdatesView', () => {
  it('says nothing is waiting when there are no updates', () => {
    render(hook(emptyFactsState()))
    expect(host.textContent).toContain('Nothing is waiting')
  })

  it('shows the change, each file, and its state', () => {
    render(hook(world()))
    const h2 = host.querySelector('h2')!
    expect(h2.querySelector('del')!.textContent).toBe('₩3.86bn')
    expect(h2.querySelector('ins')!.textContent).toBe('₩4.10bn')
    expect(host.textContent).toContain('Changed by felix in forecast.xlsx')
    expect(host.textContent).toContain('1 file waits for you.')
    const files = [...host.querySelectorAll('.updf')]
    expect(files).toHaveLength(2)
    expect(files[0]!.textContent).toContain('Changed here')
    expect(files[1]!.textContent).toContain('Waiting for you')
    // the sentence redline shows the old and new wording
    expect(files[1]!.textContent).toContain('Revenue grew by about a fifth on Q2')
    expect(files[1]!.textContent).toContain('Revenue grew by almost a third on Q2')
  })

  it('sends a person\'s decision for that file and that update', () => {
    const facts = hook(world())
    render(facts)
    act(() => button('Keep the update')!.click())
    expect(facts.command).toHaveBeenCalledWith({ type: 'keepFile', update: 'u1', file: MEMO })
    act(() => button('Keep the old value')!.click())
    expect(facts.command).toHaveBeenCalledWith({ type: 'keepOld', update: 'u1', file: MEMO })
  })

  it('opens the file from its row', () => {
    const openPath = vi.fn()
    render(hook(world()), openPath)
    act(() => (host.querySelector('button[aria-label="Open memo.docx"]') as HTMLButtonElement).click())
    expect(openPath).toHaveBeenCalledWith(MEMO)
  })

  it('says when a decision was not saved', async () => {
    const facts = hook(world(), { command: vi.fn(async () => Promise.reject(new Error('disk'))) })
    render(facts)
    await act(async () => button('Keep the update')!.click())
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('That decision was not saved')
  })

  it('says when the index could not be read, with one way to try again', () => {
    const facts = hook(null, { loadFailed: true })
    render(facts)
    expect(host.textContent).toContain('Updates could not be read')
    act(() => button('Try again')!.click())
    expect(facts.retry).toHaveBeenCalledOnce()
  })
})
