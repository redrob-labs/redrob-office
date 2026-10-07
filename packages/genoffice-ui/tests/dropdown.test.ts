import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dropdown, type DropdownOption } from '../src/dropdown'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true

const OPTIONS: DropdownOption[] = [
  { value: 'paragraph', label: 'Text' },
  { value: 'h1', label: 'Heading 1', render: createElement('b', { className: 'preview' }, 'H1') },
  { value: 'h2', label: 'Heading 2', disabled: true },
  { value: 'h3', label: 'Heading 3' },
]

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

function render(value = 'paragraph', extra: { disabled?: boolean } = {}) {
  const onPick = vi.fn()
  act(() =>
    root.render(
      createElement(Dropdown, {
        value,
        options: OPTIONS,
        onPick,
        className: 'rb-style',
        ariaLabel: 'Paragraph style',
        ...extra,
      }),
    ),
  )
  return { onPick }
}

const trigger = () => host.querySelector<HTMLButtonElement>('.gs-dd-btn')!
const options = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="option"]'))
const key = (k: string) =>
  act(() => {
    trigger().dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
    )
  })

describe('Dropdown', () => {
  it('is a labelled listbox trigger showing the current option, with the kit caret', () => {
    render('h1')
    const btn = trigger()
    expect(btn.getAttribute('aria-haspopup')).toBe('listbox')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.getAttribute('aria-label')).toBe('Paragraph style')
    expect(btn.querySelector('.gs-dd-value .preview')?.textContent).toBe('H1')
    expect(btn.querySelector('.gs-dd-caret svg')).not.toBeNull()
    expect(host.querySelector('.gs-dd')!.classList.contains('rb-style')).toBe(true)
  })

  it('opens on click with the current value selected', () => {
    render('h3')
    act(() => trigger().click())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    const selected = options().filter((o) => o.getAttribute('aria-selected') === 'true')
    expect(selected.map((o) => o.dataset.value)).toEqual(['h3'])
    expect(selected[0]!.classList.contains('active')).toBe(true)
  })

  it('picks with the keyboard and closes', () => {
    const { onPick } = render()
    key('ArrowDown')
    expect(options()).toHaveLength(4)
    key('ArrowDown')
    key('Enter')
    expect(onPick).toHaveBeenCalledWith('h1')
    expect(options()).toHaveLength(0)
  })

  it('never picks a disabled option', () => {
    const { onPick } = render('h1')
    act(() => trigger().click())
    act(() => options()[2]!.click())
    expect(onPick).not.toHaveBeenCalled()
    expect(options()).toHaveLength(4)
  })

  it('Escape closes without picking and does not bubble to a hosting dialog', () => {
    const { onPick } = render()
    // host is React's root container, so "outside" is its parent
    const outer = vi.fn()
    document.body.addEventListener('keydown', outer)
    key('Enter')
    key('Escape')
    document.body.removeEventListener('keydown', outer)
    expect(options()).toHaveLength(0)
    expect(onPick).not.toHaveBeenCalled()
    expect(outer).toHaveBeenCalledTimes(1) // only the opening Enter bubbled
  })

  it('shows an off-list value as itself rather than the first option', () => {
    render('Comic Sans')
    expect(trigger().querySelector('.gs-dd-value')!.textContent).toBe('Comic Sans')
  })

  it('does not open while disabled', () => {
    render('paragraph', { disabled: true })
    act(() => trigger().click())
    expect(options()).toHaveLength(0)
  })
})
