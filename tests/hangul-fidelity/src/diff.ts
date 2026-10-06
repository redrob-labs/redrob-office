// Pixel diffs between our renderings and a reference (spec R2.2).
import pixelmatch from 'pixelmatch'
import type { Bitmap } from './raster'

export interface DiffOptions {
  /**
   * pixelmatch colour threshold (0..1). 0.1 absorbs sub-perceptual colour
   * differences; anti-aliased pixels are excluded separately.
   */
  threshold?: number
  /** Pixels allowed to differ per page before the page fails. Ratified in task 0.9. */
  maxDiffPixels?: number
  /** Size tolerance in pixels, for rounding of page size at the reference dpi. */
  sizeTolerance?: number
}

export const DEFAULT_DIFF: Required<DiffOptions> = { threshold: 0.1, maxDiffPixels: 0, sizeTolerance: 1 }

export interface PageDiff {
  page: number
  width: number
  height: number
  diffPixels: number
  ratio: number
  pass: boolean
  /** Set when the pages could not be compared pixel for pixel. */
  problem?: 'size-mismatch' | 'missing-ours' | 'missing-reference'
  diff?: Bitmap
}

export interface DocumentDiff {
  pagesOurs: number
  pagesReference: number
  pages: PageDiff[]
  pass: boolean
}

/** Crop or pad (white) a bitmap to width x height so near-equal sizes compare. */
export function fit(bitmap: Bitmap, width: number, height: number): Bitmap {
  if (bitmap.width === width && bitmap.height === height) return bitmap
  const data = new Uint8Array(width * height * 4).fill(255)
  const w = Math.min(width, bitmap.width)
  const h = Math.min(height, bitmap.height)
  for (let y = 0; y < h; y++) {
    data.set(bitmap.data.subarray(y * bitmap.width * 4, y * bitmap.width * 4 + w * 4), y * width * 4)
  }
  return { width, height, data }
}

export function diffPage(ours: Bitmap, reference: Bitmap, page: number, opts: DiffOptions = {}): PageDiff {
  const o = { ...DEFAULT_DIFF, ...opts }
  const width = reference.width
  const height = reference.height
  if (Math.abs(ours.width - width) > o.sizeTolerance || Math.abs(ours.height - height) > o.sizeTolerance) {
    return { page, width, height, diffPixels: width * height, ratio: 1, pass: false, problem: 'size-mismatch' }
  }
  const a = fit(ours, width, height)
  const out = new Uint8Array(width * height * 4)
  const diffPixels = pixelmatch(a.data, reference.data, out, width, height, { threshold: o.threshold, includeAA: false })
  return {
    page,
    width,
    height,
    diffPixels,
    ratio: diffPixels / (width * height),
    pass: diffPixels <= o.maxDiffPixels,
    diff: { width, height, data: out },
  }
}

export function diffDocument(ours: Bitmap[], reference: Bitmap[], opts: DiffOptions = {}): DocumentDiff {
  const pages: PageDiff[] = []
  const n = Math.max(ours.length, reference.length)
  for (let i = 0; i < n; i++) {
    const a = ours[i]
    const b = reference[i]
    if (a && b) pages.push(diffPage(a, b, i, opts))
    else {
      const ref = b ?? a!
      pages.push({ page: i, width: ref.width, height: ref.height, diffPixels: ref.width * ref.height, ratio: 1, pass: false, problem: a ? 'missing-reference' : 'missing-ours' })
    }
  }
  return { pagesOurs: ours.length, pagesReference: reference.length, pages, pass: ours.length === reference.length && pages.every((p) => p.pass) }
}
