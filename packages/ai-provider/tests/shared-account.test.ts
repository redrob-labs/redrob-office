import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { REDROB_ENGINE_ID, defaultAiSettings, type AiSettings } from '../src/index'
import {
  REDROB_SHARED_DIR_ENV,
  parseSharedAccount,
  readSharedAccount,
  resetSharedAccountCache,
  resolveRedrobKey,
  sharedAccountPath,
  stripLauncherKey,
  withSharedAccountFallback,
} from '../src/shared-account'

/**
 * Everything below runs against a temp directory named through REDROB_SHARED_DIR, so
 * the real ~/.config is never read or written. Test key values are obviously fake.
 */
let dir: string
let savedEnv: string | undefined

const SHARED_KEY = 'rk-test-shared-from-launcher'
const OWN_KEY = 'rk-test-own-key-of-this-app'

function writeShared(body: unknown): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'account.json'), JSON.stringify(body), 'utf8')
  resetSharedAccountCache()
}

function removeShared(): void {
  rmSync(join(dir, 'account.json'), { force: true })
  resetSharedAccountCache()
}

/** Settings as the app stores them: the Redrob engine slot holds `apiKey` (or nothing). */
function ownSettings(apiKey: string): AiSettings {
  const base = defaultAiSettings()
  return {
    ...base,
    providers: { ...base.providers, [REDROB_ENGINE_ID]: { apiKey, model: '' } },
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'redrob-shared-'))
  savedEnv = process.env[REDROB_SHARED_DIR_ENV]
  process.env[REDROB_SHARED_DIR_ENV] = dir
  resetSharedAccountCache()
})

afterEach(() => {
  if (savedEnv === undefined) delete process.env[REDROB_SHARED_DIR_ENV]
  else process.env[REDROB_SHARED_DIR_ENV] = savedEnv
  rmSync(dir, { recursive: true, force: true })
  resetSharedAccountCache()
})

describe('sharedAccountPath', () => {
  it('honours REDROB_SHARED_DIR on every platform, keeping the file name', () => {
    for (const platform of ['linux', 'darwin', 'win32'] as const) {
      expect(
        sharedAccountPath({ env: { REDROB_SHARED_DIR: '/x/shared' }, platform, home: '/h' }),
      ).toBe(join('/x/shared', 'account.json'))
    }
  })

  it('resolves the per-platform default directory', () => {
    expect(sharedAccountPath({ env: {}, platform: 'linux', home: '/home/u' })).toBe(
      '/home/u/.config/redrob-shared/account.json',
    )
    expect(
      sharedAccountPath({ env: { XDG_CONFIG_HOME: '/xdg' }, platform: 'linux', home: '/home/u' }),
    ).toBe('/xdg/redrob-shared/account.json')
    expect(sharedAccountPath({ env: {}, platform: 'darwin', home: '/Users/u' })).toBe(
      '/Users/u/Library/Application Support/ai.redrob.shared/account.json',
    )
    expect(
      sharedAccountPath({
        env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' },
        platform: 'win32',
        home: 'C:\\Users\\u',
      }),
    ).toBe(join('C:\\Users\\u\\AppData\\Roaming', 'Redrob', 'Shared', 'account.json'))
  })
})

describe('parseSharedAccount', () => {
  it('treats a missing or empty apiKey as not signed in', () => {
    expect(parseSharedAccount('{}')).toBeNull()
    expect(parseSharedAccount('{"apiKey": ""}')).toBeNull()
    expect(parseSharedAccount('{"apiKey": "   "}')).toBeNull()
    expect(parseSharedAccount('not json')).toBeNull()
    expect(parseSharedAccount('[]')).toBeNull()
  })

  it('reads the launcher fields', () => {
    expect(
      parseSharedAccount(
        JSON.stringify({
          apiKey: SHARED_KEY,
          apiKeyName: 'laptop',
          accountName: 'Redrob Workspace',
          apiBaseUrl: 'https://console.redrob.ai/api/backend/v1',
        }),
      ),
    ).toEqual({
      apiKey: SHARED_KEY,
      apiKeyName: 'laptop',
      accountName: 'Redrob Workspace',
      apiBaseUrl: 'https://console.redrob.ai/api/backend/v1',
    })
  })
})

describe('the shared launcher key is the fallback', () => {
  it('no key anywhere -> not signed in', () => {
    expect(readSharedAccount()).toBeNull()
    expect(resolveRedrobKey('')).toEqual({ apiKey: '', source: 'none' })
    const settings = withSharedAccountFallback(ownSettings(''))
    expect(settings.providers[REDROB_ENGINE_ID]?.apiKey).toBe('')
    expect(settings.redrobKeySource).toBe('none')
    expect(settings.launcherAccountName).toBeUndefined()
  })

  it('shared file only -> used and flagged as the launcher', () => {
    writeShared({ apiKey: SHARED_KEY, accountName: 'Redrob Workspace', apiKeyName: 'laptop' })
    expect(resolveRedrobKey(undefined)).toEqual({
      apiKey: SHARED_KEY,
      source: 'launcher',
      accountName: 'Redrob Workspace',
      apiKeyName: 'laptop',
    })
    const settings = withSharedAccountFallback(ownSettings(''))
    expect(settings.providers[REDROB_ENGINE_ID]?.apiKey).toBe(SHARED_KEY)
    expect(settings.redrobKeySource).toBe('launcher')
    expect(settings.launcherAccountName).toBe('Redrob Workspace')
  })

  it('own key + shared file -> the own key wins', () => {
    writeShared({ apiKey: SHARED_KEY })
    expect(resolveRedrobKey(OWN_KEY)).toEqual({ apiKey: OWN_KEY, source: 'own' })
    const settings = withSharedAccountFallback(ownSettings(OWN_KEY))
    expect(settings.providers[REDROB_ENGINE_ID]?.apiKey).toBe(OWN_KEY)
    expect(settings.redrobKeySource).toBe('own')
    expect(settings.launcherAccountName).toBeUndefined()
  })

  it('is read at use time: a launcher sign-in or sign-out shows up on the next read', () => {
    expect(resolveRedrobKey('').source).toBe('none')
    writeShared({ apiKey: SHARED_KEY })
    expect(resolveRedrobKey('').source).toBe('launcher')
    removeShared()
    expect(resolveRedrobKey('')).toEqual({ apiKey: '', source: 'none' })
  })

  it('shared file removed -> not signed in', () => {
    writeShared({ apiKey: SHARED_KEY })
    removeShared()
    const settings = withSharedAccountFallback(ownSettings(''))
    expect(settings.providers[REDROB_ENGINE_ID]?.apiKey).toBe('')
    expect(settings.redrobKeySource).toBe('none')
  })
})

describe('disconnect removes only the app key; the shared file survives', () => {
  it('never persists the launcher key as the app own key; the shared file is untouched', () => {
    writeShared({ apiKey: SHARED_KEY, accountName: 'Redrob Workspace' })
    // What the settings pane holds after a read: the launcher key filled in and flagged.
    const shown = withSharedAccountFallback(ownSettings(''))
    // What a save (or a "disconnect" that clears the field) is allowed to write.
    const toWrite = stripLauncherKey(shown)
    expect(toWrite.providers[REDROB_ENGINE_ID]?.apiKey).toBe('')
    expect(toWrite.redrobKeySource).toBeUndefined()
    expect(toWrite.launcherAccountName).toBeUndefined()
    // The shared file is untouched and still answers.
    expect(existsSync(join(dir, 'account.json'))).toBe(true)
    resetSharedAccountCache()
    expect(readSharedAccount()?.apiKey).toBe(SHARED_KEY)
  })

  it('strips a key equal to the shared key even without the flag, but keeps a real own key', () => {
    writeShared({ apiKey: SHARED_KEY })
    const echoed = ownSettings(SHARED_KEY)
    expect(stripLauncherKey(echoed).providers[REDROB_ENGINE_ID]?.apiKey).toBe('')
    const own = { ...ownSettings(OWN_KEY), redrobKeySource: 'own' as const }
    expect(stripLauncherKey(own).providers[REDROB_ENGINE_ID]?.apiKey).toBe(OWN_KEY)
    expect(stripLauncherKey(own).redrobKeySource).toBeUndefined()
  })

  it('clearing the own key while the shared file exists leaves the shared sign-in in place', () => {
    writeShared({ apiKey: SHARED_KEY })
    // Own key present: own wins.
    expect(withSharedAccountFallback(ownSettings(OWN_KEY)).redrobKeySource).toBe('own')
    // The person clears the field and saves: the app stores an empty own key...
    const written = stripLauncherKey({ ...ownSettings(''), redrobKeySource: 'own' })
    expect(written.providers[REDROB_ENGINE_ID]?.apiKey).toBe('')
    // ...and the next read falls back to the launcher, whose file was never touched.
    resetSharedAccountCache()
    expect(withSharedAccountFallback(written).redrobKeySource).toBe('launcher')
    expect(existsSync(join(dir, 'account.json'))).toBe(true)
  })
})
