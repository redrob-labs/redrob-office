import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus } from '@genoffice/hwp-editor'
import { HwpPasswordError, base64ToBytes, newDocument, openDocument, saveDocument, trackedChanges, type HostWriter } from '../src/renderer/next/document'

beforeAll(() => initHwpCoreNode())

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, name)))
const SAMPLE = fixture('fixtures/sample.hwpx')
const TRACKED = fixture('../../../packages/hwp-core/tests/fixtures/tracked-changes.hwpx')

function host(result: Awaited<ReturnType<HostWriter['save']>> = { ok: true, path: '/docs/a.hwpx' }) {
  const writes: Array<{ bytes: Uint8Array; format: string; mode: string }> = []
  const h: HostWriter = {
    save: vi.fn(async (r) => {
      writes.push({ bytes: base64ToBytes(r.base64), format: r.format, mode: r.mode })
      return result
    }),
  }
  return { h, writes }
}

describe('open and save', () => {
  it('opens HWPX, edits, saves in place and the bytes reopen with the edit', async () => {
    const opened = await openDocument(SAMPLE, 'sample.hwpx')
    expect(opened.format).toBe('hwpx')
    expect(opened.trackedChanges).toBe(false)
    const bus = new CommandBus(opened.session)
    opened.session.select({ anchor: { section: 0, para: 1, offset: 0 }, head: { section: 0, para: 1, offset: 0 } })
    bus.run('edit:insert-text', { text: '수정 ' })
    expect(opened.session.dirty).toBe(true)
    const { h, writes } = host()
    expect(await saveDocument(opened, h, 'save')).toEqual({ saved: true, path: '/docs/a.hwpx', format: 'hwpx' })
    expect(opened.session.dirty).toBe(false)
    const back = HwpCoreDocument.open(writes[0]!.bytes)
    expect(back.text(0, 1)).toBe('수정 NEXT PARAGRAPH')
  })

  it('saves .hwp as .hwp, and a canceled dialog keeps the document dirty', async () => {
    const d = HwpCoreDocument.blank()
    d.insertText(0, 0, 0, '공문')
    const opened = await openDocument(d.export('hwp'), 'gov.hwp')
    expect(opened.format).toBe('hwp')
    expect(opened.trackedChanges).toBe('unknown')
    new CommandBus(opened.session).run('edit:insert-text', { text: '!' })
    const { h } = host({ ok: true, canceled: true })
    expect(await saveDocument(opened, h, 'saveAs')).toEqual({ saved: false, reason: 'canceled' })
    expect(opened.session.dirty).toBe(true)
  })

  it('a failed write throws and keeps the document dirty', async () => {
    const opened = await openDocument(SAMPLE, 'sample.hwpx')
    new CommandBus(opened.session).run('edit:insert-text', { text: 'x' })
    const { h } = host({ ok: false, error: 'EACCES' })
    await expect(saveDocument(opened, h, 'save')).rejects.toThrow('EACCES')
    expect(opened.session.dirty).toBe(true)
  })

  it('typing during the write keeps the document dirty', async () => {
    const opened = await openDocument(SAMPLE, 'sample.hwpx')
    const bus = new CommandBus(opened.session)
    bus.run('edit:insert-text', { text: 'a' })
    const h: HostWriter = {
      save: async () => {
        bus.run('edit:insert-text', { text: 'b' }) // lands while the write is in flight
        return { ok: true, path: '/docs/a.hwpx' }
      },
    }
    await saveDocument(opened, h, 'save')
    expect(opened.session.dirty).toBe(true)
  })

  it('keeps password protection and reports a missing password', async () => {
    const d = HwpCoreDocument.blank()
    d.insertText(0, 0, 0, '대외비')
    const locked = d.export('hwp', 'pw')
    await expect(openDocument(locked, 'secret.hwp')).rejects.toBeInstanceOf(HwpPasswordError)
    const opened = await openDocument(locked, 'secret.hwp', 'pw')
    const { h, writes } = host({ ok: true, path: '/docs/secret.hwp' })
    await saveDocument(opened, h, 'save')
    expect(() => HwpCoreDocument.open(writes[0]!.bytes)).toThrow(HwpPasswordError)
    expect(HwpCoreDocument.open(writes[0]!.bytes, 'pw').info().encrypted).toBe(true)
  })

  it('an untitled document saves as HWPX', async () => {
    const opened = newDocument()
    new CommandBus(opened.session).run('edit:insert-text', { text: '새 문서' })
    const { h, writes } = host({ ok: true, path: '/docs/새 문서.hwpx' })
    await saveDocument(opened, h, 'save')
    expect(writes[0]!.format).toBe('hwpx')
  })
})

describe('tracked changes (E5a)', () => {
  it('detects HWPX revision marks', async () => {
    expect(await trackedChanges(TRACKED, 'hwpx')).toBe(true)
    expect(await trackedChanges(SAMPLE, 'hwpx')).toBe(false)
  })

  it('saves in place as HWPX and the saved file still carries the marks', async () => {
    const opened = await openDocument(TRACKED, 'review.hwpx')
    expect(opened.trackedChanges).toBe(true)
    const { h, writes } = host({ ok: true, path: '/docs/review.hwpx' })
    expect(await saveDocument(opened, h, 'save')).toMatchObject({ saved: true })
    const zip = await JSZip.loadAsync(writes[0]!.bytes)
    expect(await zip.file('Contents/section0.xml')!.async('string')).toMatch(/<hp:deleteBegin [^>]*\/>OLD<hp:deleteEnd/)
  })

  it('refuses converting a document with tracked changes to .hwp', async () => {
    const opened = await openDocument(TRACKED, 'review.hwpx')
    const { h, writes } = host({ ok: true, path: '/docs/review.hwp' })
    expect(await saveDocument(opened, h, 'saveAs', 'hwp')).toEqual({ saved: false, reason: 'tracked-changes' })
    expect(writes).toHaveLength(0)
  })
})
