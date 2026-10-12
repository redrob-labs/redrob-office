import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from '../src/Dialog'

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

describe('Dialog', () => {
  it('renders the kit Modal with the caller-supplied close label', () => {
    const onClose = vi.fn()
    act(() =>
      root.render(
        createElement(Dialog, { title: 'Delete file?', closeLabel: 'Abbrechen', onClose }, 'Body'),
      ),
    )
    const dialog = host.querySelector('[role="dialog"]')!
    expect(dialog.classList.contains('rr-modal')).toBe(true)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(host.querySelector('.rr-modal-scrim')!.classList.contains('go-dialog')).toBe(true)
    const close = host.querySelector<HTMLButtonElement>('.rr-modal__head button')!
    expect(close.getAttribute('aria-label')).toBe('Abbrechen')
    act(() => close.click())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape, and stops listening once closed', () => {
    const onClose = vi.fn()
    act(() => root.render(createElement(Dialog, { title: 'T', closeLabel: 'Close', onClose })))
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() =>
      root.render(createElement(Dialog, { open: false, title: 'T', closeLabel: 'Close', onClose })),
    )
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('puts the footer actions in the kit footer', () => {
    act(() =>
      root.render(
        createElement(Dialog, {
          title: 'T',
          closeLabel: 'Close',
          onClose: () => {},
          footer: createElement('button', { className: 'ok' }, 'OK'),
        }),
      ),
    )
    expect(host.querySelector('.rr-modal__footer .ok')).not.toBeNull()
  })
})
