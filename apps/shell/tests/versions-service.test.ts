import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VERSIONS_CHANNELS } from '@genoffice/versions'
import { VersionStore } from '@genoffice/versions/store'
import { isHistoryPath, registerVersionsIpc } from '../src/main/versions-service'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rr-versions-ipc-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function setup() {
  const store = new VersionStore({ root: join(dir, 'versions') })
  const openPath = vi.fn()
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  registerVersionsIpc({ handle: (ch, fn) => handlers.set(ch, fn) }, { store, openPath })
  const call = (ch: string, ...args: unknown[]) => handlers.get(ch)!({}, ...args)
  return { store, openPath, call, handlers }
}

describe('isHistoryPath', () => {
  it('accepts absolute document paths only', () => {
    expect(isHistoryPath(join(dir, 'NDA.docx'))).toBe(true)
    expect(isHistoryPath('NDA.docx')).toBe(false)
    expect(isHistoryPath(join(dir, 'run.exe'))).toBe(false)
    expect(isHistoryPath(join(dir, 'a\u0000.docx'))).toBe(false)
    expect(isHistoryPath(42)).toBe(false)
  })
})

describe('registerVersionsIpc', () => {
  it('serves the four channels', () => {
    const { handlers } = setup()
    expect([...handlers.keys()].sort()).toEqual(Object.values(VERSIONS_CHANNELS).sort())
  })

  it('lists, names and restores a copy that opens in a tab', async () => {
    const { store, openPath, call } = setup()
    const doc = join(dir, 'NDA.docx')
    await writeFile(doc, 'now')
    const v = await store.record(doc, new TextEncoder().encode('then'), { by: 'felix' })
    expect(((await call(VERSIONS_CHANNELS.list, doc)) as unknown[]).length).toBe(1)
    expect(await call(VERSIONS_CHANNELS.name, doc, v.id, 'Signed')).toMatchObject({ name: 'Signed' })
    const copy = (await call(VERSIONS_CHANNELS.restore, doc, v.id)) as string
    expect(await readFile(copy, 'utf8')).toBe('then')
    expect(openPath).toHaveBeenCalledWith(copy)
    expect(await readFile(doc, 'utf8')).toBe('now')
  })

  it('refuses a path or id that is not one', async () => {
    const { call, openPath } = setup()
    expect(await call(VERSIONS_CHANNELS.list, 'relative.docx')).toEqual([])
    expect(await call(VERSIONS_CHANNELS.restore, join(dir, 'x.docx'), '../../etc')).toBeNull()
    expect(await call(VERSIONS_CHANNELS.name, join(dir, 'x.docx'), 'nope', 'x')).toBeNull()
    expect(openPath).not.toHaveBeenCalled()
  })

  it('records a visit and returns the previous one', async () => {
    const { call } = setup()
    const doc = join(dir, 'memo.docx')
    expect(await call(VERSIONS_CHANNELS.visit, doc)).toBeNull()
    expect(typeof (await call(VERSIONS_CHANNELS.visit, doc))).toBe('string')
  })
})
