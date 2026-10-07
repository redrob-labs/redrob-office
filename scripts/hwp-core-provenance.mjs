#!/usr/bin/env node
// Provenance for the Hangul core (packages/hwp-core).
//
//   --write   record the checksums of the built wasm/ and of the engine source
//   --check   fail when the shipped files or the source drift from the record
//
// The record pins where the source came from (upstream tag and commit) and
// which toolchain built it, so anyone can rebuild with scripts/build-hwp-core.sh
// and get the same bytes. CI's `hwp-core reproducible` job does exactly that.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const recordPath = join(root, 'packages/hwp-core/provenance.json')
const wasmDir = join(root, 'packages/hwp-core/wasm')
const engineDir = join(root, 'engines/rhwp')

const SHIPPED = ['rhwp.js', 'rhwp.d.ts', 'rhwp_bg.wasm', 'rhwp_bg.wasm.d.ts']

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name === 'target' || name === 'pkg') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** One digest over every engine source file (path + content), order-stable. */
function sourceDigest() {
  const h = createHash('sha256')
  for (const file of walk(engineDir)) {
    h.update(relative(engineDir, file).split('\\').join('/'))
    h.update('\0')
    h.update(readFileSync(file))
    h.update('\0')
  }
  return h.digest('hex')
}

function current() {
  const files = {}
  for (const f of SHIPPED) files[f] = sha256(join(wasmDir, f))
  return { sourceSha256: sourceDigest(), files }
}

const mode = process.argv[2]
if (mode === '--write') {
  const prior = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : {}
  const now = current()
  const record = {
    ...prior,
    engine: prior.engine ?? 'rhwp',
    sourceSha256: now.sourceSha256,
    artifacts: now.files,
  }
  writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n')
  console.log(`hwp-core provenance written: source ${now.sourceSha256.slice(0, 12)}…`)
} else if (mode === '--check') {
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  const now = current()
  const problems = []
  if (record.sourceSha256 !== now.sourceSha256) {
    problems.push(`engines/rhwp source changed (recorded ${record.sourceSha256.slice(0, 12)}…, now ${now.sourceSha256.slice(0, 12)}…). Rebuild with \`pnpm --filter @genoffice/hwp-core build:wasm\`.`)
  }
  for (const f of SHIPPED) {
    if (record.artifacts?.[f] !== now.files[f]) problems.push(`packages/hwp-core/wasm/${f} does not match provenance.json`)
  }
  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`)
    process.exit(1)
  }
  console.log('hwp-core provenance ok')
} else {
  console.error('usage: hwp-core-provenance.mjs --write | --check')
  process.exit(2)
}
