import { describe, expect, it } from 'vitest'
import { strings } from '../src/renderer/src/strings'
/**
 * Home-screen locale tables (src/renderer/src/strings.ts): English defines the
 * key set. Every other locale may be partial (a missing string falls back to
 * English), but must never use a key English lacks, leave a value empty, or
 * drop or invent a placeholder.
 */
const locales = Object.keys(strings) as Array<keyof typeof strings>
const referenceKeys = Object.keys(strings.en).sort()
const en = strings.en as Record<string, string>
/** placeholders like {n}, {name}, {v} embedded in a template */
function placeholdersOf(template: string): string[] {
  return (template.match(/\{[a-zA-Z0-9]+\}/g) ?? []).sort()
}
describe('home-screen locale tables', () => {
  it('includes the expected UI languages', () => {
    expect(locales).toContain('zh')
    expect(locales).toContain('en')
    expect(locales).toContain('zh-TW')
    expect(locales.length).toBeGreaterThanOrEqual(19)
  })
  it.each(locales)('locale %s uses only keys English defines', (locale) => {
    const extra = Object.keys(strings[locale]).filter((k) => !(k in en))
    expect(extra).toEqual([])
  })
  it.each(locales)('locale %s has no empty or whitespace-only values', (locale) => {
    const empty = Object.entries(strings[locale])
      .filter(([, value]) => typeof value !== 'string' || value.trim().length === 0)
      .map(([key]) => key)
    expect(empty).toEqual([])
  })
  it.each(locales)('locale %s keeps the English placeholder set for each key it has', (locale) => {
    const table = strings[locale] as Record<string, string>
    const mismatched = Object.keys(table).filter((key) => {
      const localePlaceholders = placeholdersOf(table[key]!)
      const enPlaceholders = placeholdersOf(en[key] ?? '')
      // Singular-count keys ("...One") may drop the numeral entirely in
      // languages that express "one" grammatically (e.g. ar/he), so a
      // missing placeholder is fine there - an extra one is not.
      if (key.endsWith('One')) {
        return localePlaceholders.some((p) => !enPlaceholders.includes(p))
      }
      return localePlaceholders.join(',') !== enPlaceholders.join(',')
    })
    expect(mismatched).toEqual([])
  })
  it('has no duplicate values that suggest an untranslated copy-paste between zh and en', () => {
    const zh = strings.zh as Record<string, string>
    const identical = referenceKeys.filter((key) => zh[key] === en[key])
    // a few shared strings (brand names, "PDF", "OK"-style tokens) are fine
    expect(identical.length).toBeLessThan(referenceKeys.length / 4)
  })
})
