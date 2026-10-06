/**
 * The one-time move of an Office-held key into the engine, against a fake engine.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startFakeEngine, type FakeEngine } from '../../../packages/ai-provider/tests/fake-engine'

const userData = mkdtempSync(join(tmpdir(), 'engine-cred-'))
let engine: FakeEngine
let engineDown = false

vi.mock('electron', () => ({
  app: { getPath: () => userData, isPackaged: false },
  ipcMain: { handle: vi.fn() },
}))
vi.mock('../src/main/engine-lifecycle', () => ({
  getEngineTarget: async () => {
    if (engineDown) throw new Error('engine binary not found')
    return { baseUrl: engine.baseUrl, username: engine.username, password: engine.password }
  },
}))

const { migrateOfficeHeldKeys } = await import('../src/main/engine-credentials')
const file = join(userData, 'ai-settings.json')

beforeEach(async () => {
  engine = await startFakeEngine()
  engineDown = false
})
afterEach(async () => {
  await engine.close()
})

describe('migrateOfficeHeldKeys', () => {
  it('moves the stored key into the engine and leaves no key on disk', async () => {
    writeFileSync(file, JSON.stringify({ provider: 'genspark', maxOutputTokens: 9000, providers: { genspark: { apiKey: 'rrk_x_secret', model: '' } } }))
    const outcome = await migrateOfficeHeldKeys(() => undefined)
    expect(outcome).toEqual({ status: 'moved', integrations: ['redrob'] })
    expect(engine.keys).toEqual([{ integration: 'redrob', key: 'rrk_x_secret', label: 'Redrob Office' }])
    const after = readFileSync(file, 'utf8')
    expect(after).not.toContain('rrk_x_secret')
    expect(after).not.toMatch(/"apiKey":\s*"[^"]+"/)
    // other preferences survive
    expect(JSON.parse(after).maxOutputTokens).toBe(9000)
  })

  it('does nothing, and does not start the engine, when no key is stored', async () => {
    writeFileSync(file, JSON.stringify({ provider: 'genspark', providers: { genspark: { apiKey: '', model: '' } } }))
    engineDown = true
    expect(await migrateOfficeHeldKeys(() => undefined)).toEqual({ status: 'nothing' })
  })

  it('keeps the file untouched for a retry when the engine is not available', async () => {
    const before = JSON.stringify({ providers: { genspark: { apiKey: 'rrk_keep', model: '' } } })
    writeFileSync(file, before)
    engineDown = true
    const outcome = await migrateOfficeHeldKeys(() => undefined)
    expect(outcome.status).toBe('failed')
    expect(readFileSync(file, 'utf8')).toBe(before)
  })
})
