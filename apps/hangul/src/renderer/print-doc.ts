/**
 * The print document for a Hangul file: every page as rhwp renders it (SVG),
 * one page per printed sheet, each sheet the page's own size. The same shape
 * as rhwp-studio's own print surface: named @page rules per page, and each
 * page's SVG ids made unique so one page's clip paths and gradients never
 * resolve to another's.
 *
 * The document is served from the studio's loopback origin (see
 * studio-serve.ts), so font and image URLs inside the SVGs resolve exactly as
 * they do in the editor.
 */

const CSS_PX_PER_MM = 96 / 25.4

export interface PrintPage {
  svg: string
  widthMm: number
  heightMm: number
}

/** A length attribute in CSS px (unitless, px, mm, cm, in, pt), or null. */
function toPx(value: string | null): number | null {
  if (!value) return null
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(px|mm|cm|in|pt)?\s*$/i.exec(value)
  if (!m) return null
  const n = Number(m[1])
  switch ((m[2] ?? 'px').toLowerCase()) {
    case 'mm':
      return n * CSS_PX_PER_MM
    case 'cm':
      return n * CSS_PX_PER_MM * 10
    case 'in':
      return n * 96
    case 'pt':
      return (n * 96) / 72
    default:
      return n
  }
}

/** to a tenth of a millimetre: rhwp renders page sizes from HWP units, so A4 arrives as 296.995 mm */
const round1 = (n: number) => Math.round(n * 10) / 10

/** A page's size from its SVG root (width/height, else the viewBox), in mm. A4 when neither says. */
export function pageSizeOf(svgRoot: Element): { widthMm: number; heightMm: number } {
  let w = toPx(svgRoot.getAttribute('width'))
  let h = toPx(svgRoot.getAttribute('height'))
  if (w === null || h === null) {
    const vb = (svgRoot.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
    if (vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0) {
      w ??= vb[2]!
      h ??= vb[3]!
    }
  }
  if (!w || !h) return { widthMm: 210, heightMm: 297 }
  return { widthMm: round1(w / CSS_PX_PER_MM), heightMm: round1(h / CSS_PX_PER_MM) }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Prefixes every id in the tree and rewrites url(#id) and #id references to match. */
export function scopeSvgIds(root: Element, prefix: string): void {
  const withIds = [...(root.hasAttribute('id') ? [root] : []), ...Array.from(root.querySelectorAll('[id]'))]
  const map = new Map<string, string>()
  for (const el of withIds) {
    const id = el.getAttribute('id')
    if (id) map.set(id, `${prefix}-${id}`)
  }
  if (map.size === 0) return
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'id') {
        const next = map.get(attr.value)
        if (next) el.setAttribute('id', next)
        continue
      }
      let value = attr.value
      for (const [from, to] of map) {
        value = value.replace(new RegExp(`url\\((['"]?)#${escapeRe(from)}\\1\\)`, 'g'), `url(#${to})`)
        if (value === `#${from}`) value = `#${to}`
      }
      if (value !== attr.value) el.setAttribute(attr.name, value)
    }
  }
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''))

/**
 * The whole print document. Throws when a page's SVG does not parse, so a
 * broken page is never printed as a blank sheet.
 */
export function buildPrintHtml(svgs: readonly string[], title: string): string {
  const parser = new DOMParser()
  const serializer = new XMLSerializer()
  const pages: Array<PrintPage & { name: string }> = svgs.map((svg, i) => {
    const doc = parser.parseFromString(svg, 'image/svg+xml')
    if (doc.querySelector('parsererror') || doc.documentElement.nodeName.toLowerCase() !== 'svg') {
      throw new Error(`Page ${i + 1} could not be prepared for printing.`)
    }
    const name = `rhwp-print-page-${i + 1}`
    scopeSvgIds(doc.documentElement, name)
    return { svg: serializer.serializeToString(doc.documentElement), ...pageSizeOf(doc.documentElement), name }
  })
  const css = [
    ...pages.map((p) => `@page ${p.name} { size: ${fmt(p.widthMm)}mm ${fmt(p.heightMm)}mm; margin: 0; }`),
    '* { margin: 0; padding: 0; }',
    'html, body { background: #fff; }',
    '.page { break-after: page; page-break-after: always; overflow: hidden; }',
    '.page:last-child { break-after: auto; page-break-after: auto; }',
    '.page > svg { display: block; width: 100%; height: 100%; }',
    ...pages.map((p) => `.${p.name} { page: ${p.name}; width: ${fmt(p.widthMm)}mm; height: ${fmt(p.heightMm)}mm; }`),
  ].join('\n')
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return [
    '<!doctype html>',
    '<html lang="ko"><head><meta charset="utf-8">',
    `<title>${esc(title)}</title>`,
    `<style>${css}</style>`,
    '</head><body>',
    ...pages.map((p) => `<div class="page ${p.name}">${p.svg}</div>`),
    '</body></html>',
  ].join('\n')
}

/** the part of the rhwp editor printing needs */
export interface PageSource {
  pageCount(): Promise<number>
  /** 0-based page */
  getPageSvg(page?: number): Promise<string>
}

/** Every page of the open document as one print document. Fails on an empty document. */
export async function printDocumentOf(editor: PageSource, title: string): Promise<string> {
  const count = await editor.pageCount()
  if (!Number.isInteger(count) || count < 1) throw new Error('The document has no pages to print.')
  const svgs: string[] = []
  for (let i = 0; i < count; i++) svgs.push(await editor.getPageSvg(i))
  return buildPrintHtml(svgs, title)
}
