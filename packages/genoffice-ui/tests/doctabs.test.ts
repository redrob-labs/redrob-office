import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocTabs, type DocTab, type DocTabsProps } from '../src/DocTabs'

const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
env.IS_REACT_ACT_ENVIRONMENT = true

const TABS: DocTab[] = [
  { id: 'home', title: 'Home' },
  { id: 't1', title: 'Report.docx', closable: true },
  { id: 't2', title: 'Budget.xlsx', closable: true, dirty: true },
  { id: 't3', title: 'Deck.pptx', closable: true },
]

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  // jsdom implements neither
  Element.prototype.scrollIntoView = vi.fn()
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  }
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(props: Partial<DocTabsProps> = {}) {
  const handlers = {
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onReorder: vi.fn(),
  }
  act(() =>
    root.render(
      createElement(DocTabs, {
        tabs: TABS,
        activeId: 't1',
        pinned: 1,
        strings: { label: 'Open documents', close: 'Close tab', unsaved: 'unsaved changes' },
        ...handlers,
        ...props,
      }),
    ),
  )
  return handlers
}

const tabs = () => Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]'))
const key = (el: HTMLElement, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  })

describe('DocTabs', () => {
  it('is a labelled tablist with one selected tab', () => {
    render()
    const list = host.querySelector('[role="tablist"]')!
    expect(list.getAttribute('aria-label')).toBe('Open documents')
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ])
  })

  it('uses a roving tabindex: only the active tab is in the Tab order', () => {
    render()
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1, -1])
    // close buttons never take a Tab stop; Delete closes from the keyboard
    for (const b of host.querySelectorAll<HTMLButtonElement>('.go-doctabs__close')) {
      expect(b.tabIndex).toBe(-1)
    }
  })

  it('arrow keys move focus without activating; Enter activates', () => {
    const { onActivate } = render()
    tabs()[1].focus()
    key(tabs()[1], 'ArrowRight')
    expect(document.activeElement).toBe(tabs()[2])
    expect(tabs()[2].tabIndex).toBe(0)
    expect(onActivate).not.toHaveBeenCalled()
    key(tabs()[2], 'Enter')
    expect(onActivate).toHaveBeenCalledWith('t2')
  })

  it('wraps at both ends and supports Home / End', () => {
    render()
    tabs()[1].focus()
    key(tabs()[1], 'End')
    expect(document.activeElement).toBe(tabs()[3])
    key(tabs()[3], 'ArrowRight')
    expect(document.activeElement).toBe(tabs()[0])
    key(tabs()[0], 'ArrowLeft')
    expect(document.activeElement).toBe(tabs()[3])
    key(tabs()[3], 'Home')
    expect(document.activeElement).toBe(tabs()[0])
  })

  it('Delete closes a closable tab and never the pinned one', () => {
    const { onClose } = render()
    key(tabs()[0], 'Delete')
    expect(onClose).not.toHaveBeenCalled()
    key(tabs()[3], 'Delete')
    expect(onClose).toHaveBeenCalledWith('t3')
  })

  it('the close button closes without activating the tab', () => {
    const { onClose, onActivate } = render()
    const close = tabs()[3].querySelector<HTMLButtonElement>('.go-doctabs__close')!
    expect(close.getAttribute('aria-label')).toBe('Close tab')
    act(() => close.click())
    expect(onClose).toHaveBeenCalledWith('t3')
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('pressing an inactive tab activates it at once', () => {
    const { onActivate } = render()
    act(() => {
      tabs()[2].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    expect(onActivate).toHaveBeenCalledWith('t2')
  })

  it('marks a dirty tab visibly and in its accessible name', () => {
    render()
    const dirty = tabs()[2]
    expect(dirty.classList.contains('go-doctabs__tab--dirty')).toBe(true)
    expect(dirty.querySelector('.go-doctabs__dirty')).not.toBeNull()
    expect(dirty.getAttribute('aria-label')).toBe('Budget.xlsx, unsaved changes')
  })

  it('renders pinned tabs as pinned and without a close button', () => {
    render()
    expect(tabs()[0].classList.contains('go-doctabs__tab--pinned')).toBe(true)
    expect(tabs()[0].querySelector('.go-doctabs__close')).toBeNull()
  })

  it('keeps trailing controls outside the tablist', () => {
    render({ trailing: createElement('button', { className: 'new-tab' }, '+') })
    const button = host.querySelector('.new-tab')!
    expect(button.closest('[role="tablist"]')).toBeNull()
    expect(button.closest('.go-doctabs__strip')).not.toBeNull()
  })
})
