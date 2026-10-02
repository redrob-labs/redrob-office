#!/usr/bin/env node
// Guards the design-system migration onto @redrob-labs/ui. Fails when:
//   - a source file reads or declares a retired legacy chrome token (the old
//     GenOffice names the bridge in packages/genoffice-ui/src/tokens.css used to
//     alias onto kit tokens; read the kit name instead);
//   - renderer CSS switches theme with @media (prefers-color-scheme), since the
//     theme is always written to <html data-theme> by applyUiTheme;
//   - anything outside packages/genoffice-ui imports or depends on
//     @redrob-labs/ui directly (apps reach the kit through @genoffice/ui only).
//
// Vendored build output (apps/*/resources) is not ours and is skipped.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

export const RETIRED_TOKENS = [
  '--surface',
  '--surface-subtle',
  '--chrome-bg',
  '--canvas',
  '--bg-content',
  '--border',
  '--text',
  '--text-primary',
  '--text-secondary',
  '--text-dim',
  '--text-tertiary',
  '--text-muted',
  '--hover',
  '--bg-hover',
  '--bg-hover-subtle',
  '--danger',
  '--success',
  '--color-bg-overlay',
  '--shadow-modal-strong',
  '--shadow-menu',
  '--shadow-btn-hover',
  '--accent',
  '--accent-dark',
  '--accent-hover',
  '--accent-soft',
  '--color-btn-primary',
  '--color-btn-primary-hover',
  '--color-btn-primary-text',
  '--color-ai-action',
  '--color-ai-action-hover',
  '--color-ai-action-text',
  '--color-brand-secondary',
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-bg-page',
  '--color-bg-subtle',
  '--color-border-default',
  '--color-border-brand',
  '--color-error',
  '--gs-font-sans',
  '--radius-6',
  '--radius-8',
  '--radius-12',
  '--radius-16',
  '--radius-30',
]

const escape = (s) => s.replace(/[-]/g, '\\-')
const NAMES = RETIRED_TOKENS.map(escape).join('|')
// a name ends where an identifier character would continue it
const END = '(?![\\w-])'
const READ = new RegExp(`var\\(\\s*(${NAMES})${END}`, 'g')
// a declaration starts a line or block or follows one; this skips selectors
// such as `.rr-btn--danger:hover`
const DECLARE = new RegExp(`(?:^|[{;\\s'"\`])(${NAMES})${END}\\s*:`, 'gm')
const SET_PROPERTY = new RegExp(`setProperty\\(\\s*['"\`](${NAMES})['"\`]`, 'g')
const COLOR_SCHEME_MEDIA = /@media[^{]*prefers-color-scheme/g
const KIT_IMPORT =
  /(?:from\s+|import\s*\(?\s*|require\(\s*|@import\s+(?:url\()?)['"]@redrob-labs\/ui(?:[/'"])/g

const SOURCE = /\.(?:css|ts|tsx|mts|cts|js|jsx|mjs|cjs|html)$/
const SKIP = /(?:^|\/)(?:node_modules|resources|out|dist|build|\.turbo)\//
const RENDERER_CSS = /^(?:apps\/[^/]+\/src\/.+|packages\/genoffice-ui\/src\/.+)\.css$/
const KIT_HOME = /^packages\/genoffice-ui\//

const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

function lineOf(text, index) {
  let n = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++
  return n
}

export function scan(files, read) {
  const violations = []
  const report = (file, text, index, message) =>
    violations.push(`${file}:${lineOf(text, index)}  ${message}`)

  for (const file of files) {
    if (SKIP.test(file)) continue
    if (file.endsWith('/package.json') && !KIT_HOME.test(file)) {
      const pkg = JSON.parse(read(file))
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        if (pkg[field]?.['@redrob-labs/ui']) {
          violations.push(`${file}  ${field} lists @redrob-labs/ui; depend on @genoffice/ui`)
        }
      }
      continue
    }
    if (!SOURCE.test(file)) continue
    const raw = read(file)
    // comments may name the retired tokens (history, rationale); code may not
    const text = file.endsWith('.css') ? stripCssComments(raw) : raw

    for (const m of text.matchAll(READ)) report(file, text, m.index, `reads retired ${m[1]}`)
    for (const m of text.matchAll(SET_PROPERTY)) report(file, text, m.index, `sets retired ${m[1]}`)
    if (file.endsWith('.css') || file.endsWith('.html')) {
      for (const m of text.matchAll(DECLARE))
        report(file, text, m.index, `declares retired ${m[1]}`)
    }
    if (RENDERER_CSS.test(file)) {
      for (const m of text.matchAll(COLOR_SCHEME_MEDIA)) {
        report(file, text, m.index, 'themes by prefers-color-scheme; use [data-theme]')
      }
    }
    if (!KIT_HOME.test(file)) {
      for (const m of text.matchAll(KIT_IMPORT)) {
        report(file, text, m.index, 'imports @redrob-labs/ui; import from @genoffice/ui')
      }
    }
  }
  return violations
}

function main() {
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  if (root.status !== 0) process.exit(root.status ?? 1)
  const repo = root.stdout.trim()
  const listed = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'apps', 'packages', 'tests'],
    { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (listed.status !== 0) process.exit(listed.status ?? 1)
  const files = listed.stdout.split('\n').filter(Boolean)
  const violations = scan(files, (f) => {
    try {
      return readFileSync(join(repo, f), 'utf8')
    } catch {
      return '' // listed but deleted in the working tree
    }
  })
  if (violations.length === 0) {
    console.log('UI tokens: no retired tokens, colour-scheme media queries or direct kit imports.')
    return
  }
  console.error(
    'UI token check failed. Chrome reads @redrob-labs/ui token names through\n' +
      '@genoffice/ui; see "Design system" in AGENTS.md.\n',
  )
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}

// run as a script; importing it (for `scan`) has no side effects
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/check-ui-tokens.mjs')) main()
