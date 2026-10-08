// Tracked changes API (spec E5b, task 4.3, R8.1): list, add and remove HWPX
// revisions. Golden tests against files 한글 2024 writes, and the two-way
// accept/reject check in 한글 2024, wait for the Windows runner (P-1).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode, type ParagraphTarget } from '../src/node'

beforeAll(() => initHwpCoreNode())

const fixture = () => new Uint8Array(readFileSync(join(__dirname, 'fixtures/tracked-changes.hwpx')))
const body = (para: number): ParagraphTarget => ({ section: 0, para, cellPath: [] })

async function parts(b: Uint8Array) {
  const zip = await JSZip.loadAsync(b)
  return { section: await zip.file('Contents/section0.xml')!.async('string'), header: await zip.file('Contents/header.xml')!.async('string') }
}

describe('reading revisions', () => {
  it('lists the fixture’s insertion and deletion with authors and dates', () => {
    const d = HwpCoreDocument.open(fixture())
    expect(d.revisions()).toMatchObject([
      { id: 1, tcId: 1, kind: 'insert', author: '검토자', date: '2026-10-06T09:00:00Z', target: body(1), start: 5, end: 8, text: 'NEW' },
      { id: 2, tcId: 2, kind: 'delete', author: '검토자', date: '2026-10-06T09:01:00Z', target: body(1), start: 9, end: 12, text: 'OLD' },
    ])
    expect(d.revisions()[0]!.nodeId).toBe(d.nodeIdAt(0, 1))
  })

  it('a document without tracked changes has none', () => {
    const d = HwpCoreDocument.blank()
    d.insertText(0, 0, 0, '본문')
    expect(d.revisions()).toEqual([])
  })
})

describe('adding and removing revisions', () => {
  it('marks text as inserted by a new author and writes 한글’s form', async () => {
    const d = HwpCoreDocument.blank()
    d.insertText(0, 0, 0, '제1조 국민의 권리')
    const id = d.addRevision(body(0), 4, 7, 'insert', '홍길동', '2026-10-08T10:00:00Z')
    expect(d.revisions()).toMatchObject([{ id, kind: 'insert', author: '홍길동', text: '국민의', start: 4, end: 7 }])
    const { section, header } = await parts(d.export('hwpx'))
    // Marks may sit in their own <hp:t> elements (upstream's highlighter-mark layout); compare the joined text.
    const joined = section.replace(/<\/hp:t><hp:t>/g, '')
    expect(joined).toContain(`<hp:insertBegin Id="${id}" TcId="1"/>국민의<hp:insertEnd Id="${id}" TcId="1" paraend="0"/>`)
    expect(header).toContain('<hh:trackChange type="Insert" date="2026-10-08T10:00:00Z" authorID="1" hide="0" id="1"/>')
    expect(header).toContain('<hh:trackChangeAuthor name="홍길동" mark="1" color="#FF0000" id="1"/>')
    // and reads back
    expect(HwpCoreDocument.open(d.export('hwpx')).revisions()).toMatchObject([{ kind: 'insert', author: '홍길동', text: '국민의' }])
  })

  it('reuses an existing author and numbers new entries after the old ones', () => {
    const d = HwpCoreDocument.open(fixture())
    const id = d.addRevision(body(1), 0, 4, 'delete', '검토자', '2026-10-08T10:00:00Z')
    const r = d.revisions().find((x) => x.id === id)!
    expect(r).toMatchObject({ id: 3, tcId: 3, kind: 'delete', author: '검토자', text: 'NEXT' })
  })

  it('removes a revision’s marks and table entry, keeping the text', async () => {
    const d = HwpCoreDocument.open(fixture())
    d.removeRevision(2)
    expect(d.revisions().map((r) => r.id)).toEqual([1])
    expect(d.text(0, 1)).toBe('NEXT NEW OLDPARAGRAPH')
    const { section, header } = await parts(d.export('hwpx'))
    expect(section).not.toContain('deleteBegin')
    expect(header).not.toContain('type="Delete"')
    d.removeRevision(1)
    const after = await parts(d.export('hwpx'))
    expect(after.header).not.toContain('<hh:trackChanges')
    expect(() => d.removeRevision(1)).toThrow()
  })

  it('a revision’s range follows edits before it', () => {
    const d = HwpCoreDocument.open(fixture())
    d.insertText(0, 1, 0, '[앞] ')
    expect(d.revisions().map((r) => r.text)).toEqual(['NEW', 'OLD'])
  })
})
