/**
 * People's colours stay legible: the name on a caret (white on the seat
 * colour, on the paper) and the initials on a title-bar face (seat ink on
 * seat fill, in both themes) meet WCAG AA for small text, 4.5:1.
 */
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const docsCss = readFileSync(resolve(here, '../src/renderer/styles.css'), 'utf8')
const officeTokens = readFileSync(resolve(here, '../../../packages/genoffice-ui/src/tokens.css'), 'utf8')
const req = createRequire(resolve(here, '../../../packages/genoffice-ui/package.json'))
const kitDir = dirname(realpathSync(req.resolve('@redrob-labs/ui/package.json')))
const kitTokens = readFileSync(join(kitDir, 'dist/styles/tokens.css'), 'utf8')

function hex(value: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (!m) throw new Error(`not a 6-digit hex colour: ${value}`)
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

/** the first declaration of a custom property in a block of CSS */
function decl(css: string, name: string): string {
  const m = new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`).exec(css)
  if (!m) throw new Error(`${name} is not declared`)
  return m[1]!.trim()
}

/** a kit ramp value, through any var() chain */
function kit(name: string): string {
  let v = decl(kitTokens, name)
  for (let i = 0; i < 5 && v.startsWith('var('); i++) v = decl(kitTokens, v.slice(4, -1).trim())
  return v
}

const seats = [1, 2, 3, 4, 5, 6]

describe('people colours', () => {
  it('a caret name, white on its seat colour, reads at 4.5:1', () => {
    const ink = decl(docsCss, '--docs-paper-peer-ink')
    for (const n of seats) {
      const bg = decl(docsCss, `--docs-paper-peer-${n}`)
      expect(contrast(ink, bg), `seat ${n} ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('face initials read at 4.5:1 in light and dark', () => {
    const [light, dark] = officeTokens.split("[data-theme='dark']")
    for (const block of [light!, dark!]) {
      for (const n of seats) {
        const bg = kit(decl(block, `--office-peer-${n}-bg`).slice(4, -1).trim())
        const ink = kit(decl(block, `--office-peer-${n}-ink`).slice(4, -1).trim())
        expect(contrast(ink, bg), `seat ${n} ${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
