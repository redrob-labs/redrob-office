// Clipboard (spec task 1.8).
//
// Copy puts three flavours on the system clipboard: plain text, HTML (the
// engine's export, with fonts and runs inline, so Docs, Word and browsers keep
// formatting) and a Redrob marker naming this document's internal clipboard.
//
// Paste picks, in order:
//   1. Internal: the marker matches the document's internal clipboard and the
//      plain text still matches what was copied, so the copy carries every HWP
//      property, objects included (engine `pasteInternal`).
//   2. HTML from anything else: Docs, Office, a browser, another Hangul
//      document (engine `pasteHtml`, which maps CSS onto char/para shapes).
//   3. Plain text.
// Each paste is one undoable command.
import { compare, sameContainer, type Pos } from './position'
import { collapsed, ordered, type Change, type ChangeOrigin, type Session } from './session'

export const REDROB_HWP_MIME = 'application/x-redrob-hwp-clip'

export interface ClipData {
  text: string
  html?: string
  /** Value of REDROB_HWP_MIME. */
  marker?: string
}

let docSeq = 0
const docIds = new WeakMap<object, string>()

function docId(s: Session): string {
  let id = docIds.get(s.doc)
  if (!id) {
    id = `hwp-${Date.now().toString(36)}-${++docSeq}`
    docIds.set(s.doc, id)
  }
  return id
}

function ok(json: string, what: string): Record<string, unknown> {
  const r = JSON.parse(json) as Record<string, unknown>
  if (r.ok === false) throw new Error(`${what}: ${String(r.error ?? json)}`)
  return r
}

/** Copy the selection to the engine's internal clipboard and return the system-clipboard flavours. */
export function copy(s: Session): ClipData | null {
  const sel = s.selection
  if (collapsed(sel) || !sameContainer(sel.anchor, sel.head)) return null
  const [a, b] = ordered(sel)
  const raw = s.doc.raw
  let text: string
  let html: string
  if (a.cell) {
    const c = a.cell
    text = String(ok(raw.copySelectionInCell(a.section, a.para, c.control, c.cell, c.para, a.offset, b.cell!.para, b.offset), 'copySelectionInCell').text ?? '')
    html = raw.exportSelectionInCellHtml(a.section, a.para, c.control, c.cell, c.para, a.offset, b.cell!.para, b.offset)
  } else {
    text = String(ok(raw.copySelection(a.section, a.para, a.offset, b.para, b.offset), 'copySelection').text ?? '')
    html = raw.exportSelectionHtml(a.section, a.para, a.offset, b.para, b.offset)
  }
  return { text, html, marker: `${docId(s)}:${s.changeSeq}` }
}

export function cut(s: Session, origin: ChangeOrigin = 'user'): { data: ClipData; change: Change } | null {
  const data = copy(s)
  if (!data) return null
  const [a, b] = ordered(s.selection)
  const change = s.edit('edit:cut', () => {
    const p = s.text.delete(a, b)
    return { anchor: p, head: p }
  }, origin)
  return { data, change }
}

/** Whether `data` came from this document's own internal clipboard. */
export function isInternal(s: Session, data: ClipData): boolean {
  if (!data.marker || !data.marker.startsWith(`${docId(s)}:`)) return false
  if (!s.doc.raw.hasInternalClipboard()) return false
  return normalise(s.doc.raw.getClipboardText()) === normalise(data.text)
}

const normalise = (t: string) => t.replace(/\r\n?/g, '\n')

const BLOCK = '(?:html|head|body|p|div|table|thead|tbody|tr|td|th|ul|ol|li|h[1-6]|br|style|meta)'

/**
 * Drop whitespace-only text next to block tags and comments. Exported HTML
 * (ours and Office's) pretty-prints with newlines between blocks, and the
 * engine's HTML import reads such text as a line break. Spaces between inline
 * runs (`</b> <i>`) are content and stay.
 */
export function tidyHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(new RegExp(`\\s+(?=</?${BLOCK}\\b)`, 'gi'), '')
    .replace(new RegExp(`(<\\/?${BLOCK}\\b[^>]*>)\\s+`, 'gi'), '$1')
}

function pasteAt(s: Session, p: Pos, data: ClipData): Pos {
  const raw = s.doc.raw
  if (isInternal(s, data)) {
    if (p.cell) {
      const r = ok(raw.pasteInternalInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, p.offset), 'pasteInternalInCell')
      return { ...p, offset: Number(r.charOffset), cell: { ...p.cell, para: Number(r.cellParaIndex ?? r.cellParaIdx ?? p.cell.para) } }
    }
    const r = ok(raw.pasteInternal(p.section, p.para, p.offset), 'pasteInternal')
    return { section: p.section, para: Number(r.paraIdx), offset: Number(r.charOffset) }
  }
  if (data.html && data.html.trim()) {
    if (p.cell) {
      const r = ok(raw.pasteHtmlInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, p.offset, tidyHtml(data.html)), 'pasteHtmlInCell')
      return { ...p, offset: Number(r.charOffset), cell: { ...p.cell, para: Number(r.cellParaIndex ?? r.cellParaIdx ?? p.cell.para) } }
    }
    const r = ok(raw.pasteHtml(p.section, p.para, p.offset, tidyHtml(data.html)), 'pasteHtml')
    return { section: p.section, para: Number(r.paraIdx), offset: Number(r.charOffset) }
  }
  let q = p
  normalise(data.text).split('\n').forEach((part, i) => {
    if (i > 0) q = s.text.split(q)
    q = s.text.insert(q, part)
  })
  return q
}

export function paste(s: Session, data: ClipData, origin: ChangeOrigin = 'user'): Change | null {
  if (!data.text && !data.html) return null
  return s.edit('edit:paste', () => {
    const sel = s.selection
    let p = sel.head
    if (!collapsed(sel) && sameContainer(sel.anchor, sel.head)) {
      const [a, b] = ordered(sel)
      p = compare(a, b) === 0 ? a : s.text.delete(a, b)
    }
    const end = pasteAt(s, p, data)
    return { anchor: end, head: end }
  }, origin)
}

/** Read the flavours off a DOM clipboard event. */
export function fromDataTransfer(dt: DataTransfer | null): ClipData | null {
  if (!dt) return null
  const text = dt.getData('text/plain')
  const html = dt.getData('text/html') || undefined
  const marker = dt.getData(REDROB_HWP_MIME) || undefined
  if (!text && !html) return null
  return { text, html, marker }
}

export function toDataTransfer(dt: DataTransfer, data: ClipData): void {
  dt.setData('text/plain', data.text)
  if (data.html) dt.setData('text/html', data.html)
  if (data.marker) dt.setData(REDROB_HWP_MIME, data.marker)
}
