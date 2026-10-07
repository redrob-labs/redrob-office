/**
 * PDF in the shared EditorFrame: the simplified toolbar's tools and the App wiring.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { pdfTools } from '../src/renderer/components/SimpleToolbar'

const t = ((k: string) => k) as never

function actions() {
  return {
    markup: vi.fn(),
    editText: vi.fn(),
    rotateLeft: vi.fn(),
    rotateRight: vi.fn(),
    toWord: vi.fn(),
    print: vi.fn(),
    ask: vi.fn(),
    run: vi.fn(),
  }
}

describe('pdfTools', () => {
  it('lists the everyday PDF tools and runs markups by kind', () => {
    const a = actions()
    const tools = pdfTools(t, a, true)
    expect(tools.map((x) => x.id)).toEqual([
      'ask',
      'highlight',
      'underline',
      'strikeout',
      'edit-text',
      'rotate-left',
      'rotate-right',
      'to-word',
      'print',
      'summarize',
      'key-points',
    ])
    tools.find((x) => x.id === 'highlight')!.run()
    expect(a.markup).toHaveBeenCalledWith('highlight')
    tools.find((x) => x.id === 'summarize')!.run()
    expect(a.run).toHaveBeenCalledWith('aiQuickSummaryPrompt')
  })

  it('an encrypted, read-only PDF keeps reading tools and loses editing ones', () => {
    const tools = pdfTools(t, actions(), false)
    expect(tools.find((x) => x.id === 'highlight')!.disabled).toBe(true)
    expect(tools.find((x) => x.id === 'print')!.disabled).toBeFalsy()
    expect(tools.find((x) => x.id === 'summarize')!.disabled).toBeFalsy()
  })
})

describe('App wiring', () => {
  const app = readFileSync(join(__dirname, '../src/renderer/App.tsx'), 'utf8')
  it('hosts the PDF in the frame, ribbon as Classic, Redrob on the right', () => {
    expect(app).toContain('<EditorFrame')
    expect(app).toMatch(/classicToolbar=\{\s*<div className="ribbon">/)
    expect(app).toContain('<SimpleToolbar')
    expect(app).not.toContain('className={`ai-dock')
    expect(app).toMatch(/<AiPanel[\s\S]*?hosted/)
  })
  it('shows an encrypted PDF as Viewing', () => {
    expect(app).toContain("value: readOnly ? 'viewing' : 'editing'")
  })
})
