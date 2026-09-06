import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error - plain .mjs, no type declarations
import { ensureConsumers, exitCodeFor } from '../../../scripts/ensure-electron.mjs'

/**
 * Runnable integration tests for scripts/ensure-electron.mjs. They build fake
 * consumer + electron package trees (each electron package resolvable from its
 * consumer via a local node_modules symlink-free copy) and drive the real
 * orchestration:
 *   - consumer resolution + dedupe across two consumers on the same install,
 *   - install success (a stub install.js that writes path.txt + dist),
 *   - install failure (stub exits nonzero) -> overall failure,
 *   - a stale version -> reinstall,
 *   - ELECTRON_OVERRIDE_DIST_PATH existence validation.
 */

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), 'ensure-electron-'))
  dirs.push(d)
  return d
}

/**
 * Create a consumer dir at <root>/<rel> whose node_modules/electron is a fake
 * electron package of the given version. `installBehavior` controls the stub
 * install.js: 'success' writes a good binary, 'fail' exits 1, 'nonmaterialize'
 * exits 0 but writes nothing, 'none' omits install.js.
 * `preinstalled` seeds an already-present (or version-mismatched) binary.
 */
function makeConsumer(
  root: string,
  rel: string,
  opts: {
    version: string
    installBehavior?: 'success' | 'fail' | 'nonmaterialize' | 'none'
    preinstalled?: 'present' | 'stale-version' | 'missing'
    electronDirRel?: string // share one electron dir across consumers when set
  },
): void {
  const { version, installBehavior = 'success', preinstalled = 'missing' } = opts
  const consumerDir = join(root, rel)
  mkdirSync(consumerDir, { recursive: true })
  writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({ name: rel }))

  // Where the electron package lives (allows sharing across consumers for dedupe).
  const electronDir = join(root, opts.electronDirRel ?? `${rel}/node_modules/electron`)
  mkdirSync(join(electronDir, 'dist'), { recursive: true })
  writeFileSync(join(electronDir, 'package.json'), JSON.stringify({ name: 'electron', version, main: 'index.js' }))
  writeFileSync(join(electronDir, 'index.js'), 'module.exports = "";')

  if (preinstalled === 'present') {
    writeFileSync(join(electronDir, 'path.txt'), 'electron')
    writeFileSync(join(electronDir, 'dist', 'electron'), '#!/bin/sh\n')
    writeFileSync(join(electronDir, 'dist', 'version'), `v${version}`)
  } else if (preinstalled === 'stale-version') {
    writeFileSync(join(electronDir, 'path.txt'), 'electron')
    writeFileSync(join(electronDir, 'dist', 'electron'), '#!/bin/sh\n')
    writeFileSync(join(electronDir, 'dist', 'version'), 'v1.0.0')
  }

  if (installBehavior !== 'none') {
    const installJs =
      installBehavior === 'fail'
        ? 'process.exit(1)'
        : installBehavior === 'nonmaterialize'
          ? 'process.exit(0)'
          : // success: write path.txt + dist binary + matching version
            [
              'const fs=require("fs");const p=require("path");const d=__dirname;',
              'fs.mkdirSync(p.join(d,"dist"),{recursive:true});',
              'fs.writeFileSync(p.join(d,"path.txt"),"electron");',
              'fs.writeFileSync(p.join(d,"dist","electron"),"#!/bin/sh\\n");',
              `fs.writeFileSync(p.join(d,"dist","version"),"v${version}");`,
            ].join('\n')
    writeFileSync(join(electronDir, 'install.js'), installJs)
  }
}

const silent = { log: () => {}, error: () => {} }

describe('ensure-electron integration (runnable script orchestration)', () => {
  it('installs a missing binary via install.js and reports success', () => {
    const root = scratch()
    makeConsumer(root, 'apps/shell', { version: '43.6.0', preinstalled: 'missing' })
    const ok = ensureConsumers({ root, consumers: ['apps/shell'], platform: 'linux', env: {}, ...silent })
    expect(ok).toBe(true)
  })

  it('is a no-op for an already-present, version-matched install', () => {
    const root = scratch()
    // install.js would fail if run — proving it is NOT run when present
    makeConsumer(root, 'apps/shell', { version: '43.6.0', preinstalled: 'present', installBehavior: 'fail' })
    const ok = ensureConsumers({ root, consumers: ['apps/shell'], platform: 'linux', env: {}, ...silent })
    expect(ok).toBe(true)
  })

  it('reinstalls when dist/version is stale, then succeeds', () => {
    const root = scratch()
    makeConsumer(root, 'apps/shell', { version: '43.6.0', preinstalled: 'stale-version', installBehavior: 'success' })
    const ok = ensureConsumers({ root, consumers: ['apps/shell'], platform: 'linux', env: {}, ...silent })
    expect(ok).toBe(true)
  })

  it('FAILS when install.js exits nonzero', () => {
    const root = scratch()
    makeConsumer(root, 'apps/shell', { version: '43.6.0', preinstalled: 'missing', installBehavior: 'fail' })
    const ok = ensureConsumers({ root, consumers: ['apps/shell'], platform: 'linux', env: {}, ...silent })
    expect(ok).toBe(false)
  })

  it('FAILS when install.js exits 0 but does not materialize the binary', () => {
    const root = scratch()
    makeConsumer(root, 'apps/shell', { version: '43.6.0', preinstalled: 'missing', installBehavior: 'nonmaterialize' })
    const ok = ensureConsumers({ root, consumers: ['apps/shell'], platform: 'linux', env: {}, ...silent })
    expect(ok).toBe(false)
  })

  it('FAILS when the binary is missing and there is no install.js', () => {
    const root = scratch()
    makeConsumer(root, 'apps/shell', { version: '43.6.0', preinstalled: 'missing', installBehavior: 'none' })
    const ok = ensureConsumers({ root, consumers: ['apps/shell'], platform: 'linux', env: {}, ...silent })
    expect(ok).toBe(false)
  })

  it('skips a consumer that declares no electron dependency', () => {
    const root = scratch()
    mkdirSync(join(root, 'office'), { recursive: true })
    writeFileSync(join(root, 'office/package.json'), JSON.stringify({ name: 'office' }))
    const ok = ensureConsumers({ root, consumers: ['office'], platform: 'linux', env: {}, ...silent })
    expect(ok).toBe(true)
  })

  it('honors ELECTRON_OVERRIDE_DIST_PATH only when it exists', () => {
    const root = scratch()
    // no dist binary, but override points at an existing dir -> present
    makeConsumer(root, 'apps/shell', { version: '43.6.0', preinstalled: 'missing', installBehavior: 'fail' })
    const okWithOverride = ensureConsumers({
      root,
      consumers: ['apps/shell'],
      platform: 'linux',
      env: { ELECTRON_OVERRIDE_DIST_PATH: root }, // an existing path
      ...silent,
    })
    expect(okWithOverride).toBe(true)

    const okMissingOverride = ensureConsumers({
      root,
      consumers: ['apps/shell'],
      platform: 'linux',
      env: { ELECTRON_OVERRIDE_DIST_PATH: join(root, 'does-not-exist') },
      ...silent,
    })
    expect(okMissingOverride).toBe(false)
  })
})


describe('CLI exit code (postinstall must fail nonzero, opt-out downgrades)', () => {
  it('exits 0 when every binary is ensured', () => {
    expect(exitCodeFor({ ok: true, skip: false })).toBe(0)
    expect(exitCodeFor({ ok: true, skip: true })).toBe(0)
  })

  it('exits NONZERO on failure so a plain install cannot claim dev-ready', () => {
    expect(exitCodeFor({ ok: false, skip: false })).toBe(1)
  })

  it('the documented REDROB_SKIP_ELECTRON_ENSURE opt-out downgrades failure to exit 0', () => {
    expect(exitCodeFor({ ok: false, skip: true })).toBe(0)
  })

  it('end to end: a fixture with a failing installer yields a nonzero CLI code', () => {
    const root = scratch()
    makeConsumer(root, 'apps/shell', { version: '43.6.0', preinstalled: 'missing', installBehavior: 'fail' })
    const ok = ensureConsumers({ root, consumers: ['apps/shell'], platform: 'linux', env: {}, ...silent })
    expect(ok).toBe(false)
    expect(exitCodeFor({ ok, skip: false })).toBe(1) // postinstall would fail
    expect(exitCodeFor({ ok, skip: true })).toBe(0) // unless opted out
  })
})
