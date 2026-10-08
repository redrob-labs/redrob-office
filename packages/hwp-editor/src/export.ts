// Whole-document exports over the engine (spec task 2.6): the page renders a
// printout or PDF is made from, and the document as HTML.
import type { Session } from './session'

export interface PageRender {
  svg: string
  /** CSS px at 96 dpi */
  width: number
  height: number
}

/** Every page as the engine paints it, with its paper size. */
export function pageRenders(s: Session): PageRender[] {
  s.settle()
  const out: PageRender[] = []
  for (let i = 0; i < s.doc.pageCount(); i++) {
    const info = s.doc.pageInfo(i)
    out.push({ svg: s.doc.pageSvg(i), width: info.width, height: info.height })
  }
  return out
}

/** The document body as HTML: each section's engine HTML, joined. */
export function documentHtml(s: Session): string {
  const raw = s.doc.raw
  const parts: string[] = []
  for (let sec = 0; sec < s.doc.sectionCount(); sec++) {
    const last = s.doc.paragraphCount(sec) - 1
    if (last < 0) continue
    const html = raw.exportSelectionHtml(sec, 0, 0, last, s.doc.paragraphLength(sec, last))
    const m = /<!--StartFragment-->([\s\S]*)<!--EndFragment-->/.exec(html)
    parts.push((m ? m[1]! : html.replace(/^[\s\S]*?<body[^>]*>|<\/body>[\s\S]*$/gi, '')).trim())
  }
  return parts.join('\n')
}
