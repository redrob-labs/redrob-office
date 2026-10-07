// Hancom's HWP specification requires this statement in a product's user
// interface, manual, help and source (docs/decisions/2026-10-hangul-format-research.md,
// finding 4). It is shown verbatim, in Korean, in every interface language.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strings } from '../src/renderer/src/strings'

const SENTENCE = '본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.'

describe('Hancom attribution (spec task 2.7)', () => {
  it('is in every locale of the About pane, verbatim', () => {
    for (const [lang, dict] of Object.entries(strings)) expect((dict as Record<string, string>).setHwpAttribution, lang).toBe(SENTENCE)
  })

  it('is rendered in the About pane', () => {
    const src = readFileSync(join(__dirname, '../src/renderer/src/SettingsModal.tsx'), 'utf8')
    expect(src).toContain("t('setHwpAttribution')")
  })

  it('is in NOTICE and the Hangul editor', () => {
    expect(readFileSync(join(__dirname, '../../../NOTICE'), 'utf8')).toContain(SENTENCE)
    expect(readFileSync(join(__dirname, '../../hangul/src/renderer/i18n/strings.ts'), 'utf8')).toContain(SENTENCE)
    expect(readFileSync(join(__dirname, '../../../packages/hwp-core/src/index.ts'), 'utf8')).toContain(SENTENCE)
  })
})
