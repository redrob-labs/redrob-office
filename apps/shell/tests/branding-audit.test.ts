import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/**
 * Static branding audit for Redrob Office.
 *
 * Fails if a USER-VISIBLE "GenOffice" or "Genspark" literal appears in the
 * source tree. "User-visible" means: JSX text nodes (including multiline),
 * the brand-bearing element attributes (aria-label / title / placeholder /
 * alt), HTML <title>, and the VALUES of i18n string tables (including values
 * that wrap across lines). Internal identifiers (package names, font families,
 * serialized keys, ported cloud endpoints, env vars, test fixtures) are
 * allowlisted per docs/branding-cleanup.md and must NOT trip this test.
 *
 * Beyond the text scan, this file makes EXPLICIT assertions about the two
 * surfaces the plain text scan cannot see: the packaging icons under `build/`
 * (binary assets) and the dev userData directory name (a runtime path). Those
 * are checked directly rather than being skipped blindly.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const SCAN_ROOTS = ['apps', 'packages', 'office/src']

const SKIP_DIR = new Set([
  'node_modules',
  'out',
  'dist',
  'build', // binary icon/packaging assets — asserted explicitly below, not text-scanned
  '.turbo',
  '.git',
  'coverage',
])

/** File is source we scan for copy. */
function isScannable(path: string): boolean {
  if (/\.(test|spec)\.[cm]?tsx?$/.test(path)) return false // test files allowlisted
  return /\.(tsx?|html|css)$/.test(path)
}

/**
 * Load-bearing internal integration code whose truthful references to the real
 * upstream service are NOT user-facing product copy: the ported Genspark cloud
 * client libraries. Their error strings (e.g. "Not logged in to Genspark (gsk
 * login)") accurately name the endpoint they talk to and only surface on the
 * hidden cloud path (see docs/branding-cleanup.md + cloud-account-hidden.test).
 */
function isLoadBearingInternal(relPath: string): boolean {
  return (
    relPath.startsWith('packages/ai-search/') || relPath.startsWith('packages/ai-provider/')
  )
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    if (name === 'tests' || name === '__tests__') continue // test support/fixtures allowlisted
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (isScannable(full) && !isLoadBearingInternal(relative(REPO_ROOT, full).split(sep).join('/')))
      out.push(full)
  }
}

const BRAND = /(GenOffice|Genspark)/

/**
 * Internal string VALUES that are allowed to keep the legacy token because they
 * are load-bearing endpoints/identifiers, not product copy. See
 * docs/branding-cleanup.md.
 */
function isAllowlistedValue(value: string): boolean {
  const ALLOW = [
    /GenOffice (Sans|Serif|Gothic|Poppins|Tamil|Fullwidth|Batang|Myungjo|Che|Songti|Hiragino|Heiti|MingLiU|Ethiopic|Box Drawing|PUA Blank|Grid Strut|MS Mincho)/,
    /GenOfficeStaticFormFills|GenOfficeFormField|GenOffice visual signature field: /,
    /GenOfficeCrossHighlightExtension|genoffice\.command\./,
    /genspark-ai\/genoffice|https?:\/\/(www\.)?genspark\.ai/,
    /GenOffice Fixture/,
    /@genoffice\//,
    // The GensparkMark component identifier is kept (see docs/branding-cleanup.md);
    // its ARTWORK is the Redrob mark. Only the identifier remains.
    /GensparkMark/,
    // The legacy-folder alias constant deliberately names the old folder so it
    // can map it to the new one; it is logic, not display copy.
    /^GenOffice$/,
  ]
  return ALLOW.some((re) => re.test(value))
}

/** Per-line detectors (JSX text, attributes, <title>, single-line values). */
function offendingSnippetsLine(line: string): string[] {
  if (!BRAND.test(line)) return []
  const hits: string[] = []
  const push = (s: string) => {
    const v = s.trim()
    if (v && !isAllowlistedValue(v)) hits.push(v)
  }

  // a line that is purely a // or /* */ comment is never user-visible copy
  const t = line.trim()
  const isCommentLine = t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')

  for (const m of line.matchAll(/>([^<>{}]*(?:GenOffice|Genspark)[^<>{}]*)</g)) push(m[1])
  for (const m of line.matchAll(
    /(?:aria-label|title|placeholder|alt)\s*=\s*"([^"]*(?:GenOffice|Genspark)[^"]*)"/g,
  )) {
    push(m[1])
  }
  for (const m of line.matchAll(/<title>([^<]*(?:GenOffice|Genspark)[^<]*)<\/title>/g)) push(m[1])

  // Error / dialog copy shown to the user: `throw new Error('…Genspark…')`,
  // `error: '…Genspark…'`, `message: '…'`, `dialog.showErrorBox('…')`.
  if (!isCommentLine) {
    for (const m of line.matchAll(
      /(?:new Error|showErrorBox|showMessageBox|error|message)\s*[:(]\s*(['"`])((?:\\.|(?!\1).)*?(?:GenOffice|Genspark)(?:\\.|(?!\1).)*?)\1/g,
    )) {
      push(m[2])
    }
    // CSS content: '…' is the only user-visible CSS string
    for (const m of line.matchAll(/content\s*:\s*(['"])((?:\\.|(?!\1).)*?(?:GenOffice|Genspark)(?:\\.|(?!\1).)*?)\1/g)) {
      push(m[2])
    }
  }

  const valueMatch =
    /^\s*(?:[A-Za-z0-9_]+\s*:\s*)?(['"`])((?:\\.|(?!\1).)*?(?:GenOffice|Genspark)(?:\\.|(?!\1).)*?)\1\s*,?\s*$/.exec(
      line,
    )
  if (valueMatch) push(valueMatch[2])

  return hits
}

/**
 * Detectors for values that SPAN multiple lines. Two shapes the per-line scan
 * cannot see:
 *  - a JSX text node between `>` and `<` that wraps across lines
 *  - a string value whose opening `key:` is on one line and whose literal wraps
 *    onto following lines (a template literal, or a `'...' + \n '...'` join)
 *
 * Implemented with bounded, line-oriented logic (no catastrophic-backtracking
 * whole-file regex): we look at small windows of adjacent lines.
 */
function offendingSnippetsMultiline(lines: string[]): string[] {
  const hits: string[] = []
  const push = (s: string) => {
    const v = s.replace(/\s+/g, ' ').trim()
    if (v && !isAllowlistedValue(v)) hits.push(v)
  }

  // A line that is a comment or an import/export statement is never user-visible
  // copy; drop it from the window so a wrapped construct isn't stitched together
  // out of code + comment prose (which produced false positives).
  const isCode = (l: string): boolean => {
    const t = l.trim()
    return (
      t.startsWith('//') ||
      t.startsWith('*') ||
      t.startsWith('/*') ||
      t.startsWith('import ') ||
      t.startsWith('export ') ||
      t.startsWith('} from') ||
      /\bfrom\s+['"]/.test(t)
    )
  }

  // Only inspect windows AROUND a line that carries a brand token (on a
  // non-code line). Brand tokens are rare, so this stays linear and cheap.
  for (let i = 0; i < lines.length; i++) {
    if (!BRAND.test(lines[i])) continue
    if (isCode(lines[i])) continue // brand token is on a comment/import line
    const start = Math.max(0, i - 3)
    const window = lines
      .slice(start, i + 4)
      .filter((l) => !isCode(l))
      .join('\n')
    if (!window.includes('\n')) continue

    // Multiline JSX TEXT node: `>` ... newline ... brand ... `<`, where the
    // inner span is genuine text, not code. We reject a span that contains
    // characters that only appear in code between tags (`=`, `/`, `(`, `{`,
    // `}`, `;`), which is what let type-params / comments produce false hits.
    for (const m of window.matchAll(/>([^<>{}=/();]*(?:GenOffice|Genspark)[^<>{}=/();]*)</g)) {
      if (m[1].includes('\n')) push(m[1])
    }
    // Multiline TEMPLATE-LITERAL value: `\`` ... newline ... brand ... `\``.
    // Only backticks legitimately span lines in JS source; single/double quotes
    // that appear to "span" are really adjacent object entries, so we do not
    // pair those (the per-line scan already covers single-line quoted values).
    for (const m of window.matchAll(/`([^`]*(?:GenOffice|Genspark)[^`]*)`/g)) {
      if (m[1].includes('\n')) push(m[1])
    }
  }

  return hits
}

function md5(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex')
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
    expect(files.length).toBeGreaterThan(200)
  })

  it('has no user-visible legacy brand strings (per-line or multiline) outside the allowlist', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(REPO_ROOT, file).split(sep).join('/')
      const text = readFileSync(file, 'utf8')
      const lines = text.split('\n')
      lines.forEach((line, i) => {
        for (const snippet of offendingSnippetsLine(line)) offenders.push(`${rel}:${i + 1}  ${snippet}`)
      })
      for (const snippet of offendingSnippetsMultiline(lines)) {
        offenders.push(`${rel}  (multiline)  ${snippet}`)
      }
    }
    // de-dupe (a multiline match can also surface per-line)
    const unique = [...new Set(offenders)]
    expect(unique, `user-visible legacy brand strings found:\n${unique.join('\n')}`).toEqual([])
  })
})

describe('branding audit: no em dashes in user-facing copy', () => {
  // The no-em-dash rule applies to user-facing copy. We scan the i18n / strings
  // tables (whose every string is display copy) for an em dash inside a quoted
  // value, allowing only the lone "—" typographic none/empty glyph.
  const EM = '\u2014'
  const I18N_GLOBS = [
    'apps/shell/src/renderer/src/strings.ts',
    'apps/markdown/src/renderer/i18n/strings.ts',
    'apps/pdf/src/renderer/i18n/strings.ts',
    'apps/docs/src/renderer/i18n',
    'apps/slides/src/renderer/i18n',
    'apps/sheets/src/renderer/i18n',
  ]

  function collectI18nFiles(): string[] {
    const out: string[] = []
    for (const g of I18N_GLOBS) {
      const abs = resolve(REPO_ROOT, g)
      if (!existsSync(abs)) continue
      if (statSync(abs).isDirectory()) {
        const stack = [abs]
        while (stack.length) {
          const d = stack.pop()!
          for (const name of readdirSync(d)) {
            const full = join(d, name)
            const st = statSync(full)
            if (st.isDirectory()) stack.push(full)
            else if (/\.tsx?$/.test(full)) out.push(full)
          }
        }
      } else out.push(abs)
    }
    return out
  }

  it('i18n string values contain no em dashes (except the lone none glyph)', () => {
    const offenders: string[] = []
    for (const file of collectI18nFiles()) {
      const rel = relative(REPO_ROOT, file).split(sep).join('/')
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const t = line.trim()
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return // comments
          // quoted value containing an em dash, where the value is not just "—"
          for (const m of line.matchAll(/(['"`])((?:\\.|(?!\1).)*?)\1/g)) {
            const v = m[2]
            if (v.includes(EM) && v.trim() !== EM) offenders.push(`${rel}:${i + 1}  ${v}`)
          }
        })
    }
    expect(offenders, `em dashes in i18n copy:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('branding audit: packaging icons are not the legacy mark', () => {
  // The legacy GenOffice black-square icons that used to ship, by md5.
  const LEGACY = {
    icns: 'a6ca83408eb32908bdb732303372a65b',
    // legacy app-icon PNG (also the old build/icon.png) that was the black square
    png: 'b580fa05f077062aa8e8183dcce0d3b2',
  }
  const ICON_FILES = [
    'apps/shell/build/icon.icns',
    'apps/shell/build/icon.png',
    'apps/shell/build/icon-mac.png',
    'apps/docs/build/icon.icns',
    'apps/docs/build/icon.png',
  ]

  for (const rel of ICON_FILES) {
    it(`${rel} is not a legacy GenOffice icon`, () => {
      const abs = resolve(REPO_ROOT, rel)
      expect(existsSync(abs), `${rel} missing`).toBe(true)
      const hash = md5(readFileSync(abs))
      expect(hash).not.toBe(LEGACY.icns)
      expect(hash).not.toBe(LEGACY.png)
    })
  }

  it('the legacy renderer wordmark/app-icon assets are gone', () => {
    for (const rel of [
      'apps/shell/src/renderer/src/assets/genoffice-logo.svg',
      'apps/shell/src/renderer/src/assets/app-icon.png',
    ]) {
      expect(existsSync(resolve(REPO_ROOT, rel)), `${rel} should have been removed`).toBe(false)
    }
  })
})

describe('branding audit: runtime userData + Location alias are Redrob', () => {
  it('the dev userData directory is "Redrob Office Dev", not "GenOffice Dev"', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'apps/shell/src/main/userdata-migration.ts'),
      'utf8',
    )
    expect(src).toContain("DEV_USER_DATA_DIR = 'Redrob Office Dev'")
    // "GenOffice Dev" may appear ONLY as a legacy migration source, never as the
    // active directory name.
    const index = readFileSync(resolve(REPO_ROOT, 'apps/shell/src/main/index.ts'), 'utf8')
    expect(index).not.toContain("'GenOffice Dev'")
    expect(index).toContain('DEV_USER_DATA_DIR')
  })

  it('the recent-file Location column aliases the legacy save folder to Redrob Office', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'apps/shell/src/renderer/src/recent-location.ts'),
      'utf8',
    )
    expect(src).toContain("CURRENT_SAVE_DIR = 'Redrob Office'")
    // Home.tsx must render the aliased value, not the raw parent dir.
    const home = readFileSync(resolve(REPO_ROOT, 'apps/shell/src/renderer/src/Home.tsx'), 'utf8')
    expect(home).toContain('displayParentDir(entry.path)')
  })
})
