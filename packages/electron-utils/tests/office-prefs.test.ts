import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OFFICE_PREFS,
  mergeOfficePrefs,
  normalizeOfficePrefs,
} from '../src/office-prefs'

describe('office prefs', () => {
  it('defaults to the simplified toolbar, Run, When it matters and Memory on', () => {
    expect(normalizeOfficePrefs(undefined)).toEqual({
      toolbar: 'simple',
      composerMode: 'run',
      factCheck: 'auto',
      challenge: 'auto',
      memory: true,
    })
    expect(normalizeOfficePrefs('nope')).toEqual(DEFAULT_OFFICE_PREFS)
    expect(normalizeOfficePrefs([1, 2])).toEqual(DEFAULT_OFFICE_PREFS)
  })

  it('keeps valid fields and drops malformed ones', () => {
    expect(
      normalizeOfficePrefs({ toolbar: 'classic', composerMode: 'fly', factCheck: 'always', memory: 'yes' }),
    ).toEqual({ ...DEFAULT_OFFICE_PREFS, toolbar: 'classic', factCheck: 'always' })
  })

  it('merges a partial change onto the current prefs, ignoring junk', () => {
    const current = { ...DEFAULT_OFFICE_PREFS, toolbar: 'classic' as const }
    expect(mergeOfficePrefs(current, { challenge: 'off', extra: 1 })).toEqual({
      ...current,
      challenge: 'off',
    })
    expect(mergeOfficePrefs(current, { toolbar: 'ribbon' })).toEqual(current)
    expect(mergeOfficePrefs(current, null)).toEqual(current)
  })
})
