import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { strings } from '../src/renderer/i18n/strings'

const dicts = strings as Record<string, Record<string, string>>
const enKeys = Object.keys(dicts.en!).sort()

// English defines the key set; other locales may be partial and fall back to it.
describe('i18n string tables', () => {
  it('provides a dictionary for every supported language and nothing else', () => {
    expect(Object.keys(dicts).sort()).toEqual([...LANGS].sort())
  })

  it.each([...LANGS])('locale %s uses only keys English defines', (lang) => {
    expect(Object.keys(dicts[lang]!).filter((k) => !enKeys.includes(k))).toEqual([])
  })

  it.each([...LANGS])('locale %s has no empty values', (lang) => {
    for (const [key, value] of Object.entries(dicts[lang]!)) {
      expect(typeof value, `${lang}.${key}`).toBe('string')
      expect(value.trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0)
    }
  })

  it.each([...LANGS])('locale %s keeps the same placeholders as English', (lang) => {
    for (const key of Object.keys(dicts[lang]!)) {
      const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
      expect(placeholders(dicts[lang]![key]!), `${lang}.${key}`).toEqual(
        placeholders(dicts.en![key]!),
      )
    }
  })
})
