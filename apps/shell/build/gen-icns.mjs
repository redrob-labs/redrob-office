#!/usr/bin/env node
/**
 * Regenerate the macOS `.icns` app icon from the official Redrob SVG mark, on
 * any platform (no macOS `iconutil` required).
 *
 * Pipeline: render the brand SVG (`build/icon.svg`, the same source
 * `office/scripts/render-icons.mjs` produces) to PNGs at the standard icon
 * sizes with `sharp`, then pack them into a multi-resolution `.icns` with
 * `png2icns` (from the `icnsutils` package, `apt-get install -y icnsutils`).
 *
 * Usage:  node apps/shell/build/gen-icns.mjs <targetDir> [<targetDir> ...]
 * Each targetDir must contain `icon.svg`; the script writes `icon.icns` there.
 *
 * The `.icns` is deterministic for a given SVG + tool versions; the guard test
 * (apps/shell/tests/build-icons.test.ts) checks the result is a real Redrob
 * ICNS (valid magic, expected resolutions) and no longer the legacy mark.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// sharp lives in the office app's dependency set; resolve it from there so this
// script works from the repo root regardless of hoisting.
const require = createRequire(import.meta.url)
let sharp
try {
  sharp = require('sharp')
} catch {
  const officeRequire = createRequire(join(process.cwd(), 'office', 'package.json'))
  sharp = officeRequire('sharp')
}

// libicns/png2icns accepted square sizes -> icns element types.
const SIZES = [16, 32, 48, 128, 256, 512, 1024]

async function genForDir(dir) {
  const svgPath = join(dir, 'icon.svg')
  const svg = readFileSync(svgPath)
  const tmp = mkdtempSync(join(tmpdir(), 'redrob-icns-'))
  try {
    const pngs = []
    for (const size of SIZES) {
      const out = join(tmp, `${size}.png`)
      await sharp(svg, { density: 1024 }).resize(size, size).png().toFile(out)
      pngs.push(out)
    }
    const icns = join(dir, 'icon.icns')
    execFileSync('png2icns', [icns, ...pngs], { stdio: 'inherit' })
    console.log(`wrote ${icns}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.error('usage: node gen-icns.mjs <targetDir> [<targetDir> ...]')
  process.exit(1)
}
for (const dir of targets) await genForDir(dir)
