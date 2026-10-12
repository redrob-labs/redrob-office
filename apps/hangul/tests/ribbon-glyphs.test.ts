// Text glyphs on ribbon buttons (task 2.5): only characters every chrome font
// draws. A symbol outside that set (✂, ⬚, ⤓, ▔…) rendered as a blank button,
// so such commands use a kit icon or one from ribbon-icons.tsx instead.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(__dirname, '../src/renderer/next/HangulRibbon.tsx'), 'utf8')
// Hangul syllables and jamo, ASCII letters and digits, + - %, and ² ₂ ¶, all in Pretendard.
const DRAWABLE = /^[\u1100-\u11FF\u3131-\u318E\uAC00-\uD7A3A-Za-z0-9+\-% ²₂¶]+$/u

describe('ribbon glyphs', () => {
  it('every text glyph is drawable by the chrome fonts', () => {
    const glyphs = [...src.matchAll(/\bg\('([^']*)'\)/g)].map((m) => m[1]!)
    expect(glyphs.length).toBeGreaterThan(0)
    expect(glyphs.filter((g) => !DRAWABLE.test(g))).toEqual([])
  })
})
