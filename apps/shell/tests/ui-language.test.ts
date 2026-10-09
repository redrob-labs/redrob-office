import { describe, expect, it } from 'vitest'
import { resolveStartupLang } from '../src/main/ui-language'

describe('resolveStartupLang', () => {
  it('keeps a stored language that is offered (English, Korean)', () => {
    expect(resolveStartupLang({ saved: 'ko', systemLocale: 'en-US' })).toEqual({ lang: 'ko', migrate: false })
    expect(resolveStartupLang({ saved: 'en', systemLocale: 'ko-KR' })).toEqual({ lang: 'en', migrate: false })
  })

  it('migrates a stored language that is not offered to English', () => {
    expect(resolveStartupLang({ saved: 'zh', systemLocale: 'en-US' })).toEqual({ lang: 'en', migrate: true })
    expect(resolveStartupLang({ saved: 'ja', systemLocale: 'ko-KR' })).toEqual({ lang: 'en', migrate: true })
  })

  it('opens a fresh profile in the system language when it is offered, else in English', () => {
    expect(resolveStartupLang({ systemLocale: 'ko-KR' })).toEqual({ lang: 'ko', migrate: false })
    expect(resolveStartupLang({ systemLocale: 'ja-JP' })).toEqual({ lang: 'en', migrate: false })
    expect(resolveStartupLang({ saved: 'not-a-lang', systemLocale: 'ko' })).toEqual({ lang: 'ko', migrate: false })
  })

  it('honors the developer override only when offered, and never rewrites settings for it', () => {
    expect(resolveStartupLang({ envLang: 'ko', saved: 'en', systemLocale: 'en' })).toEqual({ lang: 'ko', migrate: false })
    expect(resolveStartupLang({ envLang: 'ja', saved: 'en', systemLocale: 'en' })).toEqual({ lang: 'en', migrate: false })
    expect(resolveStartupLang({ envLang: 'en-GB', systemLocale: 'ko' })).toEqual({ lang: 'en', migrate: false })
  })
})
