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
import { objectAt, objectBox } from '../object-commands'
import { hyperlinkAt } from '../field-commands'
import { resolveKey, type KeyLike } from './keymap'
import { Overlay } from './overlay'
import { PageView, type PageViewOptions } from './page-view'

const REPLAY_AFTER_COMPOSITION = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'enter', 'tab', 'home', 'end'])

export interface EditorViewOptions extends PageViewOptions {
  /** Idle time after the last keystroke before deferred pagination settles (ms). */
  settleAfterMs?: number
  mac?: boolean
  readOnly?: boolean
  /** Called after every render: caret or selection moved, or the document changed. */
  onRender?: () => void
  /** Called for commands the bus doesn't have (file:save, dialogs…), so the host can handle them. */
  onUnhandledCommand?: (id: string, params?: unknown) => boolean
  /** Ctrl+click (⌘+click) on a hyperlink, as in 한글. The host opens it outside the editor. */
  onOpenLink?: (uri: string) => void
  /** Commands whose shortcut goes to the host first (they open a dialog that asks for input). */
  dialogFirst?: ReadonlySet<string>
  /** Accessible name of the text input (the document body), in the host's language. */
  inputLabel?: string
}

export class EditorView {
  readonly pages: PageView
  readonly overlay: Overlay
  readonly input: HTMLTextAreaElement
  composing = false
  /** Suggesting mode: cut marks text deleted and paste goes in as tracked plain text. */
  recording = false
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
    this.input.setAttribute('aria-label', opts.inputLabel ?? 'Document')
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
    root.addEventListener('dblclick', (e) => this.onDoubleClick(e))
    d.addEventListener('mousemove', (e) => this.onMouseMove(e))
    d.addEventListener('mouseup', () => (this.dragging = false))

    this.registerViewCommands()
    this.unsubscribe = session.onChange((c) => this.onChange(c))
    this.unsubscribeSettle = session.onSettle(() => this.onSettled())
    this.render()
  }

  /** Rename the text input after a language change. */
  setInputLabel(label: string): void {
    this.input.setAttribute('aria-label', label)
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
    this.drawObjectSelection()
    if (collapsed(sel)) this.overlay.setSelection([])
    else this.overlay.setSelection(sameContainer(sel.anchor, sel.head) ? s.text.selectionRects(...ordered(sel)) : [])
    this.overlay.setCaret(caret, collapsed(sel) && !this.composing && !s.object)
    if (caret) {
      const box = this.pages.pages[caret.pageIndex]
      if (box) {
        this.input.style.left = `${parseFloat(box.element.style.left) + caret.x * this.pages.zoom}px`
        this.input.style.top = `${box.top + caret.y * this.pages.zoom}px`
        this.input.style.height = `${caret.height * this.pages.zoom}px`
      }
      this.pages.reveal(caret.pageIndex, caret.y, caret.height)
    }
    this.opts.onRender?.()
  }

  /** Zoom lives on the view, not the document: these change no bytes and record no history. */
  private registerViewCommands(): void {
    const zoom = (id: string, to: (z: number) => number) => {
      if (this.bus.has(id)) return
      this.bus.register({
        id,
        isEnabled: () => true,
        run: () => {
          this.pages.setZoom(to(this.pages.zoom))
          this.overlay.redrawDecorations()
          return null
        },
      })
    }
    // Display toggles: they change what the engine paints, not the document, so they
    // keep no history and never mark the file unsaved.
    const toggle = (id: string, get: () => boolean, set: (on: boolean) => void) => {
      if (this.bus.has(id)) return
      this.bus.register({
        id,
        isEnabled: () => true,
        isActive: () => get(),
        run: () => {
          set(!get())
          this.pages.invalidate()
          this.overlay.redrawDecorations()
          return null
        },
      })
    }
    const raw = this.session.doc.raw
    toggle('view:para-mark', () => raw.getShowParagraphMarks(), (on) => raw.setShowParagraphMarks(on))
    toggle('view:ctrl-mark', () => raw.getShowControlCodes(), (on) => raw.setShowControlCodes(on))
    toggle('view:border-transparent', () => raw.getShowTransparentBorders(), (on) => raw.setShowTransparentBorders(on))
    let clip = true
    toggle('view:toggle-clip', () => !clip, (show) => {
      clip = !show
      raw.setClipEnabled(clip)
    })
    toggle('view:toggle-grid', () => this.pages.content.classList.contains('hwp-show-grid'), (on) => this.pages.content.classList.toggle('hwp-show-grid', on))
    // 현재 쪽만 감추기 (header and footer) and 머리말/꼬리말 감추기 (header) on the caret's page.
    const page = () => {
      try {
        return this.session.text.cursorRect(this.session.selection.head).pageIndex
      } catch {
        return 0
      }
    }
    const hide = (id: string, header: boolean, footer: boolean) => {
      if (this.bus.has(id)) return
      this.bus.register({
        id,
        isEnabled: () => true,
        run: () => {
          const p = page()
          if (header) raw.toggleHideHeaderFooter(p, true)
          if (footer) raw.toggleHideHeaderFooter(p, false)
          this.pages.invalidate()
          return null
        },
      })
    }
    hide('page:hide-current', true, true)
    hide('page:hide-headerfooter', true, false)
    const steps = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2, 3, 4, 5]
    zoom('view:zoom-in', (z) => steps.find((s) => s > z + 1e-6) ?? 5)
    zoom('view:zoom-out', (z) => [...steps].reverse().find((s) => s < z - 1e-6) ?? 0.25)
    zoom('view:zoom-100', () => 1)
    if (!this.bus.has('view:zoom-set')) {
      this.bus.register({
        id: 'view:zoom-set',
        isEnabled: () => true,
        run: (_ctx, params: { percent: number }) => {
          const percent = Number(params?.percent ?? 100)
          this.pages.setZoom(Math.min(500, Math.max(10, percent)) / 100)
          this.overlay.redrawDecorations()
          return null
        },
      })
    }
    zoom('view:zoom-fit-width', () => {
      const page = this.pages.pages[0]
      const width = this.root.clientWidth - 48
      return page && width > 0 ? width / page.info.width : 1
    })
    zoom('view:zoom-fit-page', () => {
      const page = this.pages.pages[0]
      const w = this.root.clientWidth - 48
      const h = this.root.clientHeight - 32
      return page && w > 0 && h > 0 ? Math.min(w / page.info.width, h / page.info.height) : 1
    })
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
    if (this.session.object && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'Escape') {
        this.session.selectObject(null)
        this.render()
        return true
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!this.readOnly) this.run('insert:picture-delete')
        return true
      }
      if (e.key === 'Enter') return !!this.opts.onUnhandledCommand?.('format:object-properties')
    }
    for (const r of resolveKey(e, this.opts.mac)) {
      if (this.opts.dialogFirst?.has(r.command) && this.opts.onUnhandledCommand?.(r.command, r.params)) return true
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
    if (this.recording) {
      // Suggesting: the cut text is marked deleted, not removed.
      const data = copy(this.session)
      if (data && e.clipboardData) toDataTransfer(e.clipboardData, data)
      if (data) this.bus.run('edit:delete-backward')
      return this.render()
    }
    const r = cut(this.session)
    if (r && e.clipboardData) toDataTransfer(e.clipboardData, r.data)
    this.render()
  }

  onPaste(e: { clipboardData: DataTransfer | null; preventDefault(): void }): void {
    e.preventDefault()
    if (this.readOnly) return
    const data = fromDataTransfer(e.clipboardData)
    // Suggesting: paste as text through the bus, so it is recorded as an insertion.
    if (data && this.recording) this.bus.run('edit:insert-text', { text: data.text })
    else if (data) paste(this.session, data)
    this.render()
  }

  // ── Mouse ─────────────────────────────────────────────────────────────

  private posAt(clientX: number, clientY: number): Pos | null {
    const pt = this.pages.pageAt(clientX, clientY)
    if (!pt) return null
    return fromEngine(this.session.doc.hitTest(pt.page, pt.x, pt.y))
  }

  /** The picture or drawing object under the pointer, if any. */
  private objectUnder(clientX: number, clientY: number) {
    const pt = this.pages.pageAt(clientX, clientY)
    if (!pt) return null
    try {
      return objectAt(this.session, pt.page, pt.x, pt.y)
    } catch {
      return null
    }
  }

  private drawObjectSelection(): void {
    const o = this.session.object
    const box = o ? objectBox(this.session, o) : null
    if (!o || !box) {
      if (o) this.session.selectObject(null)
      this.overlay.clearDecoration('object:selected')
      return
    }
    this.overlay.setDecoration({ key: 'object:selected', kind: 'object-selection', rects: [{ pageIndex: box.page, x: box.x, y: box.y, width: box.width, height: box.height }] })
  }

  onDoubleClick(e: MouseEvent): void {
    if (e.button !== 0 || !this.session.object) return
    e.preventDefault()
    this.opts.onUnhandledCommand?.('format:object-properties')
  }

  onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return
    const hit = e.shiftKey ? null : this.objectUnder(e.clientX, e.clientY)
    if (hit) {
      e.preventDefault()
      this.session.selectObject({ kind: hit.kind, section: hit.section, para: hit.para, control: hit.control })
      this.dragging = false
      this.render()
      this.focus()
      return
    }
    const p = this.posAt(e.clientX, e.clientY)
    if (!p) {
      // A click on empty paper still lets go of a selected object.
      if (this.session.object && this.pages.pageAt(e.clientX, e.clientY)) {
        this.session.selectObject(null)
        this.render()
      }
      return
    }
    e.preventDefault()
    if ((this.opts.mac ? e.metaKey : e.ctrlKey) && this.opts.onOpenLink) {
      const link = hyperlinkAt(this.session, p)
      if (link) {
        this.opts.onOpenLink(link.uri)
        return
      }
    }
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
