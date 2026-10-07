// EditorView: ties a Session to the screen. Pages and overlay (page-view,
// overlay), keyboard and Korean IME input through a hidden textarea proxy,
// mouse selection through the engine's hit test.
//
// Input proxy (design §5): a focused, invisible textarea sits at the caret so
// the OS IME window opens there. Composition is never written into the
// document while it is in progress; the preedit is drawn in the overlay and
// committed once, on compositionend, as one insert-text command. That is what
// keeps Hangul syllables from losing or doubling jamo.
//
// Keys the user presses while a syllable is still composing (an arrow, Enter,
// Tab) commit the syllable first. Browsers differ on whether they then send the
// key again: Chromium on Windows does not, macOS does. So such a key is kept
// and replayed after the commit unless the browser delivers it again itself.
import type { CursorRect } from '@genoffice/hwp-core'
import { CommandBus } from '../commands'
import { copy, cut, fromDataTransfer, paste, toDataTransfer } from '../clipboard'
import { fromEngine, sameContainer, type Pos } from '../position'
import { collapsed, ordered, type Change, type Session } from '../session'
import { resolveKey, type KeyLike } from './keymap'
import { Overlay } from './overlay'
import { PageView, type PageViewOptions } from './page-view'

const REPLAY_AFTER_COMPOSITION = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'enter', 'tab', 'home', 'end'])

export interface EditorViewOptions extends PageViewOptions {
  /** Idle time after the last keystroke before deferred pagination settles (ms). */
  settleAfterMs?: number
  mac?: boolean
  readOnly?: boolean
  /** Called for commands the bus doesn't have (file:save, dialogs…), so the host can handle them. */
  onUnhandledCommand?: (id: string, params?: unknown) => boolean
}

export class EditorView {
  readonly pages: PageView
  readonly overlay: Overlay
  readonly input: HTMLTextAreaElement
  composing = false
  readOnly: boolean
  private pendingKey: { e: KeyLike; timer: ReturnType<typeof setTimeout> | null } | null = null
  private dragging = false
  private unsubscribe: () => void
  private unsubscribeSettle: () => void
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private lastPageCount: number

  constructor(
    readonly root: HTMLElement,
    readonly session: Session,
    readonly bus: CommandBus = new CommandBus(session),
    private opts: EditorViewOptions = {},
  ) {
    this.readOnly = !!opts.readOnly
    root.classList.add('hwp-editor')
    root.style.position = root.style.position || 'relative'
    root.style.overflow = 'auto'
    this.pages = new PageView(root, session.doc, opts)
    this.overlay = new Overlay(this.pages)
    this.lastPageCount = session.doc.pageCount()

    const d = root.ownerDocument
    this.input = d.createElement('textarea')
    this.input.className = 'hwp-input'
    this.input.setAttribute('aria-label', 'Document')
    this.input.setAttribute('autocapitalize', 'off')
    this.input.setAttribute('autocomplete', 'off')
    this.input.spellcheck = false
    Object.assign(this.input.style, { position: 'absolute', opacity: '0', width: '1px', height: '1em', padding: '0', border: '0', resize: 'none', overflow: 'hidden', zIndex: '-1' })
    this.pages.content.appendChild(this.input)

    this.input.addEventListener('keydown', (e) => this.onKeyDown(e))
    this.input.addEventListener('beforeinput', (e) => this.onBeforeInput(e as InputEvent))
    this.input.addEventListener('input', () => {
      if (!this.composing) this.input.value = ''
    })
    this.input.addEventListener('compositionstart', () => this.onCompositionStart())
    this.input.addEventListener('compositionupdate', (e) => this.onCompositionUpdate((e as CompositionEvent).data))
    this.input.addEventListener('compositionend', (e) => this.onCompositionEnd((e as CompositionEvent).data))
    this.input.addEventListener('copy', (e) => this.onCopy(e as ClipboardEvent))
    this.input.addEventListener('cut', (e) => this.onCut(e as ClipboardEvent))
    this.input.addEventListener('paste', (e) => this.onPaste(e as ClipboardEvent))
    root.addEventListener('mousedown', (e) => this.onMouseDown(e))
    d.addEventListener('mousemove', (e) => this.onMouseMove(e))
    d.addEventListener('mouseup', () => (this.dragging = false))

    this.unsubscribe = session.onChange((c) => this.onChange(c))
    this.unsubscribeSettle = session.onSettle(() => this.onSettled())
    this.render()
  }

  focus(): void {
    this.input.focus({ preventScroll: true })
  }

  /** Run a command by id, falling back to the host for ones the bus doesn't know. */
  run(id: string, params?: unknown): Change | null | 'unhandled' {
    if (!this.bus.has(id)) return this.opts.onUnhandledCommand?.(id, params) ? null : 'unhandled'
    if (this.readOnly && !id.startsWith('move:') && id !== 'edit:select-all') return null
    const r = this.bus.run(id, params)
    this.render()
    return r
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  private onChange(_c: Change): void {
    if (this.session.layoutPending) this.scheduleSettle()
    const count = this.session.doc.pageCount()
    if (count !== this.lastPageCount) {
      this.lastPageCount = count
      this.pages.layout()
    } else this.pages.invalidate()
    this.overlay.redrawDecorations()
  }

  private scheduleSettle(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null
      this.session.settle()
    }, this.opts.settleAfterMs ?? 150)
  }

  private onSettled(): void {
    this.lastPageCount = this.session.doc.pageCount()
    this.pages.layout()
    this.overlay.redrawDecorations()
    this.render()
  }

  /** Redraw caret, selection and the input proxy position. */
  render(): void {
    const s = this.session
    const sel = s.selection
    let caret: CursorRect | null = null
    try {
      caret = s.text.cursorRect(sel.head)
    } catch {
      caret = null
    }
    if (collapsed(sel)) this.overlay.setSelection([])
    else this.overlay.setSelection(sameContainer(sel.anchor, sel.head) ? s.text.selectionRects(...ordered(sel)) : [])
    this.overlay.setCaret(caret, collapsed(sel) && !this.composing)
    if (caret) {
      const box = this.pages.pages[caret.pageIndex]
      if (box) {
        this.input.style.left = `${parseFloat(box.element.style.left) + caret.x * this.pages.zoom}px`
        this.input.style.top = `${box.top + caret.y * this.pages.zoom}px`
        this.input.style.height = `${caret.height * this.pages.zoom}px`
      }
      this.pages.reveal(caret.pageIndex, caret.y, caret.height)
    }
  }

  // ── Keyboard and IME ──────────────────────────────────────────────────

  onKeyDown(e: KeyboardEvent | (KeyLike & { isComposing?: boolean; preventDefault(): void })): void {
    const key = e.key.toLowerCase()
    if (this.composing || e.isComposing || e.key === 'Process') {
      if (REPLAY_AFTER_COMPOSITION.has(key)) this.pendingKey = { e: copyKey(e), timer: null }
      return
    }
    if (this.pendingKey && this.pendingKey.e.key.toLowerCase() === key) {
      // The browser re-sent the key itself after the commit; don't replay it.
      if (this.pendingKey.timer) clearTimeout(this.pendingKey.timer)
      this.pendingKey = null
    }
    if (this.handleKey(e)) e.preventDefault()
  }

  private handleKey(e: KeyLike): boolean {
    for (const r of resolveKey(e, this.opts.mac)) {
      if (this.bus.has(r.command)) {
        if (!this.bus.isEnabled(r.command, r.params)) continue
        this.run(r.command, r.params)
        return true
      }
      if (this.opts.onUnhandledCommand?.(r.command, r.params)) return true
    }
    return false
  }

  onBeforeInput(e: InputEvent | { inputType: string; data: string | null; isComposing?: boolean; preventDefault(): void }): void {
    if (this.composing || e.isComposing || e.inputType === 'insertCompositionText') return
    e.preventDefault()
    if (this.readOnly) return
    if (e.inputType === 'insertText' && e.data) this.run('edit:insert-text', { text: e.data })
    else if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') this.run('edit:split-paragraph')
    else if (e.inputType === 'insertFromPaste' && e.data) this.run('edit:insert-text', { text: e.data })
  }

  onCompositionStart(): void {
    this.composing = true
    this.render()
  }

  onCompositionUpdate(data: string): void {
    const s = this.session
    const at = s.text.cursorRect(collapsed(s.selection) ? s.selection.head : ordered(s.selection)[0])
    const props = s.text.charPropertiesAt(s.selection.head)
    const sizePx = typeof props.fontSize === 'number' ? (props.fontSize / 100) * (96 / 72) : at.height * 0.8
    this.overlay.setPreedit(data, at, { family: String(props.fontFamily ?? ''), sizePx })
  }

  onCompositionEnd(data: string): void {
    this.composing = false
    this.overlay.setPreedit('', null)
    this.input.value = ''
    if (data && !this.readOnly) this.run('edit:insert-text', { text: data })
    else this.render()
    const pending = this.pendingKey
    if (pending) {
      pending.timer = setTimeout(() => {
        if (this.pendingKey === pending) {
          this.pendingKey = null
          this.handleKey(pending.e)
        }
      }, 0)
    }
  }

  // ── Clipboard ─────────────────────────────────────────────────────────

  onCopy(e: { clipboardData: DataTransfer | null; preventDefault(): void }): void {
    const data = copy(this.session)
    e.preventDefault()
    if (data && e.clipboardData) toDataTransfer(e.clipboardData, data)
  }

  onCut(e: { clipboardData: DataTransfer | null; preventDefault(): void }): void {
    e.preventDefault()
    if (this.readOnly) return this.onCopy(e)
    const r = cut(this.session)
    if (r && e.clipboardData) toDataTransfer(e.clipboardData, r.data)
    this.render()
  }

  onPaste(e: { clipboardData: DataTransfer | null; preventDefault(): void }): void {
    e.preventDefault()
    if (this.readOnly) return
    const data = fromDataTransfer(e.clipboardData)
    if (data) paste(this.session, data)
    this.render()
  }

  // ── Mouse ─────────────────────────────────────────────────────────────

  private posAt(clientX: number, clientY: number): Pos | null {
    const pt = this.pages.pageAt(clientX, clientY)
    if (!pt) return null
    return fromEngine(this.session.doc.hitTest(pt.page, pt.x, pt.y))
  }

  onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return
    const p = this.posAt(e.clientX, e.clientY)
    if (!p) return
    e.preventDefault()
    const anchor = e.shiftKey ? this.session.selection.anchor : p
    this.session.select({ anchor: sameContainer(anchor, p) ? anchor : p, head: p })
    this.dragging = true
    this.render()
    this.focus()
  }

  onMouseMove(e: MouseEvent): void {
    if (!this.dragging) return
    const p = this.posAt(e.clientX, e.clientY)
    if (!p) return
    const anchor = this.session.selection.anchor
    if (!sameContainer(anchor, p)) return
    this.session.select({ anchor, head: p })
    this.render()
  }

  dispose(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.unsubscribe()
    this.unsubscribeSettle()
    this.input.remove()
    this.pages.dispose()
  }
}

function copyKey(e: KeyLike): KeyLike {
  return { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey }
}
