import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { catchUpItems, restoredCopyName, thin, type VersionInfo } from '../src'
import { VersionStore, docKey } from '../src/store'

const DAY = 86_400_000
const v = (id: string, at: number, name?: string): VersionInfo => ({
  id,
  at: new Date(at).toISOString(),
  by: 'felix',
  sha256: id.padEnd(64, '0').slice(0, 64),
  size: 1,
  ...(name ? { name } : {}),
})

describe('thin', () => {
  const now = new Date('2026-10-05T12:00:00Z').getTime()
  it('keeps the last day, one a day for a month, one a week after, and every named version', () => {
    const versions = [
      v('a', now - 60 * DAY, 'First draft'),
      v('b', now - 59.5 * DAY),
      v('c', now - 59.4 * DAY),
      v('d', now - 3.5 * DAY),
      v('e', now - 3.2 * DAY),
      v('f', now - 2 * 3600_000),
      v('g', now - 3600_000),
    ]
    const kept = thin(versions, new Date(now)).map((x) => x.id)
    expect(kept).toEqual(['a', 'c', 'e', 'f', 'g'])
  })

  it('caps unnamed versions but never drops the newest', () => {
    const many = Array.from({ length: 10 }, (_, i) => v(`v${i}`, now - (10 - i) * 1000))
    expect(thin(many, new Date(now), 3).map((x) => x.id)).toEqual(['v7', 'v8', 'v9'])
  })
})

describe('restoredCopyName', () => {
  it('names the copy after the version time, beside the original', () => {
    expect(restoredCopyName('NDA.docx', '2026-10-05T09:14:00Z')).toBe('NDA (version 2026-10-05 09.14).docx')
    expect(restoredCopyName('notes', 'nope')).toBe('notes (version earlier)')
  })
})

describe('catchUpItems', () => {
  const since = '2026-10-04T16:20:00Z'
  it('lists what others did since the last visit, once per thing', () => {
    const items = catchUpItems({
      since,
      me: 'Felix Kim',
      comments: [
        { id: '1', author: 'Jae Gardner', date: '2026-10-04T18:32:00Z', text: 'Delaware?' },
        { id: '2', author: 'Felix Kim', date: '2026-10-04T19:00:00Z', text: 'mine' },
        { id: '3', author: 'Seunghyun Seok', date: '2026-10-03T10:00:00Z', text: 'old' },
        { id: '4', author: 'Jae Gardner', date: '2026-10-04T18:35:00Z', text: 'Two is standard', parentId: '3' },
      ],
      revisions: [
        { kind: 'ins', author: 'Jae Gardner', date: '2026-10-04T18:40:00Z', at: 10 },
        { kind: 'del', author: 'Jae Gardner', date: '2026-10-04T18:40:00Z', at: 12 },
        { kind: 'del', author: 'Felix Kim', date: '2026-10-04T18:41:00Z', at: 20 },
      ],
      waitingFigures: 2,
    })
    expect(items).toEqual([
      { kind: 'comment', author: 'Jae Gardner', text: 'Delaware?', commentId: '1', reply: false },
      { kind: 'comment', author: 'Jae Gardner', text: 'Two is standard', commentId: '3', reply: true },
      { kind: 'suggestion', author: 'Jae Gardner', count: 2, at: 10 },
      { kind: 'figures', count: 2 },
    ])
  })

  it('says nothing on a first visit', () => {
    expect(catchUpItems({ since: null, me: null, comments: [{ id: '1', author: 'x', date: since, text: 't' }], revisions: [], waitingFigures: 3 })).toEqual([])
  })
})

describe('VersionStore', () => {
  let dir = ''
  let clock = new Date('2026-10-05T09:00:00Z').getTime()
  const now = () => new Date(clock)
  beforeEach(async () => {
    clock = new Date('2026-10-05T09:00:00Z').getTime()
    dir = await mkdtemp(join(tmpdir(), 'rr-versions-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('records saves, ignores the same bytes twice, stores bytes once, and lists newest first', async () => {
    const store = new VersionStore({ root: join(dir, 'versions'), now })
    const doc = join(dir, 'NDA.docx')
    const a = await store.record(doc, new Uint8Array([1, 2, 3]), { by: 'felix' })
    expect(await store.record(doc, new Uint8Array([1, 2, 3]), { by: 'felix' })).toEqual(a)
    clock += 60_000
    const b = await store.record(doc, new Uint8Array([4, 5]), { by: 'felix', auto: true })
    expect((await store.list(doc)).map((x) => x.id)).toEqual([b.id, a.id])
    expect(b.auto).toBe(true)
    expect(Array.from((await store.read(doc, a.id))!)).toEqual([1, 2, 3])
    const files = await readdir(join(dir, 'versions', docKey(doc)))
    expect(files.filter((f) => f.endsWith('.bin'))).toHaveLength(2)
    // no path appears in any stored file name
    expect(files.some((f) => f.includes('NDA'))).toBe(false)
  })

  it('names a version and restores it as a copy beside the document, leaving the document alone', async () => {
    const store = new VersionStore({ root: join(dir, 'versions'), now })
    const doc = join(dir, 'NDA.docx')
    await writeFile(doc, 'current')
    const a = await store.record(doc, new TextEncoder().encode('first draft'), { by: 'felix' })
    expect((await store.name(doc, a.id, '  First   draft '))!.name).toBe('First draft')
    expect(await store.name(doc, 'missing', 'x')).toBeNull()
    const copy = (await store.restoreCopy(doc, a.id))!
    expect(copy).toBe(join(dir, 'NDA (version 2026-10-05 09.00).docx'))
    expect(await readFile(copy, 'utf8')).toBe('first draft')
    expect(await readFile(doc, 'utf8')).toBe('current')
    const second = (await store.restoreCopy(doc, a.id))!
    expect(second).toBe(join(dir, 'NDA (version 2026-10-05 09.00) (2).docx'))
  })

  it('remembers the last visit per document', async () => {
    const store = new VersionStore({ root: join(dir, 'versions'), now })
    const doc = join(dir, 'memo.docx')
    expect(await store.lastVisit(doc)).toBeNull()
    expect(await store.markVisit(doc)).toBeNull()
    clock += DAY
    expect(await store.markVisit(doc)).toBe('2026-10-05T09:00:00.000Z')
    expect(await store.lastVisit(doc)).toBe(new Date(clock).toISOString())
  })
})
