import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toolbar, ToolbarButton, ToolbarGroup } from '../src/Toolbar'
import { Dropdown } from '../src/dropdown'

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

function render(opts: { boldPressed?: boolean; italicDisabled?: boolean } = {}) {
  const onBold = vi.fn()
  act(() =>
    root.render(
      createElement(
        Toolbar,
        { label: 'Formatting' },
        createElement(
          ToolbarGroup,
          null,
          createElement(ToolbarButton, {
            label: 'Bold',
            icon: 'B',
            pressed: opts.boldPressed ?? false,
            shortcut: 'Ctrl+B',
            onClick: onBold,
          }),
          createElement(ToolbarButton, {
            label: 'Italic',
            icon: 'I',
            pressed: false,
            disabled: opts.italicDisabled ?? false,
            onClick: () => {},
          }),
          createElement(ToolbarButton, { label: 'Link', icon: 'L', onClick: () => {} }),
        ),
        createElement(
          ToolbarGroup,
          null,
          createElement(ToolbarButton, {
            label: 'Redrob AI',
            icon: '*',
            size: 'lg',
            detail: 'Open the assistant',
            onClick: () => {},
          }),
        ),
      ),
    ),
  )
  return { onBold }
}

const buttons = () => Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
const key = (el: HTMLElement, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  })

describe('Toolbar', () => {
  it('is a labelled toolbar', () => {
    render()
    const bar = host.querySelector('[role="toolbar"]')!
    expect(bar.getAttribute('aria-label')).toBe('Formatting')
  })

  it('is a single Tab stop from the first render', () => {
    render()
    expect(buttons().map((b) => b.tabIndex)).toEqual([0, -1, -1, -1])
  })

  it('arrow keys rove between enabled controls, skipping disabled ones, and wrap', () => {
    render({ italicDisabled: true })
    const [bold, italic, link, ai] = buttons() as [
      HTMLButtonElement,
      HTMLButtonElement,
      HTMLButtonElement,
      HTMLButtonElement,
    ]
    bold.focus()
    key(bold, 'ArrowRight')
    expect(document.activeElement).toBe(link)
    expect(link.tabIndex).toBe(0)
    expect(bold.tabIndex).toBe(-1)
    expect(italic.tabIndex).toBe(-1)
    key(link, 'ArrowRight')
    expect(document.activeElement).toBe(ai)
    key(ai, 'ArrowRight')
    expect(document.activeElement).toBe(bold)
    key(bold, 'ArrowLeft')
    expect(document.activeElement).toBe(ai)
    key(ai, 'Home')
    expect(document.activeElement).toBe(bold)
    key(bold, 'End')
    expect(document.activeElement).toBe(ai)
  })

  it('keeps the last focused control as the Tab stop across re-renders', () => {
    render()
    const link = buttons()[2]!
    link.focus()
    render({ boldPressed: true })
    expect(buttons().map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1])
  })

  it('exposes toggles through aria-pressed and leaves commands without it', () => {
    render({ boldPressed: true })
    const [bold, italic, link] = buttons()
    expect(bold!.getAttribute('aria-pressed')).toBe('true')
    expect(bold!.classList.contains('go-toolbar__btn--pressed')).toBe(true)
    expect(italic!.getAttribute('aria-pressed')).toBe('false')
    expect(link!.hasAttribute('aria-pressed')).toBe(false)
  })

  it('names icon buttons by label and large buttons by their visible text', () => {
    render()
    const [bold, , , ai] = buttons()
    expect(bold!.getAttribute('aria-label')).toBe('Bold')
    expect(bold!.dataset.tip).toBe('Bold')
    expect(bold!.dataset.tipKbd).toBe('Ctrl+B')
    expect(ai!.hasAttribute('aria-label')).toBe(false)
    expect(ai!.textContent).toContain('Redrob AI')
    expect(ai!.dataset.tipDetail).toBe('Open the assistant')
  })

  it('keeps focus where it is when pressed, so the editor keeps its selection', () => {
    const { onBold } = render()
    const bold = buttons()[0]!
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => {
      bold.dispatchEvent(down)
    })
    expect(down.defaultPrevented).toBe(true)
    act(() => bold.click())
    expect(onBold).toHaveBeenCalledTimes(1)
  })

  it('leaves arrow keys to a text field inside the toolbar', () => {
    act(() =>
      root.render(
        createElement(
          Toolbar,
          { label: 'Page' },
          createElement('input', { className: 'page-input', defaultValue: '12' }),
          createElement(ToolbarButton, { label: 'Zoom in', icon: '+', onClick: () => {} }),
        ),
      ),
    )
    const input = host.querySelector<HTMLInputElement>('.page-input')!
    input.focus()
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    act(() => {
      input.dispatchEvent(ev)
    })
    expect(document.activeElement).toBe(input)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('does not rove into an open dropdown list or a [data-toolbar-skip] popover', () => {
    act(() =>
      root.render(
        createElement(
          Toolbar,
          { label: 'Formatting' },
          createElement(Dropdown, {
            value: 'a',
            options: [
              { value: 'a', label: 'Alpha' },
              { value: 'b', label: 'Beta' },
            ],
            onPick: () => {},
          }),
          createElement(
            'span',
            { 'data-toolbar-skip': '' },
            createElement('button', { type: 'button', className: 'inside-pop' }, 'Apply'),
          ),
          createElement(ToolbarButton, { label: 'Bold', icon: 'B', onClick: () => {} }),
        ),
      ),
    )
    const trigger = host.querySelector<HTMLButtonElement>('.gs-dd-btn')!
    act(() => trigger.click())
    expect(host.querySelectorAll('[role="option"]').length).toBe(2)
    for (const o of host.querySelectorAll<HTMLButtonElement>('[role="option"]')) {
      expect(o.tabIndex).toBe(-1)
    }
    // close the list, then rove from the trigger: Bold is next, the popover button is skipped
    key(trigger, 'Escape')
    trigger.focus()
    key(trigger, 'ArrowRight')
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Bold"]'))
  })
})
