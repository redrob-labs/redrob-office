// Save fidelity (spec R1.4, R3.1): open, save unchanged in the same format,
// reopen, and compare what the engine would paint.
//
// The engine's page layer tree is the complete paint description of a page
// (every run, glyph position, line, image and clip), so equal trees mean equal
// pixels from our renderer. This runs in Node with no display. The 한글 2024
// half of R3.1 (does Hancom render the saved file like the original?) needs
// references of both files from the Windows runner; see hancom.ts.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { HwpCoreDocument, type HwpFormat } from '@genoffice/hwp-core/node'

export interface RoundTripPage {
  page: number
  equal: boolean
  /** First differing character offset in the layer-tree JSON, when unequal. */
  at?: number
  context?: string
}

export interface RoundTripResult {
  id: string
  format: HwpFormat
  pagesBefore: number
  pagesAfter: number
  bytesBefore: number
  bytesAfter: number
  sha256After: string
  pages: RoundTripPage[]
  pass: boolean
  error?: string
}

function firstDifference(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a.charCodeAt(i) !== b.charCodeAt(i)) return i
  return n
}

/** Round-trip bytes in memory; returns the saved bytes alongside the result. */
export function roundTripBytes(id: string, bytes: Uint8Array, format: HwpFormat, password?: string): { result: RoundTripResult; saved?: Uint8Array } {
  let before: HwpCoreDocument | undefined
  let after: HwpCoreDocument | undefined
  try {
    before = HwpCoreDocument.open(bytes, password)
    const saved = before.export(format, password)
    after = HwpCoreDocument.open(saved, password)
    const pagesBefore = before.pageCount()
    const pagesAfter = after.pageCount()
    const pages: RoundTripPage[] = []
    for (let p = 0; p < Math.max(pagesBefore, pagesAfter); p++) {
      if (p >= pagesBefore || p >= pagesAfter) {
        pages.push({ page: p, equal: false })
        continue
      }
      const a = before.raw.getPageLayerTree(p)
      const b = after.raw.getPageLayerTree(p)
      if (a === b) pages.push({ page: p, equal: true })
      else {
        const at = firstDifference(a, b)
        pages.push({ page: p, equal: false, at, context: `${a.slice(Math.max(0, at - 60), at + 60)}  ≠  ${b.slice(Math.max(0, at - 60), at + 60)}` })
      }
    }
    const result: RoundTripResult = {
      id,
      format,
      pagesBefore,
      pagesAfter,
      bytesBefore: bytes.length,
      bytesAfter: saved.length,
      sha256After: createHash('sha256').update(saved).digest('hex'),
      pages,
      pass: pagesBefore === pagesAfter && pages.every((p) => p.equal),
    }
    return { result, saved }
  } catch (e) {
    return {
      result: { id, format, pagesBefore: 0, pagesAfter: 0, bytesBefore: bytes.length, bytesAfter: 0, sha256After: '', pages: [], pass: false, error: e instanceof Error ? e.message : String(e) },
    }
  } finally {
    before?.dispose()
    after?.dispose()
  }
}

export function roundTripFile(id: string, path: string, format: HwpFormat, password?: string) {
  return roundTripBytes(id, new Uint8Array(readFileSync(path)), format, password)
}
