import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/**
 * Static branding audit for Redrob Office.
 *
 * Fails if a USER-VISIBLE "GenOffice" or "Genspark" literal appears in the
 * source tree. "User-visible" means: JSX text nodes, the brand-bearing element
 * attributes (aria-label / title / placeholder / alt), HTML <title>, and the
 * VALUES of i18n string tables. Internal identifiers (package names, font
 * families, serialized keys, ported cloud endpoints, env vars, test fixtures)
 * are allowlisted per docs/branding-cleanup.md and must NOT trip this test.
 *
 * The rules live here in code so a regression (someone reintroducing a
 * user-facing GenOffice/Genspark string) fails CI, while the documented
 * exceptions stay green.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const SCAN_ROOTS = ['apps', 'packages', 'office/src']

const SKIP_DIR = new Set([
  'node_modules',
  'out',
  'dist',
  'build', // compiled/binary icon + packaging assets, not source copy
  '.turbo',
  '.git',
  'coverage',
])

/** File is source we scan for copy. */
function isScannable(path: string): boolean {
  if (/\.(test|spec)\.[cm]?tsx?$/.test(path)) return false // test files allowlisted
  return /\.(tsx?|html)$/.test(path)
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    if (name === 'tests' || name === '__tests__') continue // test support/fixtures allowlisted
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (isScannable(full)) out.push(full)
  }
}

const BRAND = /(GenOffice|Genspark)/

/**
 * Given a source line, return the user-visible substrings that still name a
 * legacy brand, or [] when the line is clean or only carries an allowlisted
 * internal reference.
 */
function offendingSnippets(line: string): string[] {
  if (!BRAND.test(line)) return []

  const hits: string[] = []
  const push = (s: string) => {
    const v = s.trim()
    if (v && !isAllowlistedValue(v)) hits.push(v)
  }

  // 1) JSX text node: >...GenOffice...<
  for (const m of line.matchAll(/>([^<>{}]*(?:GenOffice|Genspark)[^<>{}]*)</g)) push(m[1])

  // 2) brand-bearing attributes
  for (const m of line.matchAll(
    /(?:aria-label|title|placeholder|alt)\s*=\s*"([^"]*(?:GenOffice|Genspark)[^"]*)"/g,
  )) {
    push(m[1])
  }

  // 3) HTML <title>GenOffice ...</title>
  for (const m of line.matchAll(/<title>([^<]*(?:GenOffice|Genspark)[^<]*)<\/title>/g)) push(m[1])

  // 4) i18n string VALUE: a quoted string, appearing as an object value
  //    (`key: '...GenOffice...'` or a wrapped continuation line that is just a
  //    quoted string). We only flag the value, never a key identifier.
  const valueMatch =
    /^\s*(?:[A-Za-z0-9_]+\s*:\s*)?(['"`])((?:\\.|(?!\1).)*?(?:GenOffice|Genspark)(?:\\.|(?!\1).)*?)\1\s*,?\s*$/.exec(
      line,
    )
  if (valueMatch) push(valueMatch[2])

  return hits
}

/**
 * Internal string VALUES that are allowed to keep the legacy token because they
 * are load-bearing endpoints/identifiers, not product copy. Kept deliberately
 * narrow: font families, ported cloud endpoints, serialized markers.
 */
function isAllowlistedValue(value: string): boolean {
  // Substring matches: the snippet is allowed when it CONTAINS an allowlisted
  // token (e.g. a CSS rule that references an internal font family, or markup
  // carrying a serialized fixture name). See docs/branding-cleanup.md.
  const ALLOW = [
    // Internal font families (baked into the metrics/CSS pipeline, locked by tests)
    /GenOffice (Sans|Serif|Gothic|Poppins|Tamil|Fullwidth|Batang|Myungjo|Che|Songti|Hiragino|Heiti|MingLiU|Ethiopic|Box Drawing|PUA Blank|Grid Strut|MS Mincho)/,
    // Serialized PDF metadata keys + round-trip marker
    /GenOfficeStaticFormFills|GenOfficeFormField|GenOffice visual signature field: /,
    // Univer extension key / command ids
    /GenOfficeCrossHighlightExtension|genoffice\.command\./,
    // Release-lineage URL (updater/test fixture) + ported cloud endpoints
    /genspark-ai\/genoffice|https?:\/\/(www\.)?genspark\.ai/,
    // Test fixture Application name
    /GenOffice Fixture/,
    // Package specifiers used as string values
    /@genoffice\//,
  ]
  return ALLOW.some((re) => re.test(value))
}

describe('branding audit: no user-visible GenOffice / Genspark literals', () => {
  const files: string[] = []
  for (const root of SCAN_ROOTS) {
    const abs = join(REPO_ROOT, root)
    try {
      if (statSync(abs).isDirectory()) walk(abs, files)
    } catch {
      // root missing in some checkouts; skip
    }
  }

  it('scans a meaningful number of source files', () => {
    // guard against the walker silently finding nothing (path/skip regressions)
    expect(files.length).toBeGreaterThan(200)
  })

  it('has no user-visible legacy brand strings outside the allowlist', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      const lines = text.split('\n')
      lines.forEach((line, i) => {
        for (const snippet of offendingSnippets(line)) {
          offenders.push(`${relative(REPO_ROOT, file).split(sep).join('/')}:${i + 1}  ${snippet}`)
        }
      })
    }
    expect(offenders, `user-visible legacy brand strings found:\n${offenders.join('\n')}`).toEqual(
      [],
    )
  })
})
