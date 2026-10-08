// .hwp and .hwpx attachments to text (spec task 3.7), through our rhwp fork
// (packages/hwp-core, WASM in Node). The engine reads both formats, so the
// text is what 한글 shows: body paragraphs in order, tables as tab-separated
// rows with every cell paragraph, then headers and footers once each.
import type { HwpCoreDocument, OutlineControl, OutlineParagraph } from '@genoffice/hwp-core'

let ready: Promise<typeof import('@genoffice/hwp-core/node')> | null = null

/** Lazy: the 9 MB engine only loads the first time someone attaches a Hangul file. */
function core(): Promise<typeof import('@genoffice/hwp-core/node')> {
  ready ??= import('@genoffice/hwp-core/node').then((m) => {
    m.initHwpCoreNode()
    return m
  })
  return ready
}

function tableText(doc: HwpCoreDocument, section: number, host: number, ctl: OutlineControl): string[] {
  const rows = new Map<number, Array<{ col: number; text: string }>>()
  for (const cell of ctl.cells ?? []) {
    const text = cell.paragraphs
      .map((_, k) => doc.raw.getTextInCell(section, host, ctl.controlIndex, cell.cellIndex, k, 0, doc.raw.getCellParagraphLength(section, host, ctl.controlIndex, cell.cellIndex, k)))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const list = rows.get(cell.row) ?? []
    list.push({ col: cell.col, text })
    rows.set(cell.row, list)
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, cells]) => cells.sort((a, b) => a.col - b.col).map((c) => c.text).join('\t'))
}

function headerFooterText(doc: HwpCoreDocument, section: number): string[] {
  const out: string[] = []
  for (const isHeader of [true, false]) {
    for (const applyTo of [0, 1, 2]) {
      const r = JSON.parse(doc.raw.getHeaderFooter(section, isHeader, applyTo)) as { exists?: boolean; text?: string }
      const text = r.exists ? (r.text ?? '').trim() : ''
      if (text) out.push(`[${isHeader ? '머리말' : '꼬리말'}] ${text}`)
    }
  }
  return out
}

export function hwpDocumentToText(doc: HwpCoreDocument): string {
  const lines: string[] = []
  for (const section of doc.outline().sections) {
    const extras = headerFooterText(doc, section.section)
    section.paragraphs.forEach((p: OutlineParagraph, i) => {
      const text = p.length ? doc.text(section.section, i) : ''
      if (text.trim()) lines.push(text)
      for (const ctl of p.controls ?? []) {
        if (ctl.kind === 'table' && ctl.cells) {
          lines.push(...tableText(doc, section.section, i, ctl))
        }
      }
    })
    lines.push(...extras)
  }
  return lines.join('\n')
}

/** Extract text from .hwp or .hwpx bytes. Encrypted documents fail with a clear message. */
export async function hwpToText(bytes: Uint8Array): Promise<string> {
  const m = await core()
  let doc: HwpCoreDocument
  try {
    doc = m.HwpCoreDocument.open(bytes)
  } catch (e) {
    if (e instanceof m.HwpPasswordError) throw new Error('This Hangul document is password-protected; open it in the Hangul editor instead')
    throw e
  }
  try {
    return hwpDocumentToText(doc)
  } finally {
    doc.dispose()
  }
}
