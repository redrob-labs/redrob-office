import { deflateSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { Session, type Pos } from '@genoffice/hwp-editor'
import type { AttachmentMeta, CreateHangulDocumentRequest } from '../src/shared/ipc'
import { buildHwpx, createMediaSkill, imageSize, type MediaApi } from '../src/renderer/ai/media-skill'
import { createHangulDocument, sanitizeFileBase } from '../src/main/ai-ipc'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

beforeAll(() => initHwpCoreNode())

/** A real w×h RGB PNG. */
function png(w: number, h: number): Uint8Array {
  const crc = (buf: Buffer) => {
    let c = ~0
    for (const b of buf) {
      c ^= b
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    }
    return ~c >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x80)
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

function session(lines: string[]): Session {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  let p: Pos = { section: 0, para: 0, offset: 0 }
  lines.forEach((line, i) => {
    if (i > 0) p = s.text.split(p)
    p = s.text.insert(p, line)
  })
  return s
}

function api(over: Partial<MediaApi> = {}): MediaApi & { created: CreateHangulDocumentRequest[] } {
  const created: CreateHangulDocumentRequest[] = []
  return {
    created,
    imageSearch: async () => ({ images: [{ imageUrl: 'https://img.example/a.png', title: 'A', width: 40, height: 20 }] }),
    fetchImage: async () => ({ base64: b64(png(40, 20)), mime: 'image/png' }),
    generateImage: async () => ({ url: 'https://gen.example/x.png' }),
    createDocument: async (r) => (created.push(r), { ok: true, path: '/tmp/x.hwpx' }),
    readAttachment: async () => ({ ok: true, name: 'a.txt', totalChars: 5, offset: 0, text: 'hello' }),
    readAttachmentImage: async () => ({ ok: true, base64: b64(png(10, 10)), mime: 'image/png' }),
    ...over,
  }
}

function skill(s: Session | null, a = api(), attachments: AttachmentMeta[] = []) {
  const k = createMediaSkill({ getSession: () => s, api: a, getAttachments: () => attachments })
  return (name: string, input: Record<string, unknown>) => k.executeTool({ id: 'x', name, input })
}

describe('imageSize', () => {
  it('reads png, gif and jpeg headers', () => {
    expect(imageSize(png(321, 123))).toEqual({ width: 321, height: 123, ext: 'png' })
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x20, 0x00, 0, 0])
    expect(imageSize(gif)).toEqual({ width: 16, height: 32, ext: 'gif' })
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40, 0, 0, 0, 0, 0])
    expect(imageSize(jpeg)).toEqual({ width: 64, height: 48, ext: 'jpg' })
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})

describe('images', () => {
  it('inserts a downloaded image as its own centred paragraph, one undo step, and it saves', async () => {
    const s = session(['앞', '뒤'])
    const run = skill(s)
    const anchor = s.doc.nodeIdAt(0, 0)!
    const seq = s.changeSeq
    const r = await run('insert_image', { imageUrl: 'https://img.example/a.png', afterId: anchor })
    expect(r.isError).toBeFalsy()
    expect(s.changeSeq).toBe(seq + 1)
    expect(s.doc.paragraphCount(0)).toBe(3)
    const pics = s.doc.outline().sections[0]!.paragraphs[1]!.controls ?? []
    expect(pics.map((c) => c.kind)).toContain('picture')
    expect(JSON.parse(s.doc.raw.getParaPropertiesAt(0, 1)).alignment).toBe('center')
    const back = HwpCoreDocument.open(s.export('hwpx'))
    expect((back.outline().sections[0]!.paragraphs[1]!.controls ?? []).map((c) => c.kind)).toContain('picture')
    s.undo()
    expect(s.doc.paragraphCount(0)).toBe(2)
  })

  it('inserts an image attachment and refuses a text one', async () => {
    const s = session(['본문'])
    const atts: AttachmentMeta[] = [
      { path: '/x/a.png', name: 'a.png', ext: 'png', sizeBytes: 10 },
      { path: '/x/b.txt', name: 'b.txt', ext: 'txt', sizeBytes: 10 },
    ]
    const run = skill(s, api(), atts)
    expect((await run('insert_image', { attachmentIndex: 0 })).isError).toBeFalsy()
    expect((await run('insert_image', { attachmentIndex: 1 })).isError).toBe(true)
  })

  it('reports a search backend failure as an error, never as no results', async () => {
    const run = skill(session(['a']), api({ imageSearch: async () => ({ images: [], method: 'error', error: 'down' }) }))
    const r = await run('image_search', { query: 'seoul' })
    expect(r.isError).toBe(true)
    expect(r.output).toContain('service error')
  })

  it('surfaces generate_image gating errors from main', async () => {
    const run = skill(session(['a']), api({ generateImage: async () => ({ error: 'Redrob account is not logged in' }) }))
    expect((await run('generate_image', { prompt: 'a cat' })).output).toContain('not logged in')
  })
})

describe('create_document', () => {
  it('builds a real .hwpx from restricted HTML', () => {
    const bytes = buildHwpx('<h1>회의록</h1><p>참석자: <strong>홍길동</strong></p><ul><li>안건 하나</li></ul>')
    const doc = HwpCoreDocument.open(bytes)
    const texts = Array.from({ length: doc.paragraphCount(0) }, (_, i) => doc.text(0, i))
    expect(texts).toEqual(['회의록', '참석자: 홍길동', '• 안건 하나'])
    expect(JSON.parse(doc.raw.getStyleAt(0, 0)).name).toBe('개요 1')
  })

  it('sends hwpx bytes or html to main by type', async () => {
    const a = api()
    const run = skill(session(['a']), a)
    expect((await run('create_document', { title: '요약', content: '<p>내용</p>' })).isError).toBeFalsy()
    expect(a.created[0]!.type).toBe('hwpx')
    await run('create_document', { type: 'md', title: 'notes', content: '# Notes' })
    expect(a.created[1]).toEqual({ type: 'md', title: 'notes', content: '# Notes' })
  })

  it('main writes the .hwpx to a unique path and opens it; docx goes to the Docs hook', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hangul-create-'))
    const opened: string[] = []
    const bytes = buildHwpx('<p>본문</p>')
    writeFileSync(join(dir, '보고서.hwpx'), 'taken')
    const r = await createHangulDocument({ type: 'hwpx', title: '보고서', base64: b64(bytes) }, dir, { openGeneratedPath: (p) => (opened.push(p), true) })
    expect(r).toEqual({ ok: true, path: join(dir, '보고서-2.hwpx') })
    expect(opened).toEqual([join(dir, '보고서-2.hwpx')])
    expect(HwpCoreDocument.open(new Uint8Array(readFileSync(r.path!))).text(0, 0)).toBe('본문')
    const bad = await createHangulDocument({ type: 'hwpx', title: 'x', base64: b64(new Uint8Array([1, 2, 3])) }, dir, {})
    expect(bad.ok).toBe(false)
    const docx = await createHangulDocument({ type: 'docx', title: 'a/b', content: '<p>x</p>' }, dir, { createDocument: async (q) => ({ ok: true, path: q.title }) })
    expect(docx).toEqual({ ok: true, path: 'a_b' })
    expect(sanitizeFileBase('..')).toBe('Untitled')
  })
})

describe('attachments and context', () => {
  it('lists attachments in the context and reads text ones', async () => {
    const atts: AttachmentMeta[] = [{ path: '/x/a.txt', name: 'a.txt', ext: 'txt', sizeBytes: 5 }]
    const s = session(['a'])
    const k = createMediaSkill({ getSession: () => s, api: api(), getAttachments: () => atts })
    expect(k.buildContext!()).toContain('0 | a.txt | .txt')
    const r = await k.executeTool({ id: 'x', name: 'read_attachment', input: { index: 0 } })
    expect(r.output).toContain('hello')
    expect(r.output).toContain('(end of file)')
  })

  it('reads and edits a chart in a real document', async () => {
    // Upstream rhwp samples (not committed here: their licences vary). Set RHWP_SAMPLES to run.
    const dir = process.env.RHWP_SAMPLES ?? '/projects/sandbox/rhwp-upstream/samples'
    const file = 'issue5447/가로막대형_하나만있을떄_단일시리즈제목-대조군.hwpx'
    const { existsSync } = await import('node:fs')
    if (!existsSync(join(dir, file))) return
    const doc = HwpCoreDocument.open(new Uint8Array(readFileSync(join(dir, file))))
    const s = new Session(doc, 'hwpx')
    const list = JSON.parse(doc.raw.listCharts()) as Array<{ index: number }>
    expect(list.length).toBe(1)
    const run = skill(s)
    const data = JSON.parse((await run('read_chart', { index: list[0]!.index })).output) as { series: Array<{ name: string; values: string[] }> }
    const series = data.series.map((x) => ({ ...x, values: x.values.map(() => '7') }))
    const r = await run('edit_chart', { index: list[0]!.index, series })
    expect(r.isError).toBeFalsy()
    const after = JSON.parse(doc.raw.getChartDataByIndex(list[0]!.index)) as { series: Array<{ values: string[] }> }
    expect(after.series[0]!.values.every((v) => Number(v) === 7)).toBe(true)
    const bad = await run('edit_chart', { index: list[0]!.index, series: [] })
    expect(bad.isError).toBe(true)
  })

  it('insert_chart adds a native chart after a paragraph, which read_chart reads back and both formats keep', async () => {
    const s = session(['제1조 매출', '제2조 결론'])
    const run = skill(s)
    const afterId = s.doc.nodeIdAt(0, 0)!
    const r = await run('insert_chart', { kind: 'column', title: '분기별 매출', categories: ['1분기', '2분기', '3분기'], series: [{ name: '2026', values: [12, 18, 15] }], afterId })
    expect(r.isError, r.output).toBeFalsy()
    const list = JSON.parse(s.doc.raw.listCharts()) as Array<{ index: number; section: number; paragraph: number }>
    expect(list).toHaveLength(1)
    expect(list[0]!.paragraph).toBe(1)
    expect(r.output).toContain(`chart ${list[0]!.index}`)
    expect(s.doc.text(0, 2)).toBe('제2조 결론')
    const data = JSON.parse((await run('read_chart', { index: list[0]!.index })).output) as { labels: string[]; series: Array<{ name: string; values: string[] }> }
    expect(data.labels).toEqual(['1분기', '2분기', '3분기'])
    expect(data.series[0]!.values.map(Number)).toEqual([12, 18, 15])
    for (const f of ['hwpx', 'hwp'] as const) {
      const back = HwpCoreDocument.open(s.export(f))
      expect((JSON.parse(back.raw.listCharts()) as unknown[]).length, f).toBe(1)
    }
    // one undo step takes it all away
    s.undo()
    expect((JSON.parse(s.doc.raw.listCharts()) as unknown[]).length).toBe(0)
    expect(s.doc.text(0, 1)).toBe('제2조 결론')
  })

  it('insert_chart refuses made-up shapes: missing values, mismatched lengths, no categories', async () => {
    const run = skill(session(['본문']))
    expect((await run('insert_chart', { categories: ['a', 'b'], series: [{ values: [1] }] })).isError).toBe(true)
    expect((await run('insert_chart', { categories: ['a', 'b'], series: [{ values: [1, null] }] })).isError).toBe(true)
    expect((await run('insert_chart', { categories: [], series: [{ values: [] }] })).isError).toBe(true)
    expect((await run('insert_chart', { categories: ['a'], series: [] })).isError).toBe(true)
  })
})
