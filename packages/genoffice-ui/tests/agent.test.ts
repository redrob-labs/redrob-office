import { act, createElement, createRef } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AgentComposer,
  AgentEmpty,
  AgentFailure,
  AgentMessage,
  AgentPanelHeader,
  AgentSteps,
  AgentUndelivered,
  AgentWorking,
  type AgentComposerProps,
} from '../src/Agent'

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
  vi.useRealTimers()
})

const render = (el: ReactElement) => act(() => root.render(el))
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) =>
  Array.from(host.querySelectorAll<T>(sel))

const STEP_STRINGS = {
  worked: 'Worked · 2 steps',
  working: 'Working…',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
}

describe('AgentPanelHeader', () => {
  it('titles the panel and names every action, skipping falsy ones', () => {
    const onCollapse = vi.fn()
    render(
      createElement(AgentPanelHeader, {
        title: 'Redrob AI',
        actions: [false, { label: 'Collapse panel', icon: 'x', onClick: onCollapse }],
      }),
    )
    expect($('.go-agent-header__title')!.textContent).toContain('Redrob AI')
    const buttons = $$<HTMLButtonElement>('.go-agent-header__actions button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Collapse panel')
    act(() => buttons[0]!.click())
    expect(onCollapse).toHaveBeenCalledOnce()
  })
})

describe('AgentEmpty', () => {
  it('offers starter prompts and hands the picked one back', () => {
    const onPick = vi.fn()
    render(
      createElement(AgentEmpty, {
        title: 'Ask about this PDF',
        description: 'Summarize or find information',
        prompts: ['Summarize', 'Key points'],
        promptsLabel: 'Suggested prompts',
        onPick,
      }),
    )
    expect($('h3')!.textContent).toBe('Ask about this PDF')
    expect($('[role="list"]')!.getAttribute('aria-label')).toBe('Suggested prompts')
    const prompts = $$<HTMLButtonElement>('.rr-prompt')
    expect(prompts.map((b) => b.textContent)).toEqual(['Summarize', 'Key points'])
    act(() => prompts[1]!.click())
    expect(onPick).toHaveBeenCalledWith('Key points')
  })
})

describe('AgentMessage', () => {
  it('renders a user turn with its author and keeps line breaks', () => {
    render(createElement(AgentMessage, { role: 'user', author: 'You' }, 'line one\nline two'))
    const msg = $('.rr-msg')!
    expect(msg.classList.contains('rr-msg--user')).toBe(true)
    expect($('.rr-msg__author')!.textContent).toBe('You')
    expect($('.rr-msg__content')!.textContent).toBe('line one\nline two')
  })

  it('gives the assistant the Redrob mark and flags a streaming turn', () => {
    render(
      createElement(
        AgentMessage,
        { role: 'assistant', author: 'Redrob AI', streaming: true },
        'Hello',
      ),
    )
    const msg = $('.rr-msg')!
    expect(msg.classList.contains('rr-msg--assistant')).toBe(true)
    expect(msg.classList.contains('go-agent-msg--streaming')).toBe(true)
    expect($('.rr-msg__mark svg')).not.toBeNull()
    expect($('.rr-msg__mark')!.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('AgentFailure', () => {
  it('shows the engine message as an alert that cannot be dismissed', () => {
    render(
      createElement(AgentFailure, {
        title: 'The assistant could not finish',
        message: 'The AI service is busy right now',
      }),
    )
    const alert = $('[role="alert"]')!
    expect(alert.classList.contains('rr-alert--danger')).toBe(true)
    expect(alert.textContent).toContain('The assistant could not finish')
    expect(alert.textContent).toContain('The AI service is busy right now')
    expect(alert.querySelector('button')).toBeNull()
  })
})

describe('AgentUndelivered', () => {
  it('offers Retry only when a retry is possible', () => {
    const onRetry = vi.fn()
    render(createElement(AgentUndelivered, { message: 'Not sent', retryLabel: 'Retry', onRetry }))
    const retry = $<HTMLButtonElement>('.rr-alert button')!
    expect(retry.textContent).toBe('Retry')
    act(() => retry.click())
    expect(onRetry).toHaveBeenCalledOnce()

    render(createElement(AgentUndelivered, { message: 'Not sent', retryLabel: 'Retry' }))
    expect($('.rr-alert button')).toBeNull()
    expect($('.rr-alert')!.textContent).toContain('Not sent')
  })
})

describe('AgentSteps', () => {
  const steps = [
    { name: 'read_pages', summary: 'Read pages 1-3', output: 'page text' },
    { name: 'rotate_page', summary: 'Rotate page 2', isError: true },
  ]

  it('is collapsed by default behind a summary toggle', () => {
    render(createElement(AgentSteps, { steps, strings: STEP_STRINGS }))
    const toggle = $<HTMLButtonElement>('.go-agent-steps__toggle')!
    const list = $('.go-agent-steps__list')!
    expect(toggle.textContent).toContain('Worked · 2 steps')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe(list.id)
    expect(list.hidden).toBe(true)
    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(list.hidden).toBe(false)
  })

  it('draws each step as a kit action with its state in words', () => {
    render(createElement(AgentSteps, { steps, strings: STEP_STRINGS }))
    const actions = $$('.rr-action')
    expect(actions).toHaveLength(2)
    expect(actions[0]!.querySelector('.rr-action__name')!.textContent).toBe('Read pages 1-3')
    expect(actions[0]!.querySelector('.rr-action__state')!.textContent).toContain('Done')
    expect(actions[1]!.querySelector('.rr-action__state--error')!.textContent).toContain('Failed')
    expect(actions[0]!.querySelector('.rr-action__body')!.textContent).toBe('page text')
  })

  it('says it is working while any step runs', () => {
    render(
      createElement(AgentSteps, {
        steps: [{ name: 'search', summary: 'Search "tax"', running: true }],
        strings: STEP_STRINGS,
      }),
    )
    expect($('.go-agent-steps__toggle')!.textContent).toContain('Working…')
    expect($('.go-agent-steps__spinner')).not.toBeNull()
    expect($('.rr-action__state--running')!.textContent).toContain('Running')
  })
})

describe('AgentWorking', () => {
  it('announces the phase and adds the elapsed seconds after three', () => {
    vi.useFakeTimers()
    render(createElement(AgentWorking, { label: 'Thinking' }))
    const status = $('[role="status"]')!
    expect(status.getAttribute('aria-label')).toBe('Thinking')
    const label = $('.go-agent-working__label')!
    expect(label.getAttribute('aria-hidden')).toBe('true')
    expect(label.textContent).toBe('Thinking…')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(label.textContent).toBe('Thinking… · 3s')
  })

  it('does not double an ellipsis the locale already has', () => {
    render(createElement(AgentWorking, { label: 'Replying…' }))
    expect($('.go-agent-working__label')!.textContent).toBe('Replying…')
  })
})

describe('AgentComposer', () => {
  function composer(props: Partial<AgentComposerProps> = {}) {
    const handlers = { onChange: vi.fn(), onSend: vi.fn(), onStop: vi.fn() }
    render(
      createElement(AgentComposer, {
        value: 'hello',
        busy: false,
        placeholder: 'Ask about this PDF…',
        label: 'Message',
        sendLabel: 'Send',
        stopLabel: 'Stop',
        ...handlers,
        ...props,
      }),
    )
    return handlers
  }
  const textarea = () => $<HTMLTextAreaElement>('textarea')!
  const keydown = (el: Element, init: KeyboardEventInit) =>
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
    })

  it('labels the field, follows the text direction and offers no stray add button', () => {
    composer()
    const ta = textarea()
    expect(ta.getAttribute('dir')).toBe('auto')
    expect(ta.placeholder).toBe('Ask about this PDF…')
    expect($(`label[for="${ta.id}"]`)!.textContent).toBe('Message')
    expect($('.rr-composer__tool')).toBeNull()
    expect($('.rr-composer__send')!.getAttribute('aria-label')).toBe('Send')
  })

  it('sends on Enter, not on Shift+Enter', () => {
    const { onSend } = composer()
    keydown(textarea(), { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    keydown(textarea(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('does not send an empty message', () => {
    const { onSend } = composer({ value: '   ' })
    keydown(textarea(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect($<HTMLButtonElement>('.rr-composer__send')!.disabled).toBe(true)
  })

  it('turns Send into Stop while busy, and Esc stops too', () => {
    const { onStop, onSend } = composer({ busy: true })
    const stopBtn = $<HTMLButtonElement>('.rr-composer__send--stop')!
    expect(stopBtn.getAttribute('aria-label')).toBe('Stop')
    keydown(textarea(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    keydown(textarea(), { key: 'Escape' })
    expect(onStop).toHaveBeenCalledOnce()
    act(() => stopBtn.click())
    expect(onStop).toHaveBeenCalledTimes(2)
  })

  it('ignores Esc when nothing is running', () => {
    const { onStop } = composer()
    keydown(textarea(), { key: 'Escape' })
    expect(onStop).not.toHaveBeenCalled()
  })

  it('exposes the field through textareaRef', () => {
    const ref = createRef<HTMLTextAreaElement>()
    composer({ textareaRef: ref })
    expect(ref.current).toBe(textarea())
  })

  it('hands pasted files to the app and leaves text paste alone', () => {
    const onPasteFiles = vi.fn()
    composer({ onPasteFiles })
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    const withFile = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(withFile, 'clipboardData', { value: { files: [file] } })
    act(() => {
      textarea().dispatchEvent(withFile)
    })
    expect(onPasteFiles).toHaveBeenCalledWith([file])
    expect(withFile.defaultPrevented).toBe(true)

    const textOnly = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(textOnly, 'clipboardData', { value: { files: [] } })
    act(() => {
      textarea().dispatchEvent(textOnly)
    })
    expect(onPasteFiles).toHaveBeenCalledOnce()
    expect(textOnly.defaultPrevented).toBe(false)
  })

  it('shows context above the field', () => {
    composer({ context: createElement('span', { className: 'scope-chip' }, 'Page 2') })
    expect($('.rr-composer__context .scope-chip')!.textContent).toBe('Page 2')
  })
})
