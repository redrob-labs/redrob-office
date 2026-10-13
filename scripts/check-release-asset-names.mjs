#!/usr/bin/env node
// Release asset names Redrob Launcher can read.
//
//   node scripts/check-release-asset-names.mjs            check the artifactName templates
//                                                         in apps/shell/electron-builder.cjs
//   node scripts/check-release-asset-names.mjs <dir>      also check every package file in
//                                                         <dir> (apps/shell/release after
//                                                         electron-builder, or a release's
//                                                         downloaded assets). The dir must
//                                                         also hold redrob-launcher.json,
//                                                         the launcher's release manifest.
//
// The launcher installs an asset only when its name is
//     <stem>-<version>-<os>-<arch>[-portable].<ext>
// (redrob-launcher crates/core/src/platform.rs, parse_asset_name + Platform::tokens).
// stem is this repository's name, version has no leading "v", the os-arch token is one
// the launcher looks for, and the extension is one it installs. electron-builder's own
// ${arch} spelling differs per target (amd64 / x64 / arm64), so the names are spelled
// out in the config and this script is what keeps them from drifting.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAUNCHER_MANIFEST_NAME, launcherManifestProblems } from './write-launcher-manifest.mjs'

const STEM = 'redrob-office'
const OS_ARCH = new Set([
  'linux-x86_64',
  'linux-aarch64',
  'macos-universal',
  'macos-aarch64',
  'macos-arm64',
  'macos-x86_64',
  'windows-x64',
  'windows-arm64',
  'windows-x86',
  'freebsd-x86_64',
])
// Installable by the launcher. `-portable.zip` is matched before `.zip` so a plain mac
// zip (the electron-updater payload) is not mistaken for a Windows portable archive.
const INSTALLABLE = ['-portable.zip', '.msi', '.dmg', '.AppImage', '.deb', '.rpm', '.flatpak', '.tar.gz']
// Published beside the installable ones, in the same grammar, but not installed by the
// launcher: the Windows installer (an exe installer never is) and the mac updater zip.
const COMPANIONS = ['-setup.exe', '.zip']
// Not packages: feed files, differential maps, checksums, the launcher manifest.
const SIDE_FILES = /^(latest(-mac|-linux)?\.yml|.*\.blockmap|.*\.sha256|redrob-launcher\.json)$/
// electron-builder's own notes, written into the output directory beside the packages.
// The desktop jobs check apps/shell/release as built (the Linux job stages into
// release-assets, which is why only they saw it): v0.10.0's macOS and Windows jobs
// failed on builder-debug.yml. Never uploaded, so never a name the launcher sees.
const BUILDER_FILES = /^builder-(debug\.yml|effective-config\.yaml)$/

const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

/** Parses one asset name the way the launcher does; null when it would not install it. */
export function parseAssetName(name) {
  for (const list of [INSTALLABLE, COMPANIONS]) {
    const suffix = list.find((s) => name.endsWith(s))
    if (!suffix) continue
    const base = name.slice(0, -suffix.length)
    if (!base.startsWith(`${STEM}-`)) return null
    const rest = base.slice(STEM.length + 1)
    // rest = <version>-<os>-<arch>; os and arch never contain '-', versions may
    const parts = rest.split('-')
    if (parts.length < 3) return null
    const arch = parts.pop()
    const os = parts.pop()
    const version = parts.join('-')
    if (!VERSION.test(version) || !OS_ARCH.has(`${os}-${arch}`)) return null
    return { stem: STEM, version, token: `${os}-${arch}`, suffix, installable: list === INSTALLABLE }
  }
  return null
}

const root = fileURLToPath(new URL('..', import.meta.url))
const problems = []

// 1. The templates. Expanded with a sample version and the ${arch} / ${ext} values
//    electron-builder substitutes for the targets the config declares.
const { createRequire } = await import('node:module')
const config = createRequire(join(root, 'apps/shell/package.json'))('./electron-builder.cjs')
const expand = (template, vars) => template.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? `\${${k}}`)
const sample = '0.0.0'
const expected = [
  // target, template, ${arch} as electron-builder spells it for that target, ext
  ['mac dmg', config.mac.artifactName, 'arm64', 'dmg', true],
  ['mac zip', config.mac.artifactName, 'arm64', 'zip', false],
  ['win nsis', config.nsis.artifactName, 'x64', 'exe', false],
  ['win zip', config.win.artifactName, 'x64', 'zip', true],
  ['linux AppImage', config.linux.artifactName, 'x86_64', 'AppImage', true],
  ['linux deb', config.deb.artifactName, 'amd64', 'deb', true],
  ['linux rpm', config.rpm.artifactName, 'x86_64', 'rpm', true],
]
const templateNames = []
for (const [target, template, arch, ext, mustInstall] of expected) {
  if (typeof template !== 'string') {
    problems.push(`${target}: no artifactName in electron-builder.cjs`)
    continue
  }
  const name = expand(template, { version: sample, arch, ext })
  templateNames.push([target, name])
  const parsed = parseAssetName(name)
  if (!parsed) problems.push(`${target}: "${name}" is not <${STEM}>-<version>-<os>-<arch>[-portable].<ext> with a launcher os-arch token`)
  else if (mustInstall && !parsed.installable) problems.push(`${target}: "${name}" is not a package the launcher installs`)
}
const winTargets = (config.win.target ?? []).map((t) => (typeof t === 'string' ? t : t.target))
if (!winTargets.includes('zip')) problems.push('win: no zip target -- the launcher cannot install an exe installer, it needs -portable.zip')

// 2. A directory of built or downloaded assets.
const dir = process.argv[2] ? resolve(process.argv[2]) : null
const seen = []
if (dir) {
  if (!existsSync(dir)) {
    console.error(`check-release-asset-names: ${dir} does not exist`)
    process.exit(2)
  }
  for (const name of readdirSync(dir).sort()) {
    if (statSync(join(dir, name)).isDirectory() || SIDE_FILES.test(name) || BUILDER_FILES.test(name)) continue
    seen.push(name)
    if (!parseAssetName(name)) problems.push(`${name}: not a name the launcher reads (dir ${dir})`)
  }
  if (seen.length === 0) problems.push(`${dir}: no package files found`)
  // The platform the dir holds must have at least one launcher-installable package.
  const installable = seen.filter((n) => parseAssetName(n)?.installable)
  if (seen.length && installable.length === 0) problems.push(`${dir}: no launcher-installable package among ${seen.join(', ')}`)
  // 3. The launcher's release manifest must travel with the packages: without it the
  //    launcher falls back to its built-in table and cannot tell this release reads
  //    the shared account file. Written by scripts/write-launcher-manifest.mjs.
  const manifestPath = join(dir, LAUNCHER_MANIFEST_NAME)
  if (!existsSync(manifestPath)) {
    problems.push(`${dir}: ${LAUNCHER_MANIFEST_NAME} is missing -- run node scripts/write-launcher-manifest.mjs ${dir} before the upload`)
  } else {
    for (const p of launcherManifestProblems(readFileSync(manifestPath, 'utf8'))) problems.push(`${dir}: ${p}`)
  }
}

if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`)
  process.exit(1)
}
for (const [target, name] of templateNames) console.log(`  ${target.padEnd(16)} ${name}`)
if (dir) for (const n of seen) console.log(`  ${dir}: ${n} ok`)
if (dir) console.log(`  ${dir}: ${LAUNCHER_MANIFEST_NAME} ok (${readFileSync(join(dir, LAUNCHER_MANIFEST_NAME), 'utf8').trimEnd()})`)
console.log('check-release-asset-names: ok')
