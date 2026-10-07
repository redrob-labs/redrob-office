import { describe, expect, it } from 'vitest'
import { resolveStartupLang } from '../src/main/ui-language'

describe('resolveStartupLang', () => {
  it('migrates a stored language that is no longer offered to English', () => {
    expect(resolveStartupLang({ saved: 'ko', systemLocale: 'ko-KR' })).toEqual({
      lang: 'en',
      migrate: true,
    })
    expect(resolveStartupLang({ saved: 'zh', systemLocale: 'en-US' })).toEqual({
      lang: 'en',
      migrate: true,
    })
  })

  it('keeps a stored English choice as it is', () => {
    expect(resolveStartupLang({ saved: 'en', systemLocale: 'ko-KR' })).toEqual({
      lang: 'en',
      migrate: false,
    })
  })

  it('opens a fresh profile in English whatever the system locale', () => {
    expect(resolveStartupLang({ systemLocale: 'ja-JP' })).toEqual({ lang: 'en', migrate: false })
    expect(resolveStartupLang({ saved: 'not-a-lang', systemLocale: 'ko' })).toEqual({
      lang: 'en',
      migrate: false,
    })
  })

  it('honors the developer override only when selectable, and never rewrites settings for it', () => {
    expect(resolveStartupLang({ envLang: 'ko', saved: 'en', systemLocale: 'en' })).toEqual({
      lang: 'en',
      migrate: false,
    })
    expect(resolveStartupLang({ envLang: 'en-GB', systemLocale: 'ko' })).toEqual({
      lang: 'en',
      migrate: false,
    })
  })
})
