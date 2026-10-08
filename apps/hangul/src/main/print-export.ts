/**
 * Print, Save as PDF and Export as HTML for the owned Hangul editor (spec task
 * 2.6). The renderer sends the engine's own page renders (SVG, the same pixels
 * the editor paints), so a printout or PDF matches the screen; main lays them
 * out one per sheet at their paper size in a hidden, sandboxed window with
 * scripting off, then prints or writes the PDF. Export as HTML writes the
 * engine's HTML for the whole document.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface PrintPage {
  svg: string
  /** page size in CSS px at 96 dpi */
  width: number
  height: number
}

export const MAX_PRINT_PAGES = 3000
const MAX_PAGE_SVG = 40 * 1024 * 1024

/** Validated pages, or an error. Only SVG documents of sane size are accepted. */
export function checkPages(pages: unknown): PrintPage[] | string {
  if (!Array.isArray(pages) || !pages.length) return 'no pages'
  if (pages.length > MAX_PRINT_PAGES) return `at most ${MAX_PRINT_PAGES} pages`
  const out: PrintPage[] = []
  for (const p of pages as Array<Partial<PrintPage>>) {
    if (!p || typeof p.svg !== 'string' || p.svg.length > MAX_PAGE_SVG) return 'bad page'
    const head = p.svg.trimStart().slice(0, 200)
    if (!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'a page is not SVG'
    const width = Number(p.width)
    const height = Number(p.height)
    if (!(width > 10 && width < 20000 && height > 10 && height < 20000)) return 'bad page size'
    out.push({ svg: p.svg, width, height })
  }
  return out
}

/** to 0.1 mm: page sizes come in fractional px (A4 is 1122.52 px high) */
const mmOf = (px: number) => Math.round(((px * 25.4) / 96) * 10) / 10

/**
 * One HTML document, one page per sheet. Each distinct paper size gets a named
 * `@page` rule, so mixed sizes (A4 with an A3 landscape page) print as they are.
 * Pages are SVG images (`<img>`), so nothing in them runs.
 */
export function printableHtml(pages: PrintPage[]): string {
  const sizes = new Map<string, string>()
  const name = (p: PrintPage) => {
    const key = `${mmOf(p.width)}x${mmOf(p.height)}`
    if (!sizes.has(key)) sizes.set(key, `p${sizes.size}`)
    return sizes.get(key)!
  }
  const body = pages
    .map((p) => {
      const src = `data:image/svg+xml;base64,${Buffer.from(p.svg, 'utf8').toString('base64')}`
      return `<div class="sheet" style="page:${name(p)};width:${mmOf(p.width)}mm;height:${mmOf(p.height)}mm"><img src="${src}" alt=""></div>`
    })
    .join('\n')
  const rules = [...sizes].map(([key, n]) => {
    const [w, h] = key.split('x')
    return `@page ${n} { size: ${w}mm ${h}mm; margin: 0; }`
  })
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>${rules.join('\n')}
html, body { margin: 0; padding: 0; background: #fff; }
.sheet { break-after: page; overflow: hidden; }
.sheet:last-child { break-after: auto; }
.sheet img { display: block; width: 100%; height: 100%; }
</style></head><body>
${body}
</body></html>`
}

export interface PrintWindowLike {
  loadFile(path: string): Promise<void>
  destroy(): void
  webContents: {
    print(options: Record<string, unknown>, callback: (success: boolean, failureReason: string) => void): void
    printToPDF(options: Record<string, unknown>): Promise<Buffer>
  }
}

/** Load the pages into a fresh hidden window, run `use`, and clean up. */
export async function withPrintWindow<T>(makeWindow: () => PrintWindowLike, pages: PrintPage[], use: (w: PrintWindowLike) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'redrob-hangul-print-'))
  const file = join(dir, 'pages.html')
  await writeFile(file, printableHtml(pages), 'utf8')
  const win = makeWindow()
  try {
    await win.loadFile(file)
    return await use(win)
  } finally {
    win.destroy()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export function printPages(w: PrintWindowLike): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    w.webContents.print({ margins: { marginType: 'none' }, printBackground: true }, (success, failureReason) => {
      resolve({ ok: success, ...(failureReason && !/cancel/i.test(failureReason) ? { error: failureReason } : {}) })
    })
  })
}

export function pdfOfPages(w: PrintWindowLike): Promise<Buffer> {
  return w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
}

/** The engine's HTML, wrapped as a standalone document with the file's name as its title. */
export function standaloneHtml(fragment: string, title: string): string {
  if (/^\s*<!doctype html/i.test(fragment) || /^\s*<html[\s>]/i.test(fragment)) return fragment
  const esc = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><title>${esc}</title></head><body>\n${fragment}\n</body></html>\n`
}
