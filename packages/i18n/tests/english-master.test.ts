import { describe, expect, it } from 'vitest'
import {
  LANGS,
  MASTER_LANG,
  SELECTABLE_LANGS,
  createI18n,
  defineStrings,
  isSelectableLang,
  languageOptions,
  lookup,
  toSelectableLang,
} from '../src/index'
// @ts-expect-error - plain .mjs script, no type declarations
import { checkSource, englishBlocks } from '../../../scripts/check-copy.mjs'

type Hit = { file: string; line: number; col: number; name: string }
const check = checkSource as (file: string, src: string) => Hit[]

describe('English is the master language', () => {
  it('offers English only, and every other language is "Not yet"', () => {
    expect(MASTER_LANG).toBe('en')
    expect(SELECTABLE_LANGS).toEqual(['en'])
    const options = languageOptions()
    expect(options).toHaveLength(LANGS.length)
    expect(options[0]).toEqual({ value: 'en', label: 'English', selectable: true })
    expect(options.slice(1).every((o) => !o.selectable)).toBe(true)
    expect(options.find((o) => o.value === 'ko')).toEqual({
      value: 'ko',
      label: '한국어',
      selectable: false,
    })
  })

  it('maps a stored language that is no longer offered to English', () => {
    expect(isSelectableLang('ko')).toBe(false)
    expect(isSelectableLang('en')).toBe(true)
    expect(isSelectableLang('xx')).toBe(false)
    expect(toSelectableLang('ko')).toBe('en')
    expect(toSelectableLang('zh')).toBe('en')
    expect(toSelectableLang('en')).toBe('en')
    expect(toSelectableLang(undefined)).toBe('en')
  })

  it('falls back to English for a string another table lacks', () => {
    const dicts = defineStrings({
      en: { hello: 'Hello {name}', only: 'English only' },
      ko: { hello: '안녕하세요 {name}' },
    })
    const t = createI18n(dicts)
    expect(t('ko', 'hello', { name: 'Felix' })).toBe('안녕하세요 Felix')
    expect(t('ko', 'only')).toBe('English only')
    // a language with no table at all
    expect(t('fr', 'hello', { name: 'Felix' })).toBe('Hello Felix')
    expect(lookup(dicts, 'en', 'only')).toBe('English only')
  })

  it('requires English to be complete at compile time', () => {
    // @ts-expect-error - the en table is required
    defineStrings({ zh: { a: 'x' } })
    expect(true).toBe(true)
  })
})

describe('check:copy', () => {
  it('flags every banned dash in an English table file, inside strings only', () => {
    const src = [
      '// a comment — may use any dash',
      "export const en = {",
      "  a: 'Range 1–12',",
      "  b: 'Wait — no',",
      "  c: 'Bar ― here',",
      "  d: 'Minus −5',",
      "  e: 'Short - dash is fine',",
      '}',
    ].join('\n')
    const hits = check('apps/x/src/renderer/i18n/en.ts', src)
    expect(hits.map((h) => [h.line, h.name])).toEqual([
      [3, 'en dash'],
      [4, 'em dash'],
      [5, 'horizontal bar'],
      [6, 'minus sign'],
    ])
  })

  it('checks only the en block of a combined dictionary set', () => {
    const src = [
      'export const strings = {',
      "  zh: { a: '范围 1–12' },",
      "  en: { a: 'Range — wide', b: 'ok {x}' },",
      "  ja: { a: '範囲 — 広い' },",
      '}',
    ].join('\n')
    const hits = check('apps/x/src/renderer/src/strings.ts', src)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ line: 3, name: 'em dash' })
    const blocks = englishBlocks(src) as Array<[number, number]>
    expect(blocks).toHaveLength(1)
  })

  it('ignores braces inside copy when finding the en block', () => {
    const src = "createI18n({ en: { a: 'Use { and }', b: 'Wait — no' }, ko: { a: '—' } })"
    const hits = check('apps/x/src/main/i18n-main.ts', src)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ name: 'em dash' })
  })

  it('leaves files that build no dictionaries alone', () => {
    expect(check('apps/x/src/renderer/App.tsx', "const s = 'a — b'")).toEqual([])
  })
})
