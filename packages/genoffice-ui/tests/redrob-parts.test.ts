import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PlanReply,
  RedrobModeSwitch,
  RedrobReceipt,
  crossCheckSummary,
  parsePlan,
  planRequest,
  receiptItems,
  redrobStatusItems,
  runPlanRequest,
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

describe('Plan mode text', () => {
  it('asks for a plan only, and runs the approved steps in order', () => {
    const p = planRequest('Fill in the parties')
    expect(p).toContain('do not change the document and do not call any tool')
    expect(p).toContain('Request: Fill in the parties')
    expect(runPlanRequest('Fill in the parties', ['Read', 'Fill'])).toBe(
      'Fill in the parties\n\nFollow this plan, which the person approved, step by step:\n1. Read\n2. Fill',
    )
  })

  it('reads numbered or bulleted steps and strips their markers', () => {
    expect(parsePlan('Here is the plan:\n1. Read the NDA\n2) Fill the date\n- Check names')).toEqual([
      'Read the NDA',
      'Fill the date',
      'Check names',
    ])
    expect(parsePlan('Read it\nFill it')).toEqual(['Read it', 'Fill it'])
    expect(parsePlan('')).toEqual([])
  })
})

describe('the status line', () => {
  it('never claims privacy protection this computer is not running', () => {
    const items = redrobStatusItems('en', { memory: true, factCheck: 'auto', challenge: 'auto' })
    expect(items.map((i) => i.id)).toEqual(['privacy', 'memory', 'check'])
    expect(items[0]!.value).toBe('Not on this computer')
    expect(items[1]!.value).toBe('On for every AI')
    expect(items[2]!.value).toBe('When it matters')
  })

  it('shows a local level only when one is reported', () => {
    const items = redrobStatusItems('en', {
      memory: false,
      factCheck: 'off',
      challenge: 'off',
      privacyLocal: { level: 'High', levelN: 2, of: 3 },
    })
    expect(items[0]).toMatchObject({ value: 'High', level: { n: 2, of: 3 } })
    expect(items[1]!.value).toBe('Off here')
    expect(items[2]!.value).toBe('Off')
  })

  it('summarizes two Cross-check levels', () => {
    expect(crossCheckSummary('en', 'always', 'always')).toBe('Always')
    expect(crossCheckSummary('en', 'off', 'auto')).toBe('1 of 2: When it matters')
    expect(crossCheckSummary('en', 'auto', 'always')).toBe('On')
  })
})

describe('the receipt', () => {
  it('has a row only for what the run reported', () => {
    expect(receiptItems('en', {})).toEqual([])
    const items = receiptItems('en', { model: 'Redrob Auto', chosenBy: 'auto', changes: 3, planSteps: 2 })
    expect(items.map((i) => i.id)).toEqual(['model', 'plan', 'changes'])
    expect(items[0]).toMatchObject({ label: 'Answered by Redrob Auto', sub: 'Redrob Auto chose it' })
    expect(items[2]!.label).toBe('3 changes')
  })

  it('renders nothing when nothing was reported', () => {
    act(() => root.render(createElement(RedrobReceipt, { lang: 'en', report: {} })))
    expect(host.innerHTML).toBe('')
  })
})

describe('Plan or Run', () => {
  it('is an icon-only radio group named for what it does', () => {
    const onChange = vi.fn()
    act(() => root.render(createElement(RedrobModeSwitch, { lang: 'en', value: 'run', onChange })))
    expect(host.querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe(
      'How Redrob works on this message',
    )
    const radios = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Plan', 'Run'])
    act(() => radios[0]!.click())
    expect(onChange).toHaveBeenCalledWith('plan')
  })
})

describe('PlanReply', () => {
  it('runs the steps the person left, after an edit in place', () => {
    const onRun = vi.fn()
    act(() =>
      root.render(
        createElement(PlanReply, {
          lang: 'en',
          request: 'Fill in the parties',
          steps: ['Read the NDA', 'Fill the date'],
          status: 'draft',
          onRun,
          onKeep: vi.fn(),
        }),
      ),
    )
    const first = host.querySelector('.go-plandoc__sec ol > li')!
    first.querySelector('[contenteditable]')!.textContent = 'Read the whole NDA'
    const run = Array.from(host.querySelectorAll<HTMLButtonElement>('footer button')).find(
      (b) => b.textContent === 'Run this plan',
    )!
    act(() => run.click())
    expect(onRun).toHaveBeenCalledWith(['Read the whole NDA', 'Fill the date'])
  })

  it('says so when no plan came back', () => {
    act(() =>
      root.render(
        createElement(PlanReply, { lang: 'en', request: 'x', steps: [], status: 'draft', onRun: vi.fn(), onKeep: vi.fn() }),
      ),
    )
    expect(host.textContent).toContain('Redrob did not write a plan this time')
  })
})
