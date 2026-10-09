#!/usr/bin/env node
// Every editor's preload runs sandboxed, where require() can load only electron
// and a few Node builtins. A workspace package left external in a preload
// bundle throws "module not found" at load and the editor opens to a blank
// page, which typecheck, unit tests and the build itself all miss. Run after
// `pnpm build`: fails on any other require in apps/*/out/preload.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// https://www.electronjs.org/docs/latest/tutorial/sandbox#preload-scripts
const ALLOWED = new Set(['electron', 'events', 'timers', 'url', 'node:events', 'node:timers', 'node:url'])

const root = fileURLToPath(new URL('..', import.meta.url))
const apps = join(root, 'apps')
const problems = []
let checked = 0

for (const app of readdirSync(apps)) {
  const dir = join(apps, app, 'out', 'preload')
  if (!existsSync(dir)) continue
  for (const file of readdirSync(dir).filter((f) => /\.(c|m)?js$/.test(f))) {
    checked++
    const src = readFileSync(join(dir, file), 'utf8')
    const found = new Set()
    for (const m of src.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)|^\s*import\s[^'"]*["']([^"']+)["']/gm)) {
      const id = m[1] ?? m[2]
      if (!ALLOWED.has(id) && !id.startsWith('.')) found.add(id)
    }
    for (const id of found) problems.push(`apps/${app}/out/preload/${file}: requires "${id}"`)
  }
}

if (checked === 0) {
  console.error('check-preload-bundles: no built preloads under apps/*/out/preload; run pnpm build first')
  process.exit(1)
}
if (problems.length) {
  console.error('check-preload-bundles: a sandboxed preload cannot load these, so the editor would open blank.')
  console.error('Bundle them by adding the package to the preload externalizeDepsPlugin exclude list:')
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`check-preload-bundles: ${checked} preload bundles require only sandbox-safe modules`)
