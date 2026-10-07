/**
 * Slides in the shared EditorFrame (handoff 05-deck): the simplified
 * toolbar's tools and the App wiring.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { slidesTools } from '../src/renderer/components/SimpleToolbar'

const t = ((k: string) => k) as never

function actions() {
  return {
    addSlide: vi.fn(),
    textbox: vi.fn(),
    picture: vi.fn(),
    format: vi.fn(),
    present: vi.fn(),
    ask: vi.fn(),
    run: vi.fn(),
  }
}

describe('slidesTools', () => {
  it('lists the everyday deck tools for the title bar search', () => {
    const ids = slidesTools(t, actions(), { hasDoc: true, editingText: true }).map((x) => x.id)
    expect(ids).toEqual([
      'ask',
      'new-slide',
      'textbox',
      'picture',
      'bold',
      'italic',
      'underline',
      'present',
      'check',
      'tighten',
      'notes',
    ])
  })

  it('text formatting needs a text box being edited; deck tools need a deck', () => {
    const tools = slidesTools(t, actions(), { hasDoc: true, editingText: false })
    expect(tools.find((x) => x.id === 'bold')!.disabled).toBe(true)
    expect(tools.find((x) => x.id === 'new-slide')!.disabled).toBe(false)
    const none = slidesTools(t, actions(), { hasDoc: false, editingText: false })
    expect(none.find((x) => x.id === 'new-slide')!.disabled).toBe(true)
    expect(none.find((x) => x.id === 'ask')!.disabled).toBeFalsy()
  })

  it('routes Redrob requests to the panel and Bold to the formatter', () => {
    const a = actions()
    const tools = slidesTools(t, a, { hasDoc: true, editingText: true })
    tools.find((x) => x.id === 'check')!.run()
    expect(a.run).toHaveBeenCalledWith('aiFactCheckPrompt')
    tools.find((x) => x.id === 'bold')!.run()
    expect(a.format).toHaveBeenCalledWith('bold')
  })
})

describe('App wiring', () => {
  const app = readFileSync(join(__dirname, '../src/renderer/App.tsx'), 'utf8')
  it('hosts the deck in the frame, ribbon as Classic, Redrob on the right', () => {
    expect(app).toContain('<EditorFrame')
    expect(app).toMatch(/classicToolbar=\{\s*<Ribbon/)
    expect(app).toContain('<SimpleToolbar')
    expect(app).not.toContain('className={`ai-dock')
    expect(app).toMatch(/<AiPanel[\s\S]*?hosted/)
  })
  it('offers a .pptx copy for an older .ppt through Save As', () => {
    expect(app).toContain('<OldFormatBanner')
    expect(app).toContain('onSaveCopy={() => void saveAs()}')
  })
})
