import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installScreenTips } from '../src/screentip'

let uninstall: () => void
let bold: HTMLButtonElement
let italic: HTMLButtonElement

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ''
  bold = document.createElement('button')
  bold.dataset.tip = 'Bold'
  bold.dataset.tipKbd = 'Ctrl+B'
  italic = document.createElement('button')
  italic.dataset.tip = 'Italic'
  italic.dataset.tipDetail = 'Slant the selected text'
  document.body.append(bold, italic)
  uninstall = installScreenTips(document)
})

afterEach(() => {
  uninstall()
  vi.useRealTimers()
})

const over = (el: Element) =>
  el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: null }))
const tip = () => document.querySelector<HTMLElement>('.ui-screentip')
const visible = () => tip()?.style.visibility === 'visible'

describe('ScreenTip', () => {
  it('shows the name and shortcut after the 500ms hover delay, as a tooltip', () => {
    over(bold)
    vi.advanceTimersByTime(499)
    expect(visible()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(visible()).toBe(true)
    expect(tip()!.getAttribute('role')).toBe('tooltip')
    expect(tip()!.querySelector('.ui-screentip-name')!.textContent).toBe('Bold')
    expect(tip()!.querySelector<HTMLElement>('.ui-screentip-kbd')!.textContent).toBe('Ctrl+B')
    expect(tip()!.querySelector<HTMLElement>('.ui-screentip-detail')!.style.display).toBe('none')
  })

  it('reshows fast while warm, with the next control’s detail line', () => {
    over(bold)
    vi.advanceTimersByTime(500)
    over(italic)
    expect(visible()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(visible()).toBe(true)
    expect(tip()!.querySelector('.ui-screentip-name')!.textContent).toBe('Italic')
    expect(tip()!.querySelector('.ui-screentip-detail')!.textContent).toBe(
      'Slant the selected text',
    )
    expect(tip()!.querySelector<HTMLElement>('.ui-screentip-kbd')!.style.display).toBe('none')
  })

  it('hides on press and stays hidden on that control', () => {
    over(bold)
    vi.advanceTimersByTime(500)
    bold.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(visible()).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(visible()).toBe(false)
  })

  it('auto-hides after five seconds', () => {
    over(bold)
    vi.advanceTimersByTime(500)
    vi.advanceTimersByTime(5000)
    expect(visible()).toBe(false)
  })

  it('removes its element when uninstalled', () => {
    over(bold)
    vi.advanceTimersByTime(500)
    expect(tip()).not.toBeNull()
    uninstall()
    expect(tip()).toBeNull()
    uninstall = () => {}
  })
})
