// The overlay: everything the editor draws on top of the engine's pages.
// Caret, selection, IME preedit, and decorations (comment highlights,
// suggestion marks, remote carets, AI pending edits). Plain DOM boxes on each
// page's overlay layer, positioned in page coordinates times zoom; never the
// document canvas (spec R2.3).
import type { CursorRect, SelectionRect } from '@genoffice/hwp-core'
import type { PageView } from './page-view'

export interface Decoration {
  /** Stable key so updates replace rather than duplicate. */
  key: string
  kind: 'comment' | 'suggestion-insert' | 'suggestion-delete' | 'remote-selection' | 'remote-caret' | 'ai-pending' | 'find' | 'object-selection'
  rects: SelectionRect[]
  /** Colour for remote people, from the presence seat. */
  color?: string
  label?: string
}

export class Overlay {
  private caretEl: HTMLDivElement | null = null
  private selectionEls: HTMLDivElement[] = []
  private preeditEl: HTMLDivElement | null = null
  private decorations = new Map<string, { d: Decoration; els: HTMLElement[] }>()

  constructor(private view: PageView) {}

  private layer(page: number): HTMLDivElement | null {
    return this.view.pages[page]?.overlay ?? null
  }

  private box(page: number, x: number, y: number, w: number, h: number, className: string): HTMLDivElement | null {
    const layer = this.layer(page)
    if (!layer) return null
    const z = this.view.zoom
    const el = layer.ownerDocument.createElement('div')
    el.className = className
    el.style.position = 'absolute'
    el.style.left = `${x * z}px`
    el.style.top = `${y * z}px`
    el.style.width = `${w * z}px`
    el.style.height = `${h * z}px`
    layer.appendChild(el)
    return el
  }

  setCaret(rect: CursorRect | null, visible = true): void {
    this.caretEl?.remove()
    this.caretEl = null
    if (!rect || !visible) return
    this.caretEl = this.box(rect.pageIndex, rect.x, rect.y, 0, rect.height, 'hwp-caret')
    if (this.caretEl) this.caretEl.style.borderLeft = '1.5px solid currentColor'
  }

  get caret(): HTMLDivElement | null {
    return this.caretEl
  }

  setSelection(rects: SelectionRect[]): void {
    for (const el of this.selectionEls) el.remove()
    this.selectionEls = rects
      .map((r) => this.box(r.pageIndex, r.x, r.y, r.width, r.height, 'hwp-selection'))
      .filter((e): e is HTMLDivElement => !!e)
  }

  get selectionCount(): number {
    return this.selectionEls.length
  }

  /**
   * IME preedit: the composing syllable drawn at the caret in the run's font,
   * underlined as every OS draws composition, until compositionend commits it
   * through the engine.
   */
  setPreedit(text: string, at: CursorRect | null, font?: { family: string; sizePx: number }): void {
    this.preeditEl?.remove()
    this.preeditEl = null
    if (!text || !at) return
    const el = this.box(at.pageIndex, at.x, at.y, 0, at.height, 'hwp-preedit')
    if (!el) return
    el.textContent = text
    el.style.width = 'auto'
    el.style.whiteSpace = 'pre'
    el.style.textDecoration = 'underline'
    el.style.lineHeight = `${at.height * this.view.zoom}px`
    el.style.background = 'var(--hwp-paper, #fff)'
    if (font) {
      el.style.fontFamily = font.family
      el.style.fontSize = `${font.sizePx * this.view.zoom}px`
    }
    this.preeditEl = el
  }

  get preedit(): HTMLDivElement | null {
    return this.preeditEl
  }

  setDecoration(d: Decoration): void {
    this.clearDecoration(d.key)
    const els: HTMLElement[] = []
    for (const r of d.rects) {
      const el = this.box(r.pageIndex, r.x, r.y, d.kind === 'remote-caret' ? 0 : r.width, r.height, `hwp-deco hwp-deco-${d.kind}`)
      if (!el) continue
      el.dataset.key = d.key
      if (d.color) el.style.setProperty('--hwp-deco-color', d.color)
      if (d.label) el.title = d.label
      els.push(el)
    }
    this.decorations.set(d.key, { d, els })
  }

  clearDecoration(key: string): void {
    const cur = this.decorations.get(key)
    if (!cur) return
    for (const el of cur.els) el.remove()
    this.decorations.delete(key)
  }

  decorationKeys(): string[] {
    return [...this.decorations.keys()]
  }

  /** Redraw decorations after a relayout or zoom (their rects are in page coordinates). */
  redrawDecorations(): void {
    for (const { d } of [...this.decorations.values()]) this.setDecoration(d)
  }
}
