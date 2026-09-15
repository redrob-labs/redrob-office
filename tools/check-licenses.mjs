/**
 * Dependency license gate: every production dependency must
 * carry a license from the permissive allowlist, so a copyleft dependency
 * cannot slip into a release. This repo is a pnpm workspace, so the resolved
 * production set is read from `pnpm licenses list --prod --json` (which keys
 * each installed package by its SPDX license). The Rust sidecar equivalent is
 * cargo-deny (apps/sheets/native/xlsx-engine/deny.toml).
 */
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'Zlib',
  'Unlicense',
  'Python-2.0',
  'Unicode-3.0',
  'OFL-1.1',
])

/** Packages whose published package.json lacks a license field (or carries a
 * legacy non-SPDX string); the real SPDX license is verified manually against
 * the LICENSE file shipped in the package and recorded here. */
const EXCEPTIONS = {
  '@univerjs/telemetry': 'Apache-2.0',
  // substack package (James Halliday); the 2012 release shipped no license
  // field. Published on npm as MIT/X11, matching every other substack module.
  buffers: 'MIT',
  // ships a BSD-2-Clause LICENSE (Copyright 2013 Michael Williamson); its
  // package.json only carries the legacy "BSD" string, which pnpm passes
  // through verbatim. Verified 2-clause (no advertising/endorsement clause).
  duck: 'BSD-2-Clause',
}

/**
 * Packages approved by name regardless of SPDX, with a written rationale.
 * libvips ships under LGPL-3.0-or-later; sharp loads it as a separate,
 * dynamically-linked shared library packaged as its own @img/sharp-libvips-*
 * module (not statically linked into application code), so LGPL section 4's
 * relinking obligation is satisfied and the library remains user-replaceable.
 * sharp itself is Apache-2.0 and stays on the general allowlist; only the
 * prebuilt libvips binaries need this explicit, documented allowance. Every
 * platform variant is listed so the gate is deterministic across build hosts.
 */
const PACKAGE_LICENSE_OK = new Set([
  '@img/sharp-libvips-darwin-arm64',
  '@img/sharp-libvips-darwin-x64',
  '@img/sharp-libvips-linux-arm',
  '@img/sharp-libvips-linux-arm64',
  '@img/sharp-libvips-linux-ppc64',
  '@img/sharp-libvips-linux-s390x',
  '@img/sharp-libvips-linux-x64',
  '@img/sharp-libvips-linuxmusl-arm64',
  '@img/sharp-libvips-linuxmusl-x64',
  '@img/sharp-libvips-win32-arm64',
  '@img/sharp-libvips-win32-ia32',
  '@img/sharp-libvips-win32-x64',
])

/** Minimal SPDX expression check: OR passes if any branch is allowed,
 * AND requires every branch, WITH falls back to the base license. */
function isAllowed(expr) {
  let s = expr.trim()
  while (s.startsWith('(') && s.endsWith(')')) {
    const inner = s.slice(1, -1)
    let depth = 0
    let balanced = true
    for (const ch of inner) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      if (depth < 0) balanced = false
    }
    if (!balanced || depth !== 0) break
    s = inner.trim()
  }
  const splitTop = (sep) => {
    const parts = []
    let depth = 0
    let start = 0
    for (let i = 0; i <= s.length - sep.length; i++) {
      if (s[i] === '(') depth++
      else if (s[i] === ')') depth--
      else if (depth === 0 && s.startsWith(sep, i)) {
        parts.push(s.slice(start, i))
        start = i + sep.length
        i += sep.length - 1
      }
    }
    parts.push(s.slice(start))
    return parts
  }
  const orParts = splitTop(' OR ')
  if (orParts.length > 1) return orParts.some(isAllowed)
  const andParts = splitTop(' AND ')
  if (andParts.length > 1) return andParts.every(isAllowed)
  // legacy "A/B" dual-license shorthand
  const slashParts = s.includes('/') ? s.split('/') : [s]
  if (slashParts.length > 1) return slashParts.some(isAllowed)
  const withParts = s.split(' WITH ')
  return ALLOWED.has(withParts[0].trim())
}

/**
 * Ask pnpm for every production package grouped by SPDX license. The command
 * exits non-zero only on real failure; an empty tree prints `{}`. Workspace
 * packages (our own @redrob/* and @genoffice/* code) are linked, not
 * third-party, and pnpm omits them from this list.
 */
function pnpmProdLicenses() {
  const raw = execFileSync(
    process.env.npm_execpath ? process.execPath : 'pnpm',
    process.env.npm_execpath
      ? [process.env.npm_execpath, 'licenses', 'list', '--prod', '--json']
      : ['licenses', 'list', '--prod', '--json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  return JSON.parse(raw)
}

const byLicense = pnpmProdLicenses()
const violations = []

for (const [license, packages] of Object.entries(byLicense)) {
  for (const pkg of packages) {
    const name = pkg.name
    if (PACKAGE_LICENSE_OK.has(name)) continue
    // pnpm reports "Unknown" when a package publishes no license field. It
    // also passes through legacy non-SPDX strings (e.g. "BSD") verbatim. In
    // either case fall back to the manually-verified exception table.
    const reported = license && license !== 'Unknown' ? license : null
    const spdx = reported && isAllowed(reported) ? reported : (EXCEPTIONS[name] ?? reported)
    if (!spdx) {
      violations.push(`${name}: no license field (add to EXCEPTIONS after verifying)`)
    } else if (!isAllowed(spdx)) {
      violations.push(`${name}: ${spdx}`)
    }
  }
}

if (violations.length > 0) {
  console.error('Disallowed or unknown licenses in production dependencies:\n')
  for (const v of violations) console.error(`  ${v}`)
  console.error('\nAllowlist lives in tools/check-licenses.mjs.')
  process.exit(1)
}

console.log('All production npm dependency licenses are within the allowlist.')
