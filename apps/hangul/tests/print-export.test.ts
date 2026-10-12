import { describe, expect, it } from 'vitest'
import { checkPages, printableHtml, standaloneHtml, wordHtml } from '../src/main/print-export'

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><text>가</text></svg>'

describe('print and export (main)', () => {
  it('accepts only SVG pages of sane size', () => {
    expect(checkPages([{ svg, width: 794, height: 1123 }])).toHaveLength(1)
    expect(checkPages([])).toBe('no pages')
    expect(checkPages([{ svg: '<script>alert(1)</script>', width: 794, height: 1123 }])).toBe('a page is not SVG')
    expect(checkPages([{ svg, width: 0, height: 1123 }])).toBe('bad page size')
    expect(checkPages('nope')).toBe('no pages')
  })

  it('lays pages out one per sheet with a named @page per paper size, scripts off', () => {
    const html = printableHtml([
      { svg, width: 793.7, height: 1122.5 },
      { svg, width: 1122.5, height: 793.7 },
      { svg, width: 793.7, height: 1122.5 },
    ])
    expect(html).toContain('@page p0 { size: 210mm 297mm; margin: 0; }')
    expect(html).toContain('@page p1 { size: 297mm 210mm; margin: 0; }')
    expect((html.match(/class="sheet"/g) ?? []).length).toBe(3)
    expect(html).toContain("default-src 'none'")
    expect(html).not.toContain('<script')
    expect(html).toContain('data:image/svg+xml;base64,')
  })

  it('wraps a fragment as a standalone, titled document', () => {
    const out = standaloneHtml('<p>본문</p>', '계약서 <초안>')
    expect(out).toMatch(/^<!doctype html>/)
    expect(out).toContain('<title>계약서 &lt;초안&gt;</title>')
    expect(standaloneHtml('<html><body>x</body></html>', 't')).toBe('<html><body>x</body></html>')
  })

  it('a .doc export is the HTML-based Word document, with the body of the engine HTML', () => {
    const out = wordHtml('<html><body><!--StartFragment--><p>제1조 목적</p><!--EndFragment--></body></html>', '계약서 <초안>')
    expect(out).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"')
    expect(out).toContain('<meta name="ProgId" content="Word.Document">')
    expect(out).toContain('<title>계약서 &lt;초안&gt;</title>')
    expect(out).toContain('<p>제1조 목적</p>')
    expect(out.match(/<body/g)).toHaveLength(1)
  })
})
