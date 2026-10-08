// @genoffice/hwp-core: the rhwp engine (our fork in engines/rhwp) as WASM.
//
// 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
//
// This package is deliberately thin. The engine owns fidelity: parsing, layout,
// pagination, painting and serialization. Interaction (input, caret, chrome)
// lives in @genoffice/hwp-editor and apps/hangul, never here.
//
// Initialise once per realm, then open documents:
//
//   await initHwpCore()                       // renderer (fetches the wasm)
//   initHwpCoreSync(bytes)                    // Node / tests (see ./node)
//   const doc = HwpCoreDocument.open(bytes)

import init, { initSync, HwpDocument, version as rawVersion } from '../wasm/rhwp.js'
import type {
  CharProperties,
  CursorRect,
  DocumentInfo,
  EditResult,
  HitTestResult,
  HwpFormat,
  NodeId,
  NodeLocation,
  NodeRead,
  Memo,
  ParagraphTarget,
  Outline,
  PageInfo,
  ParaProperties,
  SearchResult,
  SelectionRect,
} from './types'

export * from './types'
export type { HwpDocument as RawHwpDocument } from '../wasm/rhwp.js'

let ready = false

/** Initialise the engine in a browser-like realm. Safe to call more than once. */
export async function initHwpCore(wasm?: URL | string | Response | BufferSource): Promise<void> {
  if (ready) return
  const source = wasm ?? new URL('../wasm/rhwp_bg.wasm', import.meta.url)
  await init({ module_or_path: source as never })
  ready = true
}

/** Initialise synchronously from wasm bytes (Node, workers, tests). */
export function initHwpCoreSync(bytes: BufferSource): void {
  if (ready) return
  initSync({ module: bytes })
  ready = true
}

export function isHwpCoreReady(): boolean {
  return ready
}

function assertReady(): void {
  if (!ready) throw new Error('hwp-core: call initHwpCore() or initHwpCoreSync() first')
}

/** Engine version, e.g. "0.8.7". */
export function coreVersion(): string {
  assertReady()
  return rawVersion()
}

/** Thrown when an encrypted document is opened with no or a wrong password. */
export class HwpPasswordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HwpPasswordError'
  }
}

function toError(e: unknown): Error {
  if (e instanceof Error) return e
  return new Error(typeof e === 'string' ? e : JSON.stringify(e))
}

function decode<T>(json: string): T {
  return JSON.parse(json) as T
}

/**
 * One open document. Wraps the raw engine object, decoding JSON results.
 * `raw` stays available for engine calls the wrapper doesn't type yet.
 */
export class HwpCoreDocument {
  private constructor(readonly raw: HwpDocument) {}

  static open(bytes: Uint8Array, password?: string): HwpCoreDocument {
    assertReady()
    try {
      const raw = password === undefined ? new HwpDocument(bytes) : HwpDocument.openWithPassword(bytes, password)
      return new HwpCoreDocument(raw)
    } catch (e) {
      const err = toError(e)
      // The engine reports a wrong password with this Korean phrase (rhwp.d.ts, openWithPassword).
      if (/비밀번호|password|encrypt/i.test(err.message)) throw new HwpPasswordError(err.message)
      throw err
    }
  }

  /** A blank document from the engine's bundled 한글 2010 template (Hancom-compatible). */
  static blank(): HwpCoreDocument {
    assertReady()
    const raw = HwpDocument.createEmpty()
    raw.createBlankDocument()
    return new HwpCoreDocument(raw)
  }

  dispose(): void {
    this.raw.free()
  }

  // ── Document ──────────────────────────────────────────────────────────
  info(): DocumentInfo {
    return decode(this.raw.getDocumentInfo())
  }

  sourceFormat(): HwpFormat | 'hml' {
    return this.raw.getSourceFormat() as HwpFormat | 'hml'
  }

  pageCount(): number {
    return this.raw.pageCount()
  }

  sectionCount(): number {
    return this.raw.getSectionCount()
  }

  paragraphCount(section: number): number {
    return this.raw.getParagraphCount(section)
  }

  paragraphLength(section: number, para: number): number {
    return this.raw.getParagraphLength(section, para)
  }

  // ── Pages and painting ────────────────────────────────────────────────
  pageInfo(page: number): PageInfo {
    return decode(this.raw.getPageInfo(page))
  }

  /** Paint a page into a canvas at `scale` (device pixels per CSS px x zoom). */
  renderPage(page: number, canvas: HTMLCanvasElement, scale: number): void {
    this.raw.renderPageToCanvas(page, canvas, scale)
  }

  pageSvg(page: number): string {
    return this.raw.renderPageSvg(page)
  }

  // ── Geometry ──────────────────────────────────────────────────────────
  hitTest(page: number, x: number, y: number): HitTestResult {
    return decode(this.raw.hitTest(page, x, y))
  }

  cursorRect(section: number, para: number, offset: number): CursorRect {
    return decode(this.raw.getCursorRect(section, para, offset))
  }

  selectionRects(section: number, startPara: number, startOffset: number, endPara: number, endOffset: number): SelectionRect[] {
    return decode(this.raw.getSelectionRects(section, startPara, startOffset, endPara, endOffset))
  }

  // ── Read ──────────────────────────────────────────────────────────────
  text(section: number, para: number, offset = 0, count?: number): string {
    const n = count ?? this.paragraphLength(section, para) - offset
    return this.raw.getTextRange(section, para, offset, Math.max(0, n))
  }

  charPropertiesAt(section: number, para: number, offset: number): CharProperties {
    return decode(this.raw.getCharPropertiesAt(section, para, offset))
  }

  paraPropertiesAt(section: number, para: number): ParaProperties {
    return decode(this.raw.getParaPropertiesAt(section, para))
  }

  search(query: string, from: { section: number; para: number; offset: number }, opts: { forward?: boolean; caseSensitive?: boolean } = {}): SearchResult {
    return decode(this.raw.searchText(query, from.section, from.para, from.offset, opts.forward ?? true, opts.caseSensitive ?? false))
  }

  // ── Nodes (E1, E3) ────────────────────────────────────────────────────
  /** The document as a tree of nodes with session ids. */
  outline(): Outline {
    return decode(this.raw.getOutline())
  }

  /** Where a node is now, or null once it has been deleted. */
  locate(id: NodeId): NodeLocation | null {
    return decode(this.raw.locateNode(id))
  }

  /** Session id of body paragraph (section, para), or null when out of range. */
  nodeIdAt(section: number, para: number): NodeId | null {
    return this.raw.nodeIdAt(section, para) || null
  }

  nodeIdInCell(section: number, para: number, control: number, cell: number, cellPara: number): NodeId | null {
    return this.raw.nodeIdInCell(section, para, control, cell, cellPara) || null
  }

  readNodes(ids: NodeId[]): NodeRead[] {
    return decode(this.raw.readNodes(JSON.stringify(ids)))
  }

  // ── Memos (E4) ────────────────────────────────────────────────────────
  memos(): Memo[] {
    return decode(this.raw.listMemos())
  }

  /** Add a memo over [start, end) of a paragraph; returns its field id. */
  addMemo(target: ParagraphTarget, start: number, end: number, author: string, body: string): number {
    return this.raw.addMemo(JSON.stringify({ target, start, end, author, body }))
  }

  setMemoBody(fieldId: number, body: string): void {
    this.raw.setMemoBody(fieldId, body)
  }

  removeMemo(fieldId: number): void {
    this.raw.removeMemo(fieldId)
  }

  // ── Edit ──────────────────────────────────────────────────────────────
  insertText(section: number, para: number, offset: number, text: string): EditResult {
    return decode(this.raw.insertText(section, para, offset, text))
  }

  deleteRange(section: number, startPara: number, startOffset: number, endPara: number, endOffset: number): EditResult {
    return decode(this.raw.deleteRange(section, startPara, startOffset, endPara, endOffset))
  }

  // ── History ───────────────────────────────────────────────────────────
  saveSnapshot(): number {
    return this.raw.saveSnapshot()
  }

  restoreSnapshot(id: number): EditResult {
    return decode(this.raw.restoreSnapshot(id))
  }

  discardSnapshot(id: number): void {
    this.raw.discardSnapshot(id)
  }

  // ── Save ──────────────────────────────────────────────────────────────
  export(format: HwpFormat, password?: string): Uint8Array {
    if (format === 'hwpx') return password ? this.raw.exportHwpxWithPassword(password) : this.raw.exportHwpx()
    return password ? this.raw.exportHwpWithPassword(password) : this.raw.exportHwp()
  }
}
