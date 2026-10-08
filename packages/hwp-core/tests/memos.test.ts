// Memos (spec E4, task 4.1, R7.1): list, add, edit and remove in both
// formats, and the HWP 5.0 memo bodies that a save after an edit used to drop.
//
// Byte-level golden tests against files 한글 2024 writes, and the two-way 한글
// 2024 round trip, wait for the Windows runner (P-1). These tests pin what the
// engine writes against the forms 한글 is known to write (format research,
// finding 2; serializer/hwpx/field.rs).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode, type ParagraphTarget } from '../src/node'

beforeAll(() => initHwpCoreNode())

const body = (section: number, para: number): ParagraphTarget => ({ section, para, cellPath: [] })

function doc(): HwpCoreDocument {
  const d = HwpCoreDocument.blank()
  d.insertText(0, 0, 0, '제1조(목적) 이 법은 국민의 권리를 보장한다.')
  return d
}

async function sectionXml(bytes: Uint8Array): Promise<string> {
  return (await JSZip.loadAsync(bytes)).file('Contents/section0.xml')!.async('string')
}

describe('memos in a new document', () => {
  it('adds a memo over a range and lists it', () => {
    const d = doc()
    const id = d.addMemo(body(0, 0), 8, 10, '검토자', '용어 확인 필요')
    const [m] = d.memos()
    expect(m).toMatchObject({ fieldId: id, number: 1, author: '검토자', body: '용어 확인 필요', start: 8, end: 10, text: '이 ', target: body(0, 0) })
    expect(m!.nodeId).toBe(d.nodeIdAt(0, 0))
    // The text itself is unchanged.
    expect(d.text(0, 0)).toBe('제1조(목적) 이 법은 국민의 권리를 보장한다.')
  })

  it('writes HWPX the way 한글 does and reads it back', async () => {
    const d = doc()
    d.addMemo(body(0, 0), 10, 11, '검토자', '첫 줄\n둘째 줄')
    const xml = await sectionXml(d.export('hwpx'))
    expect(xml).toMatch(/<hp:fieldBegin [^>]*type="MEMO"/)
    for (const p of ['name="Command">MEMO/65535/1/', 'name="ID">memo1<', 'name="Number">1<', 'name="Author">검토자<', 'name="MemoShapeIDRef">65535<']) expect(xml).toContain(p)
    expect(xml).toMatch(/<hp:subList[^>]*>[\s\S]*첫 줄[\s\S]*둘째 줄[\s\S]*<\/hp:subList>/)
    const back = HwpCoreDocument.open(d.export('hwpx'))
    expect(back.memos()).toMatchObject([{ number: 1, author: '검토자', body: '첫 줄\n둘째 줄', text: '법' }])
    expect(back.text(0, 0)).toBe(d.text(0, 0))
  })

  it('writes HWP 5.0 with the memo body in the section tail and reads it back', () => {
    const d = doc()
    d.addMemo(body(0, 0), 10, 11, '검토자', '본문입니다')
    const back = HwpCoreDocument.open(d.export('hwp'))
    expect(back.memos()).toMatchObject([{ number: 1, author: '검토자', body: '본문입니다', text: '법' }])
    // The memo tail's root paragraph is not read back as a document paragraph.
    expect(back.paragraphCount(0)).toBe(d.paragraphCount(0))
    expect(back.text(0, 0)).toBe(d.text(0, 0))
  })

  it('a reply is a second memo on the same range, numbered next', () => {
    const d = doc()
    d.addMemo(body(0, 0), 10, 11, '검토자', '질문')
    // Two fields cannot share one exact range in the paragraph's field ranges; the reply anchors on the same text.
    const reply = d.addMemo(body(0, 0), 11, 12, '작성자', '답변')
    const memos = d.memos()
    expect(memos.map((m) => m.number)).toEqual([1, 2])
    expect(memos.find((m) => m.fieldId === reply)!.author).toBe('작성자')
  })

  it('edits and removes memos, keeping the annotated text', async () => {
    const d = doc()
    const id = d.addMemo(body(0, 0), 10, 11, '검토자', '처음')
    d.setMemoBody(id, '고친 내용')
    expect(d.memos()[0]!.body).toBe('고친 내용')
    expect(HwpCoreDocument.open(d.export('hwpx')).memos()[0]!.body).toBe('고친 내용')
    d.removeMemo(id)
    expect(d.memos()).toEqual([])
    expect(d.text(0, 0)).toBe('제1조(목적) 이 법은 국민의 권리를 보장한다.')
    expect(await sectionXml(d.export('hwpx'))).not.toContain('type="MEMO"')
  })

  it('typing before a memo moves its range with the text', () => {
    const d = doc()
    d.addMemo(body(0, 0), 10, 11, '검토자', '메모')
    d.insertText(0, 0, 0, '【신설】 ')
    const m = d.memos()[0]!
    expect(m.text).toBe('법')
    expect(m.start).toBe(15)
  })

  it('refuses an empty range', () => {
    const d = doc()
    expect(() => d.addMemo(body(0, 0), 3, 3, 'a', 'b')).toThrow()
  })
})

// Upstream rhwp samples (not committed: their licences vary). Set RHWP_SAMPLES to run.
const SAMPLES = process.env.RHWP_SAMPLES ?? '/projects/sandbox/rhwp-upstream/samples'
const hwp5 = join(SAMPLES, 'issue5169_viewtext_changetracking.hwp')
const hwpx = join(SAMPLES, 'hwpx/aift.hwpx')

describe.skipIf(!existsSync(hwp5))('memos 한글 wrote in HWP 5.0 (upstream sample)', () => {
  it('reads both memo bodies and authors', () => {
    const d = HwpCoreDocument.open(new Uint8Array(readFileSync(hwp5)))
    const memos = d.memos()
    // Document order: both annotate the same cell text; 한글 wrote number 3 first.
    expect(memos.map((m) => [m.number, m.author]).sort()).toEqual([
      [1, 'MOFA'],
      [3, 'User'],
    ])
    expect(memos.every((m) => m.body.length > 0)).toBe(true)
    expect(memos[0]!.target.cellPath.length).toBe(1)
  })

  it('keeps memo bodies through an edit and an HWP save (they were dropped before E4)', () => {
    const d = HwpCoreDocument.open(new Uint8Array(readFileSync(hwp5)))
    const before = d.memos().map((m) => m.body)
    d.insertText(0, 1, 0, '편집 ')
    const back = HwpCoreDocument.open(d.export('hwp'))
    expect(back.memos().map((m) => m.body)).toEqual(before)
    expect(back.paragraphCount(0)).toBe(d.paragraphCount(0))
  })

  it('keeps memo bodies when converted to HWPX', async () => {
    const d = HwpCoreDocument.open(new Uint8Array(readFileSync(hwp5)))
    const before = d.memos().map((m) => m.body)
    const out = d.export('hwpx')
    expect(HwpCoreDocument.open(out).memos().map((m) => m.body)).toEqual(before)
    expect(await sectionXml(out)).toContain(before[0]!.trim().slice(0, 6))
  })
})

describe.skipIf(!existsSync(hwpx))('memos 한글 wrote in HWPX (upstream sample)', () => {
  it('lists them and keeps them through a save', () => {
    const d = HwpCoreDocument.open(new Uint8Array(readFileSync(hwpx)))
    const memos = d.memos()
    expect(memos.map((m) => m.number)).toEqual([1, 2])
    const back = HwpCoreDocument.open(d.export('hwpx'))
    expect(back.memos().map((m) => [m.number, m.author, m.body])).toEqual(memos.map((m) => [m.number, m.author, m.body]))
  })
})
