/**
 * Copy lint for the English interface strings.
 *
 * Redrob copy uses short dashes only: a hyphen-minus, spaced when it sets off
 * an aside. The em dash, en dash, horizontal bar and minus sign never appear
 * (design system, "The language of the system"). English is the master
 * string table, so this checks every English dictionary in the suite:
 *
 * - whole files named `en.ts` under an `i18n/` folder, and
 * - the `en: { ... }` block of any file that builds a dictionary set
 *   (`defineStrings(`, `createI18n(`, or a `strings = {` table).
 *
 * Only string literals are checked, so code comments may use any dash.
 * Exits 1 and prints every hit as file:line:col.
 *
 * Usage: node scripts/check-copy.mjs [file ...]   (default: git-listed files)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'

export const BANNED = [
  ['\u2014', 'em dash'],
  ['\u2013', 'en dash'],
  ['\u2015', 'horizontal bar'],
  ['\u2212', 'minus sign'],
]

const SKIP = /(^|\/)(node_modules|out|dist|build|\.turbo|resources)\//

/** [start, end) offsets of every string literal ('…', "…", `…` without ${}) */
export function stringLiterals(src) {
  const spans = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i)
      i = nl < 0 ? src.length : nl
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end < 0 ? src.length : end + 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const start = i
      i++
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') i++
        else if (c !== '`' && src[i] === '\n') break
        i++
      }
      spans.push([start, i + 1])
      i++
      continue
    }
    i++
  }
  return spans
}

/** [start, end) of the object literal after `en:` at the top level of a dictionary set */
export function englishBlocks(src) {
  const blocks = []
  const re = /(^|[\s,{])en\s*:\s*\{/g
  let m
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1
    let depth = 0
    const literals = stringLiterals(src.slice(open))
    let li = 0
    for (let j = open; j < src.length; j++) {
      // skip over string literals so braces inside copy don't count
      while (li < literals.length && literals[li][1] + open <= j) li++
      if (li < literals.length && literals[li][0] + open <= j) {
        j = literals[li][1] + open - 1
        continue
      }
      if (src[j] === '{') depth++
      else if (src[j] === '}' && --depth === 0) {
        blocks.push([open, j + 1])
        re.lastIndex = j + 1
        break
      }
    }
  }
  return blocks
}

const isEnglishTable = (file) => /(^|\/)i18n\/(.+\/)?en\.ts$/.test(file)
const buildsDictionaries = (src) =>
  /defineStrings\(|createI18n\(|\bstrings\s*=\s*\{/.test(src)

function lineCol(src, offset) {
  const before = src.slice(0, offset)
  const line = before.split('\n').length
  return [line, offset - before.lastIndexOf('\n')]
}

/** every banned dash inside English copy in one file's source */
export function checkSource(file, src) {
  const regions = isEnglishTable(file)
    ? [[0, src.length]]
    : buildsDictionaries(src)
      ? englishBlocks(src)
      : []
  const hits = []
  for (const [from, to] of regions) {
    const region = src.slice(from, to)
    for (const [s, e] of stringLiterals(region)) {
      const literal = region.slice(s, e)
      for (const [ch, name] of BANNED) {
        let k = literal.indexOf(ch)
        while (k >= 0) {
          const [line, col] = lineCol(src, from + s + k)
          hits.push({ file, line, col, name })
          k = literal.indexOf(ch, k + 1)
        }
      }
    }
  }
  return hits
}

function listFiles() {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'apps', 'packages'], {
    encoding: 'utf8',
  })
  return out
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => /\.(ts|tsx)$/.test(f) && !SKIP.test(f) && !/(^|\/)tests?\//.test(f))
}

function main() {
  const args = process.argv.slice(2)
  const files = args.length ? args.map((f) => relative(process.cwd(), f).split(sep).join('/')) : listFiles()
  const hits = []
  for (const file of files) {
    let src
    try {
      src = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    hits.push(...checkSource(file, src))
  }
  if (hits.length) {
    for (const h of hits) console.error(`${h.file}:${h.line}:${h.col}  ${h.name} in English copy`)
    console.error(
      `\ncheck:copy: ${hits.length} banned dash(es). Use a hyphen-minus, spaced when it sets off an aside.`,
    )
    process.exit(1)
  }
  console.log(`check:copy: ${files.length} files, English copy uses short dashes only.`)
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-copy.mjs')) {
  main()
}
