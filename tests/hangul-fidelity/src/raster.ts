// Bitmaps: PNG in and out, and PDF → PNG through PDFium (for 한글 2024's PDFs).
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { PNG } from 'pngjs'

export interface Bitmap {
  width: number
  height: number
  /** Tightly packed RGBA. */
  data: Uint8Array
}

export function readPng(path: string): Bitmap {
  const png = PNG.sync.read(readFileSync(path))
  return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength) }
}

export function encodePng(bitmap: Bitmap): Buffer {
  const png = new PNG({ width: bitmap.width, height: bitmap.height })
  png.data = Buffer.from(bitmap.data.buffer, bitmap.data.byteOffset, bitmap.data.byteLength)
  return PNG.sync.write(png)
}

export function writePng(path: string, bitmap: Bitmap): void {
  writeFileSync(path, encodePng(bitmap))
}

// ── PDFium ──────────────────────────────────────────────────────────────

interface Pdfium {
  HEAPU8: Uint8Array
  _malloc(n: number): number
  _free(p: number): void
  _PDFiumExt_Init(): void
  _FPDF_LoadMemDocument(ptr: number, size: number, password: number): number
  _FPDF_CloseDocument(doc: number): void
  _FPDF_GetPageCount(doc: number): number
  _FPDF_LoadPage(doc: number, i: number): number
  _FPDF_ClosePage(page: number): void
  _FPDF_GetPageWidthF(page: number): number
  _FPDF_GetPageHeightF(page: number): number
  _FPDFBitmap_Create(w: number, h: number, alpha: number): number
  _FPDFBitmap_FillRect(b: number, x: number, y: number, w: number, h: number, color: number): void
  _FPDFBitmap_GetBuffer(b: number): number
  _FPDFBitmap_GetStride(b: number): number
  _FPDFBitmap_Destroy(b: number): void
  _FPDF_RenderPageBitmap(b: number, page: number, x: number, y: number, w: number, h: number, rotate: number, flags: number): void
}

let pdfium: Promise<Pdfium> | null = null

function loadPdfium(): Promise<Pdfium> {
  pdfium ??= (async () => {
    const require = createRequire(import.meta.url)
    const raw = readFileSync(require.resolve('@embedpdf/pdfium/pdfium.wasm'))
    const wasmBinary = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    const { init } = (await import('@embedpdf/pdfium')) as unknown as { init(o: object): Promise<object> }
    const wrapped = (await init({ wasmBinary })) as { pdfium?: unknown }
    const m = (wrapped.pdfium ?? wrapped) as Pdfium
    m._PDFiumExt_Init()
    return m
  })()
  return pdfium
}

// FPDF_ANNOT (draw annotations) | FPDF_LCD_TEXT off | FPDF_PRINTING off: screen-like output.
const RENDER_FLAGS = 0x01

/**
 * Rasterise every page of a PDF at `dpi`. PDF points are 1/72 in, so a page
 * of w pt renders w * dpi / 72 pixels wide.
 */
export async function rasterizePdf(bytes: Uint8Array, dpi: number): Promise<Bitmap[]> {
  const m = await loadPdfium()
  const ptr = m._malloc(bytes.length)
  m.HEAPU8.set(bytes, ptr)
  const doc = m._FPDF_LoadMemDocument(ptr, bytes.length, 0)
  if (!doc) {
    m._free(ptr)
    throw new Error('PDFium could not open the PDF')
  }
  const pages: Bitmap[] = []
  try {
    const count = m._FPDF_GetPageCount(doc)
    for (let i = 0; i < count; i++) {
      const page = m._FPDF_LoadPage(doc, i)
      try {
        const width = Math.round((m._FPDF_GetPageWidthF(page) * dpi) / 72)
        const height = Math.round((m._FPDF_GetPageHeightF(page) * dpi) / 72)
        const bmp = m._FPDFBitmap_Create(width, height, 0)
        try {
          m._FPDFBitmap_FillRect(bmp, 0, 0, width, height, 0xffffffff)
          m._FPDF_RenderPageBitmap(bmp, page, 0, 0, width, height, 0, RENDER_FLAGS)
          const stride = m._FPDFBitmap_GetStride(bmp)
          const buf = m._FPDFBitmap_GetBuffer(bmp)
          const data = new Uint8Array(width * height * 4)
          const heap = m.HEAPU8
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const s = buf + y * stride + x * 4 // BGRx
              const d = (y * width + x) * 4
              data[d] = heap[s + 2]!
              data[d + 1] = heap[s + 1]!
              data[d + 2] = heap[s]!
              data[d + 3] = 255
            }
          }
          pages.push({ width, height, data })
        } finally {
          m._FPDFBitmap_Destroy(bmp)
        }
      } finally {
        m._FPDF_ClosePage(page)
      }
    }
  } finally {
    m._FPDF_CloseDocument(doc)
    m._free(ptr)
  }
  return pages
}
