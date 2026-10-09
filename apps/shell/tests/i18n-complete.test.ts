/**
 * A language is offered only when it is complete (packages/i18n
 * SELECTABLE_LANGS): every string table in the suite, in every app's main and
 * renderer and the shared packages, has all of English's keys in it. A new
 * English string fails this test until it is translated into every offered
 * language, so turning a language on can never show stray English.
 *
 * Tables are found by reading the source: any object literal with an `en`
 * table and the language's table beside it. When that table is not written
 * inline (imported from its own file, or built with a spread), the module is
 * loaded and its exported tables are compared instead.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { MASTER_LANG, SELECTABLE_LANGS } from '@genoffice/i18n'

const ROOT = resolve(__dirname, '../../..')
const OFFERED = SELECTABLE_LANGS.filter((l) => l !== MASTER_LANG)

const sources = execSync('git ls-files apps packages', { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /^(apps|packages)\/[^/]+\/src\/.*\.tsx?$/.test(f) && !/\.test\.tsx?$|\/tests\/|\.d\.ts$/.test(f))

const propName = (n: ts.PropertyName): string | null =>
  ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : null

/** Keys of an object literal, or null when they cannot be read from the source (a spread). */
function keysOf(o: ts.ObjectLiteralExpression): string[] | null {
  const out: string[] = []
  for (const p of o.properties) {
    if (ts.isSpreadAssignment(p)) return null
    const name = p.name && propName(p.name)
    if (name !== null && name !== undefined) out.push(name)
  }
  return out
}

interface Found {
  file: string
  line: number
  lang: string
  missing: string[]
}

function scan(): { found: Found[]; toLoad: Set<string> } {
  const found: Found[] = []
  const toLoad = new Set<string>()
  for (const file of sources) {
    const text = readFileSync(join(ROOT, file), 'utf8')
    if (!/\ben\s*[:,]/.test(text)) continue
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const props = new Map<string, ts.ObjectLiteralElementLike>()
        for (const p of node.properties) {
          const name = p.name && propName(p.name)
          if (name) props.set(name, p)
        }
        const en = props.get('en')
        const enObj = en && ts.isPropertyAssignment(en) && ts.isObjectLiteralExpression(en.initializer) ? en.initializer : null
        if (enObj) {
          const enKeys = keysOf(enObj)
          for (const lang of OFFERED) {
            const t = props.get(lang)
            const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
            if (!t) {
              // a table set that has no row for this language at all
              if (enKeys && enKeys.length) found.push({ file, line, lang, missing: ['(no table)'] })
              continue
            }
            const obj = ts.isPropertyAssignment(t) && ts.isObjectLiteralExpression(t.initializer) ? t.initializer : null
            const keys = obj ? keysOf(obj) : null
            if (!enKeys || !keys) {
              toLoad.add(file)
              continue
            }
            const have = new Set(keys)
            const missing = enKeys.filter((k) => !have.has(k))
            if (missing.length) found.push({ file, line, lang, missing })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return { found, toLoad }
}

describe('every offered language is complete', () => {
  const { found, toLoad } = scan()

  it('offers at least one language beside English', () => {
    expect(OFFERED.length).toBeGreaterThan(0)
  })

  it('every inline table has all English keys', () => {
    expect(found.map((f) => `${f.file}:${f.line} ${f.lang} lacks ${f.missing.slice(0, 8).join(', ')}${f.missing.length > 8 ? ` (+${f.missing.length - 8})` : ''}`)).toEqual([])
  })

  it('every table assembled from other files has all English keys', async () => {
    const problems: string[] = []
    let checked = 0
    for (const file of toLoad) {
      const mod = (await import(join(ROOT, file))) as Record<string, unknown>
      for (const [name, v] of Object.entries(mod)) {
        if (!v || typeof v !== 'object') continue
        const t = v as Record<string, Record<string, unknown> | undefined>
        if (!t.en || typeof t.en !== 'object') continue
        checked++
        for (const lang of OFFERED) {
          const row = t[lang] ?? {}
          const missing = Object.keys(t.en).filter((k) => !(k in row))
          if (missing.length) problems.push(`${file} ${name} ${lang} lacks ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` (+${missing.length - 8})` : ''}`)
        }
      }
    }
    expect(problems).toEqual([])
    expect(checked).toBeGreaterThan(0)
  }, 120_000)
})
