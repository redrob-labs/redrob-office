/**
 * Markdown in the shared EditorFrame (handoff 06-markdown): the simplified
 * toolbar's tools, the word count and the App wiring.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { countMdWords, mdCommands, mdTools } from '../src/renderer/components/SimpleToolbar'

const t = ((k: string) => k) as never

describe('the simplified toolbar', () => {
  const redrob = { ask: vi.fn(), run: vi.fn() }
  const cmd = mdCommands(null)

  it('lists every command by name for the title bar search', () => {
    const ids = mdTools(t, cmd, redrob, true).map((x) => x.id)
    for (const id of ['ask', 'summarize', 'polish', 'tidy', 'bold', 'bullets', 'tasks', 'table', 'h1', 'quote']) {
      expect(ids).toContain(id)
    }
  })

  it('runs Redrob requests through the panel, and disables edits in Viewing', () => {
    const tools = mdTools(t, cmd, redrob, false)
    tools.find((x) => x.id === 'summarize')!.run()
    expect(redrob.run).toHaveBeenCalledWith('aiSummarizePrompt')
    expect(tools.find((x) => x.id === 'bold')!.disabled).toBe(true)
    expect(tools.find((x) => x.id === 'polish')!.disabled).toBe(true)
  })

  it('commands without an editor do nothing rather than throw', () => {
    expect(() => cmd.bold()).not.toThrow()
    expect(() => cmd.style('h2')).not.toThrow()
  })
})

describe('countMdWords', () => {
  it('counts Latin words and CJK characters', () => {
    expect(countMdWords('')).toBe(0)
    expect(countMdWords('Ship the release notes')).toBe(4)
    expect(countMdWords('보고서 draft')).toBe(4)
  })
})

describe('App wiring', () => {
  const app = readFileSync(join(__dirname, '../src/renderer/App.tsx'), 'utf8')
  it('hosts the editor in the frame, ribbon as Classic, Redrob on the right', () => {
    expect(app).toContain('<EditorFrame')
    expect(app).toMatch(/classicToolbar=\{\s*<Ribbon/)
    expect(app).toContain('<SimpleToolbar')
    expect(app).not.toContain('className={`ai-dock')
    expect(app).toMatch(/<AiPanel[\s\S]*?hosted/)
  })
  it('offers Editing and Viewing, Suggesting marked unavailable', () => {
    expect(app).toContain("unavailable: ['suggesting']")
  })
})
