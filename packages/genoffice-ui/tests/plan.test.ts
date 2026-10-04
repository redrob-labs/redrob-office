import { act, createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AnswerReceipt,
  AppShell,
  Citation,
  ComposerMode,
  MarkReveal,
  Opinion,
  PlanDocument,
  PrivacyProtection,
  Redline,
  SecondOpinionSetting,
  applyTheme,
  type PlanDocumentProps,
} from '../src/index'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true

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

const render = (el: ReactElement) => act(() => root.render(el))
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) =>
  Array.from(host.querySelectorAll<T>(sel))

const MODES = [
  { value: 'plan', label: 'Plan', icon: 'route' as const, hint: 'Nothing changes until you say so.' },
  { value: 'run', label: 'Run', icon: 'play' as const, hint: 'Starts at once.' },
]

describe('ComposerMode', () => {
  it('is a named radio group with one checked option and one tab stop', () => {
    render(createElement(ComposerMode, { options: MODES, label: 'How Redrob works' }))
    const group = $('[role="radiogroup"]')!
    expect(group.getAttribute('aria-label')).toBe('How Redrob works')
    const radios = $$<HTMLButtonElement>('[role="radio"]')
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Plan', 'Run'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1])
  })

  it('keeps labels as accessible names when compact (icons only)', () => {
    render(createElement(ComposerMode, { options: MODES, label: 'Mode', compact: true }))
    expect($('.go-cmode--compact')).not.toBeNull()
    expect($$('[role="radio"]').every((r) => r.getAttribute('aria-label'))).toBe(true)
    expect($$('svg').length).toBe(2)
  })

  it('moves and selects with the arrow keys, wrapping', () => {
    const onChange = vi.fn()
    render(createElement(ComposerMode, { options: MODES, label: 'Mode', onChange }))
    const [plan] = $$<HTMLButtonElement>('[role="radio"]')
    plan!.focus()
    act(() => {
      plan!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith('run', MODES[1])
    const radios = $$<HTMLButtonElement>('[role="radio"]')
    expect(radios[1]!.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(radios[1])
    act(() => {
      radios[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith('plan', MODES[0])
  })

  it('is controlled when given a value', () => {
    const onChange = vi.fn()
    render(createElement(ComposerMode, { options: MODES, label: 'Mode', value: 'run', onChange }))
    act(() => $$<HTMLButtonElement>('[role="radio"]')[0]!.click())
    expect(onChange).toHaveBeenCalledWith('plan', MODES[0])
    // the parent did not change value, so Run stays checked
    expect($$('[role="radio"]')[1]!.getAttribute('aria-checked')).toBe('true')
  })
})

const PLAN: PlanDocumentProps = {
  label: 'Plan',
  file: 'Plan - fill in the parties.md',
  statusLabels: {
    draft: 'Draft, not run yet',
    edited: 'Edited by you, not run yet',
    running: 'Approved by you, running',
    done: 'Approved by you, done',
    kept: 'Kept for later',
  },
  title: 'Fill in the parties',
  summary: 'Redrob works in this file only.',
  sections: [{ id: 'how', heading: 'How I will do it', ordered: true, items: ['Read', 'Fill'] }],
  todo: [{ label: 'Read' }, { label: 'Fill' }],
  todoLabel: 'To do',
  doneLabel: '(done)',
  runLabel: 'Run this plan',
  keepLabel: 'Keep it for later',
}

describe('PlanDocument', () => {
  it('renders a named article with its status, sections and to-do list', () => {
    render(createElement(PlanDocument, { ...PLAN, onRun: () => {} }))
    const article = $('article')!
    expect(article.getAttribute('aria-label')).toBe('Plan')
    expect($('.go-plandoc__state')!.textContent).toBe('Draft, not run yet')
    expect($('h2')!.textContent).toBe('Fill in the parties')
    expect($$('ol li').map((li) => li.textContent)).toEqual(['Read', 'Fill'])
    expect($$('.go-plandoc__todo li')).toHaveLength(2)
  })

  it('runs only when the person clicks Run this plan', () => {
    const onRun = vi.fn()
    const onKeep = vi.fn()
    render(createElement(PlanDocument, { ...PLAN, onRun, onKeep }))
    expect(onRun).not.toHaveBeenCalled()
    const buttons = $$<HTMLButtonElement>('footer button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Run this plan', 'Keep it for later'])
    act(() => buttons[0]!.click())
    expect(onRun).toHaveBeenCalledOnce()
    act(() => buttons[1]!.click())
    expect(onKeep).toHaveBeenCalledOnce()
  })

  it('is editable as a draft and locked once running', () => {
    render(createElement(PlanDocument, { ...PLAN, onRun: () => {} }))
    expect($$('[contenteditable="true"]').length).toBeGreaterThan(0)
    render(createElement(PlanDocument, { ...PLAN, status: 'running', done: 1, onRun: () => {} }))
    expect($$('[contenteditable="true"]')).toHaveLength(0)
    expect($('footer')).toBeNull()
    expect($('.go-plandoc__state')!.textContent).toBe('Approved by you, running')
    const ticked = $$('.go-plandoc__todo li.is-done')
    expect(ticked).toHaveLength(1)
    expect(ticked[0]!.textContent).toContain('(done)')
  })

  it('shows Edited by you after a change in place', () => {
    const onEdit = vi.fn()
    render(createElement(PlanDocument, { ...PLAN, onRun: () => {}, onEdit }))
    const ed = $('[contenteditable="true"]')!
    act(() => {
      ed.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onEdit).toHaveBeenCalled()
    expect($('.go-plandoc__state')!.textContent).toBe('Edited by you, not run yet')
  })
})

describe('Opinion', () => {
  it('marks a sentence read differently as a keyboard-operable control', () => {
    render(
      createElement(
        Opinion,
        {
          n: 1,
          title: 'Read differently',
          views: [
            { who: 'The AI that wrote this', said: 'Headcount 212' },
            { who: 'Fact check', said: 'Headcount 208' },
          ],
        },
        'Headcount: 212',
      ),
    )
    const mark = $('.rr-dispute__mark')!
    expect(mark.getAttribute('role')).toBe('button')
    expect(mark.getAttribute('tabindex')).toBe('0')
    expect(mark.getAttribute('aria-expanded')).toBe('false')
    expect(mark.textContent).toContain('Headcount: 212')
  })

  it('renders what the answer missed as an attributed addition', () => {
    const html = renderToStaticMarkup(
      createElement(Opinion, { kind: 'added', by: 'Fact check', label: 'The answer missed this' }, 'Name the court.'),
    )
    expect(html).toContain('rr-opadd')
    expect(html).toContain('The answer missed this')
    expect(html).not.toContain('rr-dispute')
  })
})

describe('newly re-exported kit parts', () => {
  it('are all components', () => {
    for (const c of [
      AnswerReceipt,
      AppShell,
      Citation,
      MarkReveal,
      PrivacyProtection,
      Redline,
      SecondOpinionSetting,
    ]) {
      expect(typeof c).toBe('function')
    }
  })

  it('Redline keeps the change as del and ins', () => {
    const html = renderToStaticMarkup(
      createElement(Redline, {
        parts: [
          { kind: 'out', text: 'a fifth' },
          { kind: 'in', text: 'almost a third' },
        ],
      }),
    )
    expect(html).toContain('<del')
    expect(html).toContain('<ins')
  })
})

describe('plan.css', () => {
  const css = readFileSync(join(process.cwd(), 'src/plan.css'), 'utf8')

  it('reads only tokens: no hex colors', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('is imported by theme.css', () => {
    const theme = readFileSync(join(process.cwd(), 'src/theme.css'), 'utf8')
    expect(theme).toContain("@import './plan.css'")
  })

  it('renders the same markup under both themes (tokens move it)', () => {
    const el = document.documentElement
    applyTheme(el, 'dark')
    render(createElement(ComposerMode, { options: MODES, label: 'Mode' }))
    const dark = host.innerHTML
    applyTheme(el, 'light')
    render(createElement(ComposerMode, { options: MODES, label: 'Mode' }))
    expect(host.innerHTML).toBe(dark)
    expect(el.getAttribute('data-theme')).toBe('light')
  })
})
