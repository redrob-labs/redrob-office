/**
 * Moving a Redrob key from the old settings file into the engine, once. The Redrob slot in that file
 * is `genspark`, the id the port inherited (REDROB_ENGINE_ID).
 *
 * The rule being pinned: the key leaves the file only after the engine has it. A refused move leaves
 * the file as it was, so the key is never lost between the two.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/app', getPath: () => '/userData' }, ipcMain: { handle: vi.fn() } }))

const { moveStoredKey } = await import('../src/main/engine-custody')

const TARGET = { baseUrl: 'http://127.0.0.1:41234', username: 'redrob', password: 'p' }

function settingsFile(content: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'custody-')), 'ai-settings.json')
  writeFileSync(path, JSON.stringify(content))
  return path
}

describe('moving the stored key into the engine', () => {
  it('hands the key to the engine, then removes it from the file and keeps every other setting', async () => {
    const path = settingsFile({ provider: 'genspark', maxOutputTokens: 9000, providers: { genspark: { apiKey: ' rrk_old ', model: 'auto' } } })
    const connectKey = vi.fn(async () => {})
    expect(await moveStoredKey(TARGET, path, () => ({ connectKey }))).toBe(true)
    expect(connectKey).toHaveBeenCalledWith('redrob', 'rrk_old', 'Redrob Office')
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ provider: 'genspark', maxOutputTokens: 9000, providers: { genspark: { apiKey: '', model: 'auto' } } })
  })

  it('leaves the file untouched when the engine refuses the key', async () => {
    const original = { providers: { genspark: { apiKey: 'rrk_old', model: '' } } }
    const path = settingsFile(original)
    const connectKey = vi.fn(async () => Promise.reject(new Error('engine request failed')))
    await expect(moveStoredKey(TARGET, path, () => ({ connectKey }))).rejects.toThrow('engine request failed')
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(original)
  })

  it('does nothing without a file or without a key', async () => {
    const connectKey = vi.fn(async () => {})
    expect(await moveStoredKey(TARGET, '/no/such/ai-settings.json', () => ({ connectKey }))).toBe(false)
    expect(await moveStoredKey(TARGET, settingsFile({ providers: { genspark: { apiKey: '', model: '' } } }), () => ({ connectKey }))).toBe(false)
    expect(connectKey).not.toHaveBeenCalled()
  })
})
