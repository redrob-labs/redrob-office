// 한글 2024 references: drive Hancom through reference.ps1, then rasterise its
// PDFs with PDFium at the comparison dpi. Windows runner only.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rasterizePdf, writePng } from './raster'

const here = dirname(fileURLToPath(import.meta.url))

export interface ReferenceItem {
  id: string
  file: string
  outDir: string
}

export interface HancomResult {
  id: string
  opened: boolean
  saved: boolean
  hancomVersion: string
  error: string | null
  pages?: number
}

export function hancomAvailable(): boolean {
  return process.platform === 'win32'
}

/** Parse the JSON lines reference.ps1 prints (one per item). */
export function parseHancomOutput(stdout: string): HancomResult[] {
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as HancomResult)
}

/**
 * Produce reference PNGs (outDir/page-N.png) and reference.json for each
 * item. References are cached: an item whose reference.json records the same
 * Hancom build is skipped unless `force` is set.
 */
export async function generateReferences(items: ReferenceItem[], dpi: number, workDir: string, force = false): Promise<HancomResult[]> {
  if (!hancomAvailable()) throw new Error('한글 2024 references can only be generated on the Windows runner')
  mkdirSync(workDir, { recursive: true })
  const todo = items.filter((i) => force || !existsSync(join(i.outDir, 'reference.json')))
  const job = { items: todo.map((i) => ({ id: i.id, file: resolve(i.file), pdf: resolve(i.outDir, 'hancom.pdf') })) }
  const jobPath = join(workDir, 'hancom-job.json')
  writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf8')
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'hancom/reference.ps1'), '-Job', jobPath], {
    encoding: 'utf8',
    timeout: 60 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) throw new Error(`reference.ps1 failed (exit ${r.status}): ${r.stderr}`)
  const results = parseHancomOutput(r.stdout)
  for (const res of results) {
    const item = todo.find((i) => i.id === res.id)!
    if (res.saved) {
      const pages = await rasterizePdf(new Uint8Array(readFileSync(join(item.outDir, 'hancom.pdf'))), dpi)
      pages.forEach((bmp, p) => writePng(join(item.outDir, `page-${p}.png`), bmp))
      res.pages = pages.length
    }
    writeFileSync(join(item.outDir, 'reference.json'), JSON.stringify({ ...res, dpi }, null, 2))
  }
  return results
}
