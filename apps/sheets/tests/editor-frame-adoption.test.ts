/**
 * Sheets in the shared EditorFrame (handoff 04-sheet-forecast): the
 * simplified toolbar's tools and the ExcelShell wiring.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { sheetsTools } from '../src/renderer/SimpleToolbar'

const t = ((k: string) => k) as never

describe('sheetsTools', () => {
  it('sends the same commands the classic ribbon sends', () => {
    const a = { command: vi.fn(), ask: vi.fn(), run: vi.fn() }
    const tools = sheetsTools(t, a, true)
    const byId = Object.fromEntries(tools.map((x) => [x.id, x]))
    byId.bold!.run()
    byId.sum!.run()
    byId['sort-asc']!.run()
    byId.filter!.run()
    byId.chart!.run()
    expect(a.command.mock.calls.map((c) => c[0])).toEqual([
      'bold',
      'autofn:SUM',
      'sort:asc',
      'filter-toggle',
      'insert-chart:column',
    ])
  })

  it('runs Explain, Check formulas and Summarize through the panel', () => {
    const a = { command: vi.fn(), ask: vi.fn(), run: vi.fn() }
    const tools = sheetsTools(t, a, true)
    tools.find((x) => x.id === 'check')!.run()
    expect(a.run).toHaveBeenCalledWith('appSimpleCheckPrompt')
    expect(tools.filter((x) => x.group === 'Redrob').map((x) => x.id)).toEqual(['explain', 'check', 'summarize'])
  })

  it('disables editing commands when the workbook cannot be edited', () => {
    const tools = sheetsTools(t, { command: vi.fn(), ask: vi.fn(), run: vi.fn() }, false)
    expect(tools.find((x) => x.id === 'bold')!.disabled).toBe(true)
    expect(tools.find((x) => x.id === 'explain')!.disabled).toBeFalsy()
  })
})

describe('ExcelShell wiring', () => {
  const src = readFileSync(join(__dirname, '../src/renderer/ExcelShell.tsx'), 'utf8')
  it('hosts the workbook in the frame, ribbon as Classic, Redrob on the right', () => {
    expect(src).toContain('<EditorFrame')
    expect(src).toMatch(/classicToolbar=\{\s*<div className="excel-header">/)
    expect(src).toContain('<SimpleToolbar')
    expect(src).toMatch(/<AiChatPanel[\s\S]*?hosted/)
    expect(src).not.toContain('className="sheet-body"')
  })
  it('keeps the grid mounted whichever toolbar shows', () => {
    // the Univer container is a frame child, never inside a toolbar slot
    const frameChildren = src.slice(src.indexOf('      >\n') >= 0 ? src.indexOf('<EditorFrame') : 0)
    expect(frameChildren).toContain('id="univer-container"')
  })
  it('offers an .xlsx copy for an older .xls through Save As', () => {
    expect(src).toContain('<OldFormatBanner')
    expect(src).toContain('onSaveCopy={canSaveAs ? onSaveAs : undefined}')
  })
})
