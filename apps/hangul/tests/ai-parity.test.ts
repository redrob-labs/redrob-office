// The Redrob panel in Hangul can do what it can in Docs: every tool the Docs
// agent declares is declared here too, unless it is listed below with why.
// Tools are read from the declarations (name + description), so a new Docs
// tool fails this test until Hangul has it or a reason is written down.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DECLARED = /\bname:\s*'([a-z_]+)',\s*\n?\s*description:/g

function toolsIn(dir: string): Set<string> {
  const out = new Set<string>()
  for (const f of readdirSync(dir)) {
    if (!/\.tsx?$/.test(f) || /\.test\./.test(f)) continue
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(DECLARED)) out.add(m[1]!)
  }
  return out
}

/** Docs tools Hangul does not have, and why. Keep this list short and honest. */
const DOCS_ONLY: Record<string, string> = {}

describe('Redrob panel parity with Docs', () => {
  const docs = toolsIn(join(__dirname, '../../docs/src/renderer/ai'))
  const hangul = toolsIn(join(__dirname, '../src/renderer/ai'))

  it('reads both tool sets', () => {
    expect(docs.size).toBeGreaterThan(10)
    expect(hangul.size).toBeGreaterThan(10)
  })

  it('every Docs tool is in Hangul, or listed with a reason', () => {
    expect([...docs].filter((t) => !hangul.has(t) && !(t in DOCS_ONLY)).sort()).toEqual([])
  })

  it('the exceptions are still Docs-only', () => {
    expect(Object.keys(DOCS_ONLY).filter((t) => hangul.has(t) || !docs.has(t))).toEqual([])
  })
})
