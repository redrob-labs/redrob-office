/**
 * @vitest-environment jsdom
 *
 * The Hangul print document: one sheet per rhwp page at that page's size,
 * page SVG ids kept apart, and a page that does not parse never printed blank.
 */
import { describe, expect, it } from 'vitest'
import { buildPrintHtml, pageSizeOf, printDocumentOf, scopeSvgIds } from '../src/renderer/print-doc'

const A4 = '<svg xmlns="http://www.w3.org/2000/svg" width="793.7" height="1122.5"><defs><clipPath id="c1"><rect width="10" height="10"/></clipPath></defs><g clip-path="url(#c1)"><text>가</text></g></svg>'
const LANDSCAPE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1122.5 793.7"><defs><clipPath id="c1"><rect/></clipPath></defs><use href="#c1"/></svg>'

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement

describe('Hangul print document', () => {
  it('reads each page size from the SVG, in mm, falling back to the viewBox and then A4', () => {
    expect(pageSizeOf(parse(A4))).toEqual({ widthMm: 210, heightMm: 297 })
    expect(pageSizeOf(parse(LANDSCAPE))).toEqual({ widthMm: 297, heightMm: 210 })
    expect(pageSizeOf(parse('<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="99mm"/>'))).toEqual({ widthMm: 210, heightMm: 99 })
    expect(pageSizeOf(parse('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toEqual({ widthMm: 210, heightMm: 297 })
  })

  it('gives every page its own @page size and keeps ids from colliding across pages', () => {
    const html = buildPrintHtml([A4, LANDSCAPE], 'Plan <draft>.hwpx')
    expect(html).toContain('@page rhwp-print-page-1 { size: 210mm 297mm; margin: 0; }')
    expect(html).toContain('@page rhwp-print-page-2 { size: 297mm 210mm; margin: 0; }')
    expect(html).toContain('<title>Plan &lt;draft&gt;.hwpx</title>')
    expect(html).toContain('id="rhwp-print-page-1-c1"')
    expect(html).toContain('url(#rhwp-print-page-1-c1)')
    expect(html).toContain('id="rhwp-print-page-2-c1"')
    expect(html).toContain('href="#rhwp-print-page-2-c1"')
    expect(html).not.toContain('id="c1"')
  })

  it('refuses a page that does not parse instead of printing it blank', () => {
    expect(() => buildPrintHtml([A4, '<svg><unclosed'], 'x')).toThrow(/Page 2/)
    expect(() => buildPrintHtml(['<html/>'], 'x')).toThrow(/Page 1/)
  })

  it('scopes ids without touching unrelated references', () => {
    const root = parse('<svg xmlns="http://www.w3.org/2000/svg"><linearGradient id="g"/><rect fill="url(#g)" stroke="url(#other)"/></svg>')
    scopeSvgIds(root, 'p3')
    const rect = root.querySelector('rect')!
    expect(rect.getAttribute('fill')).toBe('url(#p3-g)')
    expect(rect.getAttribute('stroke')).toBe('url(#other)')
  })

  it('asks rhwp for every page, 0-based, and refuses an empty document', async () => {
    const asked: number[] = []
    const editor = {
      pageCount: async () => 2,
      getPageSvg: async (p?: number) => {
        asked.push(p ?? -1)
        return A4
      },
    }
    const html = await printDocumentOf(editor, 'Plan.hwp')
    expect(asked).toEqual([0, 1])
    expect(html.match(/class="page /g)).toHaveLength(2)
    await expect(printDocumentOf({ pageCount: async () => 0, getPageSvg: async () => A4 }, 'x')).rejects.toThrow(/no pages/)
  })
})
