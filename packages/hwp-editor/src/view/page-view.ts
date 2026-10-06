// Pages on screen. Each page is a box holding one canvas the engine paints
// and one overlay layer the editor paints (caret, selection, decorations).
// Document pixels come only from the engine (spec R2.1); the editor never
// draws text.
//
// Pages are virtualised: only pages within `buffer` pages of the viewport hold
// a painted canvas. Zoom repaints through the engine at the new scale (never a
// CSS-scaled bitmap), multiplied by the device pixel ratio.
import type { HwpCoreDocument, PageInfo } from '@genoffice/hwp-core'

export type Painter = (page: number, canvas: HTMLCanvasElement, scale: number) => void

export interface PageViewOptions {
  /** Gap between pages in CSS px. */
  gap?: number
  /** Pages painted beyond the viewport on each side. */
  buffer?: number
  zoom?: number
  devicePixelRatio?: () => number
  painter?: Painter
}

export interface PageBox {
  index: number
  info: PageInfo
  element: HTMLDivElement
  canvas: HTMLCanvasElement
  overlay: HTMLDivElement
  /** Top of the page in the scroll content, CSS px at the current zoom. */
  top: number
  painted: { scale: number; generation: number } | null
}

/** A point on a page, in the engine's page coordinates (CSS px at 96 dpi, zoom 1). */
export interface PagePoint {
  page: number
  x: number
  y: number
}

export class PageView {
  readonly content: HTMLDivElement
  pages: PageBox[] = []
  zoom: number
  private generation = 0
  private readonly gap: number
  private readonly buffer: number
  private readonly dpr: () => number
  private readonly painter: Painter

  constructor(
    readonly scroller: HTMLElement,
    private doc: HwpCoreDocument,
    opts: PageViewOptions = {},
  ) {
    this.gap = opts.gap ?? 16
    this.buffer = opts.buffer ?? 2
    this.zoom = opts.zoom ?? 1
    this.dpr = opts.devicePixelRatio ?? (() => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1))
    this.painter = opts.painter ?? ((page, canvas, scale) => this.doc.renderPage(page, canvas, scale))
    const doc0 = scroller.ownerDocument
    this.content = doc0.createElement('div')
    this.content.className = 'hwp-pages'
    this.content.style.position = 'relative'
    scroller.appendChild(this.content)
    scroller.addEventListener('scroll', () => this.paintVisible(), { passive: true })
    this.layout()
  }

  /** Re-read page geometry (after edits that may change page count or size) and repaint. */
  layout(): void {
    const count = this.doc.pageCount()
    const d = this.scroller.ownerDocument
    while (this.pages.length > count) this.pages.pop()!.element.remove()
    let top = this.gap
    let maxWidth = 0
    for (let i = 0; i < count; i++) {
      const info = this.doc.pageInfo(i)
      let box = this.pages[i]
      if (!box) {
        const element = d.createElement('div')
        element.className = 'hwp-page'
        element.dataset.page = String(i)
        element.style.position = 'absolute'
        const canvas = d.createElement('canvas')
        canvas.className = 'hwp-page-canvas'
        canvas.style.position = 'absolute'
        canvas.style.inset = '0'
        const overlay = d.createElement('div')
        overlay.className = 'hwp-page-overlay'
        overlay.style.position = 'absolute'
        overlay.style.inset = '0'
        overlay.style.pointerEvents = 'none'
        element.append(canvas, overlay)
        this.content.appendChild(element)
        box = { index: i, info, element, canvas, overlay, top, painted: null }
        this.pages.push(box)
      }
      box.info = info
      box.top = top
      const w = info.width * this.zoom
      const h = info.height * this.zoom
      box.element.style.top = `${top}px`
      box.element.style.width = `${w}px`
      box.element.style.height = `${h}px`
      box.canvas.style.width = `${w}px`
      box.canvas.style.height = `${h}px`
      maxWidth = Math.max(maxWidth, w)
      top += h + this.gap
    }
    for (const box of this.pages) box.element.style.left = `${Math.max(0, (maxWidth - box.info.width * this.zoom) / 2) + this.gap}px`
    this.content.style.height = `${top}px`
    this.content.style.width = `${maxWidth + this.gap * 2}px`
    this.invalidate()
  }

  /** Mark every page stale and repaint the visible ones. Call after any document change. */
  invalidate(): void {
    this.generation++
    this.paintVisible()
  }

  setZoom(zoom: number): void {
    this.zoom = Math.min(5, Math.max(0.1, zoom))
    this.layout()
  }

  /** Pages within the viewport plus the buffer. */
  visiblePages(): number[] {
    const top = this.scroller.scrollTop
    const bottom = top + (this.scroller.clientHeight || 1000)
    const hits = this.pages.filter((p) => p.top + p.info.height * this.zoom >= top && p.top <= bottom).map((p) => p.index)
    if (!hits.length) return this.pages.length ? [0] : []
    const from = Math.max(0, hits[0]! - this.buffer)
    const to = Math.min(this.pages.length - 1, hits[hits.length - 1]! + this.buffer)
    return Array.from({ length: to - from + 1 }, (_, i) => from + i)
  }

  paintVisible(): void {
    const keep = new Set(this.visiblePages())
    const scale = this.zoom * this.dpr()
    for (const box of this.pages) {
      if (!keep.has(box.index)) {
        if (box.painted) {
          // Release the backing store of far-away pages.
          box.canvas.width = 0
          box.canvas.height = 0
          box.painted = null
        }
        continue
      }
      if (box.painted && box.painted.scale === scale && box.painted.generation === this.generation) continue
      this.painter(box.index, box.canvas, scale)
      // The engine sizes the canvas backing store; keep the CSS size at the zoomed page size.
      box.canvas.style.width = `${box.info.width * this.zoom}px`
      box.canvas.style.height = `${box.info.height * this.zoom}px`
      box.painted = { scale, generation: this.generation }
    }
  }

  /** Viewport client point → page point, or null between pages. */
  pageAt(clientX: number, clientY: number): PagePoint | null {
    for (const box of this.pages) {
      const r = box.element.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return { page: box.index, x: (clientX - r.left) / this.zoom, y: (clientY - r.top) / this.zoom }
      }
    }
    return null
  }

  /** Scroll so a page rectangle is visible. */
  reveal(page: number, y: number, height: number): void {
    const box = this.pages[page]
    if (!box) return
    const top = box.top + y * this.zoom
    const bottom = top + height * this.zoom
    const view = this.scroller
    if (top < view.scrollTop) view.scrollTop = top - 24
    else if (bottom > view.scrollTop + view.clientHeight) view.scrollTop = bottom - view.clientHeight + 24
  }

  dispose(): void {
    this.content.remove()
    this.pages = []
  }
}
