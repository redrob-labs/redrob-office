#!/usr/bin/env node
// The release manifest Redrob Launcher reads from every GitHub Release.
//
//   node scripts/write-launcher-manifest.mjs <release-dir>
//
// Writes <release-dir>/redrob-launcher.json, the one asset that tells the launcher
// what a release of this app can do (redrob-launcher docs/release-manifest.md):
//
//   { "schema": 1, "sharedAccount": true }
//
// `sharedAccount: true` says this release reads the launcher's shared account file,
// so signing in to the launcher is all a person needs. It became true when Office
// attached to the shared Redrob Code daemon (#154 / #158 on develop). The file is
// written in every release job right before the asset-name check, which refuses a
// release directory without it (scripts/check-release-asset-names.mjs).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LAUNCHER_MANIFEST_NAME = 'redrob-launcher.json'

/** Exactly the bytes the contract shows, newline-terminated. */
export const LAUNCHER_MANIFEST = '{ "schema": 1, "sharedAccount": true }\n'

/** Writes the manifest into `dir` and returns its path. */
export function writeLauncherManifest(dir) {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, LAUNCHER_MANIFEST_NAME)
  writeFileSync(path, LAUNCHER_MANIFEST)
  return path
}

/** Validates manifest text; returns the problems found (empty when it is the contract). */
export function launcherManifestProblems(text) {
  const problems = []
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return [`${LAUNCHER_MANIFEST_NAME}: not valid JSON (${err.message})`]
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return [`${LAUNCHER_MANIFEST_NAME}: must be a JSON object`]
  }
  if (parsed.schema !== 1) problems.push(`${LAUNCHER_MANIFEST_NAME}: "schema" must be 1, got ${JSON.stringify(parsed.schema)}`)
  if (parsed.sharedAccount !== true) {
    problems.push(`${LAUNCHER_MANIFEST_NAME}: "sharedAccount" must be true (develop reads the shared account file), got ${JSON.stringify(parsed.sharedAccount)}`)
  }
  if (!text.endsWith('\n')) problems.push(`${LAUNCHER_MANIFEST_NAME}: must end with a newline`)
  return problems
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('usage: node scripts/write-launcher-manifest.mjs <release-dir>')
    process.exit(2)
  }
  const path = writeLauncherManifest(resolve(dir))
  console.log(`wrote ${path}: ${LAUNCHER_MANIFEST.trimEnd()}`)
}
