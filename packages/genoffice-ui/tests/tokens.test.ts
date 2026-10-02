import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PKG_ROOT = process.cwd()
const REPO_ROOT = join(PKG_ROOT, '../..')
const require = createRequire(join(PKG_ROOT, 'package.json'))

const read = (path: string): string => readFileSync(path, 'utf8')
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')
const declared = (css: string): Set<string> =>
  // a declaration starts a block or follows one; this skips selectors such as
  // `.rr-btn--danger:hover`, whose `--danger:` is part of a class name
  new Set([...stripComments(css).matchAll(/(?:^|[{;\s])(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]))
const referenced = (css: string): Set<string> =>
  new Set([...stripComments(css).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]))

const bridge = read(join(PKG_ROOT, 'src/tokens.css'))
const kitTokens = read(require.resolve('@redrob-labs/ui/tokens.css'))
const kitSystem = read(require.resolve('@redrob-labs/ui/styles.css'))
const kitNames = new Set([...declared(kitTokens), ...declared(kitSystem)])

/** Names the apps define for themselves and the bridge may read with a fallback. */
const APP_PROVIDED = new Set(['--ui-cjk'])

function cssFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...cssFiles(path))
    else if (name.endsWith('.css')) out.push(path)
  }
  return out
}

describe('legacy token bridge (src/tokens.css)', () => {
  it('declares no name the kit declares, so kit components keep their values', () => {
    const clashes = [...declared(bridge)].filter((n) => kitNames.has(n))
    expect(clashes).toEqual([])
  })

  it('resolves every alias to a kit token or to another bridge alias', () => {
    const own = declared(bridge)
    const unresolved = [...referenced(bridge)].filter(
      (n) => !kitNames.has(n) && !own.has(n) && !APP_PROVIDED.has(n),
    )
    expect(unresolved).toEqual([])
  })

  it('carries no colour literals: every colour comes from the kit', () => {
    expect(stripComments(bridge)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
  })

  it('keeps every legacy chrome name the apps read', () => {
    const own = declared(bridge)
    for (const name of [
      '--surface',
      '--surface-subtle',
      '--chrome-bg',
      '--canvas',
      '--border',
      '--border-control',
      '--text',
      '--text-primary',
      '--text-secondary',
      '--text-muted',
      '--hover',
      '--active-bg',
      '--danger',
      '--success',
      '--accent',
      '--accent-dark',
      '--accent-soft',
      '--color-btn-primary',
      '--color-ai-action',
      '--color-text-primary',
      '--color-bg-page',
      '--gs-font-sans',
      '--font-chrome',
      '--fs-caption',
    ]) {
      expect(own.has(name), name).toBe(true)
    }
  })
})

describe('the apps', () => {
  const appCss = readdirSync(join(REPO_ROOT, 'apps'))
    .map((app) => join(REPO_ROOT, 'apps', app, 'src'))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory()
      } catch {
        return false
      }
    })
    .flatMap(cssFiles)

  it('found the app stylesheets', () => {
    expect(appCss.length).toBeGreaterThan(6)
  })

  it('define no accent of their own: one brand palette for the suite', () => {
    const offenders = appCss.filter((f) => /(^|[;{\s])--accent(-dark|-soft|-hover)?\s*:/m.test(stripComments(read(f))))
    expect(offenders).toEqual([])
  })

  it('no longer read the renamed legacy names the kit now owns', () => {
    const offenders = appCss.filter((f) =>
      /var\(\s*--(border-strong|text-body-lg|text-small|text-caption)\b/.test(read(f)),
    )
    expect(offenders).toEqual([])
  })
})
