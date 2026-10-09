// Media and shared tools for the Hangul AI (spec task 3.4): images (search,
// generate, insert), charts (read and edit the data of existing charts),
// attachments, and create_document. Main-process work goes through an
// injected API (window.hangulApi in the app), so the tools run against a real
// session in tests.
//
// Chart creation waits for an engine extension (Phase 2 charts): the engine
// can read and rewrite chart data but not build a new chart object.
import type { AgentSkill, AgentToolCall, ToolExecution } from '@genoffice/agent-core'
import { HwpCoreDocument } from '@genoffice/hwp-core'
import { Session, pictureSize, type Pos } from '@genoffice/hwp-editor'
import type { AttachmentMeta, HangulApi } from '../../shared/ipc'
import { ATTACHMENT_IMAGE_EXTS } from '../../shared/ipc'
import { NodeError, parseBlocks, requirePos, writeBlocks } from './blocks'

export type MediaApi = Pick<HangulApi, 'imageSearch' | 'fetchImage' | 'generateImage' | 'createDocument' | 'readAttachment' | 'readAttachmentImage'>

const READ_CHUNK_CHARS = 24_000

// ── Image size from the bytes (no DOM decode, so it runs in main, tests and the renderer) ──

export function imageSize(bytes: Uint8Array): { width: number; height: number; ext: 'png' | 'jpg' | 'gif' | 'webp' } | null {
  const b = bytes
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!
  const u16le = (i: number) => b[i]! | (b[i + 1]! << 8)
  const u32be = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { width: u32be(16), height: u32be(20), ext: 'png' }
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: u16le(6), height: u16le(8), ext: 'gif' }
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const kind = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!)
    if (kind === 'VP8X') return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)), ext: 'webp' }
    if (kind === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff, ext: 'webp' }
    if (kind === 'VP8L') {
      const v = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
      return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff), ext: 'webp' }
    }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null
      const marker = b[i + 1]!
      const len = u16be(i + 2)
      // SOF0–SOF15 except DHT (c4), JPG (c8) and DAC (cc)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: u16be(i + 7), height: u16be(i + 5), ext: 'jpg' }
      i += 2 + len
    }
  }
  return null
}

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const toBase64 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Insert a picture as its own centred paragraph after the anchor (or at the selection's paragraph). One undo step. */
export function insertImageBytes(s: Session, bytes: Uint8Array, opts: { afterId?: number; description?: string; widthPercent?: number }): { node: number | null } {
  const size = imageSize(bytes)
  if (!size || !size.width || !size.height) throw new NodeError('the image could not be read (png, jpg, gif or webp only)')
  if (size.ext === 'webp') throw new NodeError('webp images cannot be embedded in a 한글 document; use a png or jpg result')
  let node: number | null = null
  s.group('ai:insert-image', () => {
    const anchor: Pos = opts.afterId !== undefined ? requirePos(s, opts.afterId) : { ...s.selection.head, offset: 0 }
    if (anchor.cell) throw new NodeError('images can be inserted after body paragraphs only')
    const end = { ...anchor, offset: s.text.length(anchor) }
    const p = s.text.split(end)
    // Natural size (96 dpi) shrunk to the body width; widthPercent asks for a share of the body width instead.
    let { width, height } = pictureSize(s, size.width, size.height, p.section)
    if (opts.widthPercent !== undefined) {
      const full = pictureSize(s, size.width * 1000, size.height * 1000, p.section)
      const pct = Math.max(5, Math.min(100, opts.widthPercent)) / 100
      width = Math.round(full.width * pct)
      height = Math.round(full.height * pct)
    }
    const r = JSON.parse(s.doc.raw.insertPicture(p.section, p.para, 0, '[]', bytes, width, height, size.width, size.height, size.ext, opts.description ?? '')) as { ok?: boolean; error?: string; paraIdx?: number }
    if (r.ok === false) throw new Error(`insertPicture: ${r.error}`)
    const para = Number(r.paraIdx ?? p.para)
    s.doc.raw.applyParaFormat(p.section, para, JSON.stringify({ alignment: 'center' }))
    node = s.doc.nodeIdAt(p.section, para)
    const q = { section: p.section, para, offset: 1 }
    return { anchor: q, head: q }
  }, 'ai')
  return { node }
}

const CHART_KINDS = ['column', 'bar', 'line', 'pie'] as const

/**
 * Insert a native 한글 chart as its own centred paragraph after a paragraph
 * (the engine's chart creation, which both formats save). One undo step.
 */
export function insertChartAt(
  s: Session,
  spec: { kind?: unknown; title?: unknown; categories?: unknown; series?: unknown },
  opts: { afterId?: number } = {},
): { node: number | null; section: number; para: number } {
  const kind = CHART_KINDS.includes(spec.kind as (typeof CHART_KINDS)[number]) ? (spec.kind as (typeof CHART_KINDS)[number]) : 'column'
  const categories = Array.isArray(spec.categories) ? spec.categories.map((c) => String(c)) : []
  const rawSeries = Array.isArray(spec.series) ? (spec.series as Array<{ name?: unknown; values?: unknown }>) : []
  if (!categories.length) throw new NodeError('categories must not be empty')
  if (!rawSeries.length) throw new NodeError('give at least one series')
  const series = rawSeries.slice(0, kind === 'pie' ? 1 : rawSeries.length).map((x, i) => {
    const values = Array.isArray(x.values) ? x.values.map((v) => (v === null || v === '' ? Number.NaN : Number(v))) : []
    if (values.length !== categories.length) throw new NodeError(`series ${i + 1} needs one value per category (${categories.length})`)
    if (values.some((v) => !Number.isFinite(v))) throw new NodeError(`series ${i + 1} has a value that is not a number; charts in 한글 need every value`)
    return { name: String(x.name ?? `Series ${i + 1}`), values }
  })
  let node: number | null = null
  let at = { section: 0, para: 0 }
  s.group('ai:insert-chart', () => {
    const anchor: Pos = opts.afterId !== undefined ? requirePos(s, opts.afterId) : { ...s.selection.head, offset: 0 }
    if (anchor.cell) throw new NodeError('charts can be inserted after body paragraphs only')
    const p = s.text.split({ ...anchor, offset: s.text.length(anchor) })
    const r = s.doc.insertChart(p.section, p.para, 0, { kind, categories, series, ...(spec.title ? { title: String(spec.title) } : {}) })
    s.doc.raw.applyParaFormat(p.section, r.paraIdx, JSON.stringify({ alignment: 'center' }))
    node = s.doc.nodeIdAt(p.section, r.paraIdx)
    at = { section: p.section, para: r.paraIdx }
    const q = { section: p.section, para: r.paraIdx, offset: 1 }
    return { anchor: q, head: q }
  }, 'ai')
  return { node, ...at }
}

/** Build a new .hwpx from restricted HTML with the engine's blank 한글 template. */
export function buildHwpx(html: string): Uint8Array {
  const blocks = parseBlocks(html)
  if (!blocks.length) throw new NodeError('content has no blocks')
  const doc = HwpCoreDocument.blank()
  try {
    // A throwaway session gives writeBlocks its positions.
    const s = new Session(doc, 'hwpx')
    writeBlocks(s, { section: 0, para: 0, offset: 0 }, blocks, new Map(), null)
    return doc.export('hwpx')
  } finally {
    doc.dispose()
  }
}

interface ChartEntry {
  index: number
  section: number
  paragraph: number
  control: number
  container?: unknown
}

export const MEDIA_TOOLS = [
  {
    name: 'image_search',
    description: 'Search the web for photos and illustrations. Returns image URLs to pass to insert_image. English keywords work best.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'integer' } }, required: ['query'] },
  },
  {
    name: 'insert_image',
    description: 'Insert an image as its own centred paragraph after a paragraph (Node id), sized to fit the page width. Source: imageUrl from image_search or generate_image, or attachmentIndex of an image attachment.',
    inputSchema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string' },
        attachmentIndex: { type: 'integer' },
        afterId: { type: 'integer', description: 'Node id; default the paragraph at the caret' },
        widthPercent: { type: 'integer', description: 'percent of the page body width, default 100' },
        description: { type: 'string', description: 'alternative text' },
      },
    },
  },
  {
    name: 'generate_image',
    description: 'Generate an illustration from a detailed English prompt. Returns an imageUrl for insert_image. Needs the Redrob login and cloud tools on.',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, aspectRatio: { type: 'string', enum: ['1:1', '4:3', '3:4', '16:9', '9:16'] } }, required: ['prompt'] },
  },
  {
    name: 'insert_chart',
    description:
      'Insert a new native 한글 chart as its own centred paragraph after a paragraph (Node id). Data must be real: from the document, the user, or web_search results. Never make up numbers. Pie charts use only the first series.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['column', 'bar', 'line', 'pie'], description: 'column (default), bar (horizontal), line, pie' },
        title: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' }, description: 'labels on the category axis, or pie slices' },
        series: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'number' }, description: 'one per category' } }, required: ['values'] },
        },
        afterId: { type: 'integer', description: 'Node id; default the paragraph at the caret' },
      },
      required: ['categories', 'series'],
    },
  },
  {
    name: 'read_chart',
    description: 'Read the data of a chart in the document: labels and series with their values. index comes from the chart list in the context.',
    inputSchema: { type: 'object', properties: { index: { type: 'integer' } }, required: ['index'] },
  },
  {
    name: 'edit_chart',
    description: 'Replace the data of an existing chart, in the shape read_chart returns: {labels, series:[{name, values}]}. Values are numbers as strings. Same series and point counts unless structure=true.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer' },
        labels: { type: 'array', items: { type: 'string' } },
        series: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'string' } } }, required: ['values'] } },
        structure: { type: 'boolean', description: 'allow adding or removing series and points' },
      },
      required: ['index', 'series'],
    },
  },
  {
    name: 'create_document',
    description:
      'Create a NEW separate document and open it in a new tab, instead of writing into this one. type hwpx (default) takes the same restricted HTML as insert_content; docx and pdf take restricted HTML; md takes Markdown.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['hwpx', 'docx', 'pdf', 'md'] }, title: { type: 'string' }, content: { type: 'string' } }, required: ['title', 'content'] },
  },
  {
    name: 'read_attachment',
    description: 'Read the text of a chat attachment (parsed on this computer). Long files are paged: read offset=0 first.',
    inputSchema: { type: 'object', properties: { index: { type: 'integer' }, offset: { type: 'integer' } }, required: ['index'] },
  },
]

const MEDIA_PROMPT = [
  '# Images, charts, attachments and new documents',
  '- Photos: image_search (English keywords), pick the best result, then insert_image with its imageUrl. Illustrations search cannot find: generate_image, then insert_image.',
  '- Charts listed in the context can be read with read_chart and changed with edit_chart; insert_chart adds a new one. Data must come from the document, the user, or web_search results.',
  '- Attachments listed in the context: read text ones with read_attachment before using them; image attachments are already in the message, and insert_image can place one with attachmentIndex.',
  '- When the user wants the result as a NEW document (a summary, a report, a translation into a separate file), use create_document; default type hwpx.',
].join('\n')

export function createMediaSkill(deps: { getSession(): Session | null; api: MediaApi; getAttachments(): AttachmentMeta[] }): AgentSkill {
  const err = (output: string, summary: string): ToolExecution => ({ output, isError: true, summary })
  const charts = (s: Session): ChartEntry[] => {
    try {
      return JSON.parse(s.doc.raw.listCharts()) as ChartEntry[]
    } catch {
      return []
    }
  }
  const run = async (call: AgentToolCall): Promise<ToolExecution> => {
    const s = deps.getSession()
    const input = call.input
    switch (call.name) {
      case 'image_search': {
        const query = String(input.query ?? '').trim()
        if (!query) return err('query must not be empty', 'image search')
        const r = await deps.api.imageSearch(query, Number(input.maxResults) || 8)
        if (r.method === 'error') return err(`image search failed (service error, not an empty result): ${r.error ?? 'unknown'}`, 'image search')
        const lines = r.images.map((im, i) => `${i + 1}. ${im.title ?? ''} ${im.width && im.height ? `${im.width}×${im.height}` : ''}\n   imageUrl: ${im.imageUrl}`)
        return { output: lines.join('\n') || '(no results)', mutated: false, summary: `Image search: ${query}`, display: { kind: 'images', items: r.images.slice(0, 8).map((im) => ({ url: im.imageUrl, thumb: im.thumbnailUrl ?? im.imageUrl, ...(im.title ? { title: im.title } : {}) })) } }
      }
      case 'generate_image': {
        const prompt = String(input.prompt ?? '').trim()
        if (!prompt) return err('prompt must not be empty', 'generate image')
        const r = await deps.api.generateImage({ prompt, ...(input.aspectRatio ? { aspectRatio: String(input.aspectRatio) } : {}) })
        if (!r.url) return err(r.error ?? 'image generation failed', 'generate image')
        return { output: `imageUrl: ${r.url}`, mutated: false, summary: 'Generated an image', display: { kind: 'images', items: [{ url: r.url }] } }
      }
      case 'insert_image': {
        if (!s) return err('The document is not open yet.', 'insert image')
        let bytes: Uint8Array | null = null
        if (Number.isInteger(input.attachmentIndex)) {
          const att = deps.getAttachments()[input.attachmentIndex as number]
          if (!att || !ATTACHMENT_IMAGE_EXTS.has(att.ext)) return err('attachmentIndex must name an image attachment', 'insert image')
          const r = await deps.api.readAttachmentImage(att.path)
          if (!r.ok) return err(r.error, 'insert image')
          bytes = fromBase64(r.base64)
        } else if (input.imageUrl) {
          const r = await deps.api.fetchImage(String(input.imageUrl))
          if (!r) return err('the image could not be downloaded; try another result', 'insert image')
          bytes = fromBase64(r.base64)
        } else return err('give imageUrl or attachmentIndex', 'insert image')
        try {
          const { node } = insertImageBytes(s, bytes, {
            ...(Number.isInteger(input.afterId) ? { afterId: input.afterId as number } : {}),
            ...(input.description ? { description: String(input.description) } : {}),
            ...(Number.isInteger(input.widthPercent) ? { widthPercent: input.widthPercent as number } : {}),
          })
          return { output: `Inserted the image as paragraph ${node}.`, mutated: true, summary: 'Inserted an image' }
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e), 'insert image')
        }
      }
      case 'insert_chart': {
        if (!s) return err('The document is not open yet.', 'insert chart')
        try {
          const made = insertChartAt(s, input, Number.isInteger(input.afterId) ? { afterId: input.afterId as number } : {})
          const index = charts(s).find((c) => c.section === made.section && c.paragraph === made.para)?.index
          return { output: `Inserted the chart as paragraph ${made.node}${index === undefined ? '' : `; it is chart ${index}, for read_chart and edit_chart`}.`, mutated: true, summary: 'Inserted a chart' }
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e), 'insert chart')
        }
      }
      case 'read_chart': {
        if (!s) return err('The document is not open yet.', 'read chart')
        try {
          return { output: s.doc.raw.getChartDataByIndex(Number(input.index)), mutated: false, summary: 'Read a chart' }
        } catch (e) {
          return err(`no chart ${String(input.index)}: ${e instanceof Error ? e.message : String(e)}`, 'read chart')
        }
      }
      case 'edit_chart': {
        if (!s) return err('The document is not open yet.', 'edit chart')
        const edits = { ...(input.labels ? { labels: input.labels } : {}), series: input.series, ...(input.structure ? { structure: true } : {}) }
        let result = ''
        try {
          s.group('ai:edit-chart', () => {
            result = s.doc.raw.setChartDataByIndex(Number(input.index), JSON.stringify(edits))
            const r = JSON.parse(result) as { ok?: boolean }
            // A rejected edit writes nothing; throw so the group leaves no undo step.
            if (r.ok === false) throw new NodeError(result)
            return s.selection
          }, 'ai')
        } catch (e) {
          return err(e instanceof NodeError ? `chart edit rejected, nothing was written: ${e.message}` : String(e), 'edit chart')
        }
        return { output: result, mutated: true, summary: 'Edited a chart' }
      }
      case 'create_document': {
        const type = String(input.type ?? 'hwpx') as 'hwpx' | 'docx' | 'pdf' | 'md'
        const title = String(input.title ?? '')
        const content = String(input.content ?? '')
        if (!content.trim()) return err('content must not be empty', 'create document')
        try {
          const r = type === 'hwpx' ? await deps.api.createDocument({ type, title, base64: toBase64(buildHwpx(content)) }) : await deps.api.createDocument({ type, title, content })
          if (!r.ok) return err(r.error ?? 'could not create the document', 'create document')
          return { output: `Created ${r.path ?? `a new ${type} document`} and opened it in a new tab.`, mutated: false, summary: `Created ${title || 'a document'}` }
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e), 'create document')
        }
      }
      case 'read_attachment': {
        const att = deps.getAttachments()[Number(input.index)]
        if (!att) return err('invalid attachment index (see the attachment list)', 'read attachment')
        if (ATTACHMENT_IMAGE_EXTS.has(att.ext)) return { output: `${att.name} is an image already sent with the user message; look at it there.`, mutated: false, summary: att.name }
        const offset = Math.max(0, Number(input.offset) || 0)
        const r = await deps.api.readAttachment(att.path, offset, READ_CHUNK_CHARS)
        if (!r.ok) return err(r.error ?? 'read failed', 'read attachment')
        const end = (r.offset ?? 0) + (r.text?.length ?? 0)
        const more = end < (r.totalChars ?? 0) ? ` (not finished, continue with offset=${end})` : ' (end of file)'
        return { output: `File ${att.name}, ${r.totalChars} characters, this slice ${r.offset}-${end}${more}\n---\n${r.text ?? ''}`, mutated: false, summary: att.name }
      }
    }
    return err(`Unknown tool: ${call.name}`, call.name)
  }
  return {
    id: 'hangul-media',
    systemPrompt: MEDIA_PROMPT,
    tools: MEDIA_TOOLS,
    buildContext: () => {
      const parts: string[] = []
      const s = deps.getSession()
      const list = s ? charts(s) : []
      if (list.length) parts.push(`Charts (index | section | paragraph): ${list.map((c) => `${c.index} | ${c.section} | ${c.paragraph}`).join('; ')}`)
      const atts = deps.getAttachments()
      if (atts.length) parts.push(`Attachment list (index | file name | type):\n${atts.map((a, i) => `${i} | ${a.name} | .${a.ext}`).join('\n')}`)
      return parts.join('\n\n')
    },
    executeTool: (call) => run(call),
  }
}
