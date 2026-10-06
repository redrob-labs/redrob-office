// Node side of the Electron renderer: run a job and read the PNGs back.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPng, type Bitmap } from './raster'

const here = dirname(fileURLToPath(import.meta.url))

export interface RenderItem {
  id: string
  file: string
  password?: string
  outDir: string
}

export interface RenderMeta {
  id: string
  pages: number
  scale: number
  fontsUsed: string[]
  fontSubstitutions: unknown[]
  ms: number
}

function electronBinary(): string {
  const require = createRequire(import.meta.url)
  // In Node, `require('electron')` returns the path of the Electron binary.
  return require('electron') as unknown as string
}

/**
 * Render every item with Electron. Needs a display: run under `xvfb-run` on
 * Linux CI. Throws when Electron exits non-zero (any item failed).
 */
export function renderWithElectron(items: RenderItem[], dpi: number, workDir: string): void {
  mkdirSync(workDir, { recursive: true })
  const jobPath = join(workDir, 'render-job.json')
  writeFileSync(jobPath, JSON.stringify({ dpi, items }, null, 2))
  const r = spawnSync(electronBinary(), ['--no-sandbox', '--disable-gpu', join(here, 'electron/main.mjs'), jobPath], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1', ELECTRON_ENABLE_LOGGING: '0' },
    timeout: 30 * 60 * 1000,
  })
  if (r.status !== 0) throw new Error(`Electron render failed (exit ${r.status ?? r.signal})`)
}

export function readRendered(outDir: string): { meta: RenderMeta; pages: Bitmap[] } {
  const metaPath = join(outDir, 'render.json')
  if (!existsSync(metaPath)) throw new Error(`no render.json in ${outDir}`)
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as RenderMeta
  const pages: Bitmap[] = []
  for (let p = 0; p < meta.pages; p++) pages.push(readPng(join(outDir, `page-${p}.png`)))
  return { meta, pages }
}

export function listPngs(dir: string): string[] {
  return readdirSync(dir).filter((f) => /^page-\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
}
