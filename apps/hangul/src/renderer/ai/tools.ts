// Tools of the Hangul AI skill (spec tasks 3.2 and 3.3). Every tool addresses
// content by Node id; every mutating call is one `Session.group`, so it is one
// undo step and one change with origin 'ai', and a failure leaves the document
// exactly as it was.
import type { AgentToolCall, AgentToolDef, ToolExecution } from '@genoffice/agent-core'
import type { NodeId, Outline, OutlineParagraph } from '@genoffice/hwp-core'
import { CommandBus, Comments, at, containerOf, ordered, paraIndex, sameContainer, styleList, type Pos, type Selection, type Session } from '@genoffice/hwp-editor'
import { t } from '../i18n/locale'
import {
  NodeError,
  addNeighbourTemplates,
  clearRun,
  deleteRun,
  headingLevel,
  paragraphHtml,
  parseBlocks,
  posOf,
  requirePos,
  roleAt,
  runsOf,
  singleRun,
  templatesOf,
  writeBlocks,
  type Run,
} from './blocks'

export const CONTEXT_LINE_LIMIT = 400
export const READ_CHUNK_CHARS = 24_000
const PREVIEW_CHARS = 80
const SELECTION_CHARS = 2_000
const CELL_LINES_PER_TABLE = 40

/** Commands `apply_commands` may run: formatting, tables, page and inserts. Never history, movement or file commands. */
const COMMAND_PREFIXES = ['format:', 'table:', 'page:', 'insert:']

export const MUTATING_TOOLS = new Set(['replace_blocks', 'insert_content', 'delete_blocks', 'replace_text', 'apply_commands', 'set_header_footer', 'reply_comment', 'resolve_comment'])

/** The author Redrob's own comment replies carry. */
export const REDROB_AUTHOR = 'Redrob'

const idsSchema = { type: 'array', items: { type: 'integer' }, description: 'Node ids from the document outline' }

export const COMMENT_TOOLS: AgentToolDef[] = [
  {
    name: 'read_comments',
    description: 'All comment threads (한글 memos): thread id, the commented paragraph’s Node id and text, author, text and replies, and whether it is resolved.',
    inputSchema: { type: 'object', properties: { includeResolved: { type: 'boolean', description: 'default true' } } },
  },
  {
    name: 'reply_comment',
    description: 'Reply in a comment thread, signed Redrob. Use it to answer a question or say what you changed for that comment.',
    inputSchema: { type: 'object', properties: { threadId: { type: 'integer' }, text: { type: 'string' } }, required: ['threadId', 'text'] },
  },
  {
    name: 'resolve_comment',
    description: 'Mark a comment thread resolved (or reopen it with resolved=false), after its request is done.',
    inputSchema: { type: 'object', properties: { threadId: { type: 'integer' }, resolved: { type: 'boolean', description: 'default true' } }, required: ['threadId'] },
  },
]

export const HANGUL_TOOLS: AgentToolDef[] = [
  {
    name: 'get_document_context',
    description: 'The current document outline: one line per paragraph (Node id | kind | preview), tables with their cell paragraphs, stats and the user selection. Long documents are paged with offset.',
    inputSchema: { type: 'object', properties: { offset: { type: 'integer', description: 'outline line to start from, default 0' } } },
  },
  {
    name: 'read_blocks',
    description: 'Full content of paragraphs as restricted HTML with data-id attributes (headings, bold/italic/underline/strike runs, alignment, tables with cell paragraph ids). Paged by character offset.',
    inputSchema: { type: 'object', properties: { ids: idsSchema, offset: { type: 'integer' } }, required: ['ids'] },
  },
  {
    name: 'replace_blocks',
    description: 'Rewrite consecutive paragraphs (body, or one table cell) with restricted HTML. Each new paragraph keeps the exact HWP style, paragraph shape and character shape of a replaced paragraph with the same role (heading level, body, list), so no follow-up formatting is needed.',
    inputSchema: { type: 'object', properties: { ids: idsSchema, html: { type: 'string' } }, required: ['ids', 'html'] },
  },
  {
    name: 'insert_content',
    description: 'Insert restricted HTML after (or before) a paragraph, or at the start or end of the document. New paragraphs take the anchor paragraph’s formatting for its role; headings use the document’s 개요 styles when the anchor has none.',
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string' },
        id: { type: 'integer', description: 'anchor Node id; omit with where=start|end' },
        where: { type: 'string', enum: ['after', 'before', 'start', 'end'], description: 'default after' },
      },
      required: ['html'],
    },
  },
  {
    name: 'delete_blocks',
    description: 'Delete paragraphs (and the tables or objects they host) by Node id. Ids need not be consecutive.',
    inputSchema: { type: 'object', properties: { ids: idsSchema }, required: ['ids'] },
  },
  {
    name: 'find_text',
    description: 'Find text in body and table-cell paragraphs. Returns Node id, character offset and surrounding text per match.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, caseSensitive: { type: 'boolean' }, max: { type: 'integer', description: 'default 50' } }, required: ['query'] },
  },
  {
    name: 'replace_text',
    description: 'Replace exact text in place, keeping the surrounding character formatting. For small fixes (a word, a number, a name). Scope with ids, or omit ids for the whole document.',
    inputSchema: {
      type: 'object',
      properties: { find: { type: 'string' }, replace: { type: 'string' }, ids: idsSchema, caseSensitive: { type: 'boolean' }, all: { type: 'boolean', description: 'every occurrence (default true); false replaces the first only' } },
      required: ['find', 'replace'],
    },
  },
  {
    name: 'apply_commands',
    description:
      'Run editor commands on targets, as one undo step. Each entry: {command, ids?, range?, params?}. ids targets whole consecutive paragraphs; range {id, from, to} targets characters of one paragraph; neither targets the user selection. Command ids are listed in the system prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        commands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              ids: idsSchema,
              range: { type: 'object', properties: { id: { type: 'integer' }, from: { type: 'integer' }, to: { type: 'integer' } }, required: ['id'] },
              params: { type: 'object' },
            },
            required: ['command'],
          },
        },
      },
      required: ['commands'],
    },
  },
  {
    name: 'set_header_footer',
    description: 'Set the text of a section’s header or footer (replacing what is there), creating it if missing; empty text with remove=true deletes it.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['header', 'footer'] },
        text: { type: 'string' },
        pages: { type: 'string', enum: ['both', 'odd', 'even'], description: 'default both' },
        section: { type: 'integer', description: 'default 0' },
        remove: { type: 'boolean' },
      },
      required: ['kind'],
    },
  },
]

// ── Context ─────────────────────────────────────────────────────────────

export interface FrozenSelection {
  selection: Selection
  /** Node ids the selection covered when the run started. */
  ids: NodeId[]
  text: string
}

export function freezeSelection(s: Session): FrozenSelection | null {
  const sel = s.selection
  const [a, b] = ordered(sel)
  if (sameContainer(a, b) && paraIndex(a) === paraIndex(b) && a.offset === b.offset) return null
  const text = sameContainer(a, b) ? s.text.textBetween(a, b) : ''
  return { selection: sel, ids: s.nodesIn(sel), text }
}

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}…` : text)

function kindOf(p: OutlineParagraph, names: Map<number, string>): string {
  const level = headingLevel(names.get(p.styleId) ?? '')
  return level ? `h${level}` : 'p'
}

/** Outline lines: paragraphs, tables and their cells, with Node ids. */
export function outlineLines(s: Session, outline: Outline = s.doc.outline()): string[] {
  const names = new Map(styleList(s).map((x) => [x.id, x.name]))
  const lines: string[] = []
  for (const section of outline.sections) {
    if (outline.sections.length > 1) lines.push(`— section ${section.section} —`)
    for (const p of section.paragraphs) {
      const style = names.get(p.styleId)
      const tag = style && style !== '바탕글' && style !== 'Normal' ? ` [${style}]` : ''
      lines.push(`${p.id} | ${kindOf(p, names)}${tag} | ${clip(p.preview, PREVIEW_CHARS)}`)
      for (const ctl of p.controls ?? []) {
        if (ctl.kind === 'table' && ctl.cells) {
          lines.push(`  table ${ctl.rows}×${ctl.cols} in ${p.id}`)
          let shown = 0
          for (const cell of ctl.cells) {
            for (const cp of cell.paragraphs) {
              if (shown++ >= CELL_LINES_PER_TABLE) continue
              lines.push(`    ${cp.id} | cell r${cell.row}c${cell.col} | ${clip(cp.preview, PREVIEW_CHARS)}`)
            }
          }
          if (shown > CELL_LINES_PER_TABLE) lines.push(`    … ${shown - CELL_LINES_PER_TABLE} more cell paragraphs (read_blocks on ${p.id} shows the whole table)`)
        } else {
          lines.push(`  ${ctl.kind} in ${p.id}`)
        }
      }
    }
  }
  return lines
}

function stats(s: Session, outline: Outline): string {
  let paragraphs = 0
  let chars = 0
  for (const section of outline.sections) {
    for (const p of section.paragraphs) {
      paragraphs += 1
      chars += p.length
    }
  }
  return `${s.doc.pageCount()} pages, ${outline.sections.length} section(s), ${paragraphs} body paragraphs, ${chars} body characters, format ${s.format}`
}

/** Unresolved threads for the context (resolved ones are in read_comments). */
export function commentContext(s: Session): string {
  const open = new Comments(s).threads().filter((t) => !t.resolved)
  if (!open.length) return ''
  const line = (t: (typeof open)[number]) =>
    `${t.id} | on ${t.anchor.nodeId} "${clip(t.anchor.text, 60)}" | ${t.root.author}: ${clip(t.root.text, 200)}${t.replies.length ? ` (+${t.replies.length} replies, last ${t.replies.at(-1)!.author}: ${clip(t.replies.at(-1)!.text, 120)})` : ''}`
  return ['Open comment threads (id | commented paragraph | first comment):', ...open.slice(0, 50).map(line)].join('\n')
}

export function buildContext(s: Session, frozen: FrozenSelection | null, offset = 0): string {
  const outline = s.doc.outline()
  const lines = outlineLines(s, outline)
  const page = lines.slice(offset, offset + CONTEXT_LINE_LIMIT)
  const parts = [`Hangul document: ${stats(s, outline)}.`, 'Outline (Node id | kind [style] | preview):', ...page]
  if (offset + CONTEXT_LINE_LIMIT < lines.length) parts.push(`… outline continues: get_document_context with offset=${offset + CONTEXT_LINE_LIMIT} (${lines.length} lines in total)`)
  if (frozen) parts.push('', `User selection: paragraphs ${frozen.ids.join(', ')}`, `Selected text: ${clip(frozen.text, SELECTION_CHARS)}`)
  else parts.push('', 'User selection: none (caret only)')
  const comments = commentContext(s)
  if (comments) parts.push('', comments)
  return parts.join('\n')
}

// ── Executor ────────────────────────────────────────────────────────────

const err = (output: string, summary: string): ToolExecution => ({ output, isError: true, summary })

function ids(input: Record<string, unknown>, key = 'ids'): NodeId[] {
  const v = input[key]
  if (!Array.isArray(v) || !v.every((x) => Number.isInteger(x))) throw new NodeError(`${key} must be an array of Node ids`)
  return v as NodeId[]
}

function outlineIndex(outline: Outline): Map<NodeId, OutlineParagraph> {
  const map = new Map<NodeId, OutlineParagraph>()
  const visit = (p: OutlineParagraph) => {
    map.set(p.id, p)
    for (const c of p.controls ?? []) {
      for (const cell of c.cells ?? []) cell.paragraphs.forEach(visit)
      c.paragraphs?.forEach(visit)
    }
  }
  for (const section of outline.sections) section.paragraphs.forEach(visit)
  return map
}

/** Every editable paragraph (body and top-level cells), in document order. */
function allParagraphs(s: Session): Pos[] {
  const out: Pos[] = []
  for (const section of s.doc.outline().sections) {
    section.paragraphs.forEach((p, i) => {
      out.push({ section: section.section, para: i, offset: 0 })
      for (const c of p.controls ?? []) {
        for (const cell of c.cells ?? []) cell.paragraphs.forEach((_, k) => out.push({ section: section.section, para: i, offset: 0, cell: { control: c.controlIndex, cell: cell.cellIndex, para: k } }))
      }
    })
  }
  return out
}

/** Code-point offsets of `query` in `text`. */
function occurrences(text: string, query: string, caseSensitive: boolean): number[] {
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const out: number[] = []
  let i = hay.indexOf(needle)
  while (i >= 0 && needle) {
    out.push([...text.slice(0, i)].length)
    i = hay.indexOf(needle, i + needle.length)
  }
  return out
}

function readBlocks(s: Session, input: Record<string, unknown>): ToolExecution {
  const list = ids(input)
  const index = outlineIndex(s.doc.outline())
  const names = new Map(styleList(s).map((x) => [x.id, x.name]))
  const parts: string[] = []
  for (const id of list) {
    const p = posOf(s, id)
    if (!p) {
      const r = s.doc.readNodes([id])[0]
      parts.push(r && !r.missing ? `<p data-id="${id}" data-readonly="${r.location.path.map((x) => x.kind).join('>')}">${r.text}</p>` : `<!-- node ${id} no longer exists -->`)
      continue
    }
    parts.push(paragraphHtml(s, p, index.get(id), names))
  }
  const html = parts.join('\n')
  const offset = Math.max(0, Number(input.offset) || 0)
  const end = Math.min(html.length, offset + READ_CHUNK_CHARS)
  const more = end < html.length ? `\n…(truncated: ${html.length} characters in total, call read_blocks again with offset=${end})` : ''
  return { output: html.slice(offset, end) + more, mutated: false, summary: t('aiSumRead', { count: list.length }) }
}

function replaceBlocks(s: Session, input: Record<string, unknown>): ToolExecution {
  const list = ids(input)
  const blocks = parseBlocks(String(input.html ?? ''))
  if (!blocks.length) throw new NodeError('html has no content; use delete_blocks to remove paragraphs')
  let written: NodeId[] = []
  s.group('ai:replace-blocks', () => {
    const run = singleRun(s, list)
    const templates = templatesOf(s, run.container, run.first, run.last)
    addNeighbourTemplates(s, run.container, run.first, run.last, blocks, templates)
    const firstRole = roleAt(s, at(run.container, run.first, 0))
    const start = clearRun(s, run)
    const r = writeBlocks(s, start, blocks, templates, firstRole)
    written = r.ids
    return { anchor: r.end, head: r.end }
  }, 'ai')
  return { output: `Replaced ${list.length} paragraph(s) with ${written.length}. New ids: ${written.join(', ')}`, mutated: true, summary: t('aiSumReplace', { count: written.length }) }
}

function insertContent(s: Session, input: Record<string, unknown>): ToolExecution {
  const blocks = parseBlocks(String(input.html ?? ''))
  if (!blocks.length) throw new NodeError('html has no content')
  const where = String(input.where ?? 'after')
  let written: NodeId[] = []
  s.group('ai:insert-content', () => {
    let anchor: Pos
    if (where === 'start') anchor = { section: 0, para: 0, offset: 0 }
    else if (where === 'end') {
      const sec = s.doc.sectionCount() - 1
      anchor = { section: sec, para: s.doc.paragraphCount(sec) - 1, offset: 0 }
    } else {
      if (!Number.isInteger(input.id)) throw new NodeError('id is required for where=after|before')
      anchor = requirePos(s, input.id as NodeId)
    }
    const c = containerOf(anchor)
    const i = paraIndex(anchor)
    const templates = templatesOf(s, c, i, i)
    addNeighbourTemplates(s, c, i, i, blocks, templates)
    const role = roleAt(s, anchor)
    const before = where === 'before' || where === 'start'
    let start: Pos
    if (before) {
      // Split at the start: the new empty paragraph before inherits the anchor's shapes.
      s.text.split(at(c, i, 0))
      start = at(c, i, 0)
    } else {
      const p = at(c, i, 0)
      const empty = where === 'end' && s.text.length(p) === 0
      start = empty ? p : s.text.split({ ...p, offset: s.text.length(p) })
    }
    const r = writeBlocks(s, start, blocks, templates, role)
    written = r.ids
    return { anchor: r.end, head: r.end }
  }, 'ai')
  return { output: `Inserted ${written.length} paragraph(s). New ids: ${written.join(', ')}`, mutated: true, summary: t('aiSumInsert', { count: written.length }) }
}

function deleteBlocks(s: Session, input: Record<string, unknown>): ToolExecution {
  const list = ids(input)
  s.group('ai:delete-blocks', () => {
    let p: Pos = s.selection.head
    for (const run of runsOf(s, list)) p = deleteRun(s, run)
    return { anchor: p, head: p }
  }, 'ai')
  return { output: `Deleted ${list.length} paragraph(s).`, mutated: true, summary: t('aiSumDelete', { count: list.length }) }
}

function findText(s: Session, input: Record<string, unknown>): ToolExecution {
  const query = String(input.query ?? '')
  if (!query) throw new NodeError('query must not be empty')
  const max = Math.max(1, Math.min(500, Number(input.max) || 50))
  const lines: string[] = []
  let total = 0
  for (const p of allParagraphs(s)) {
    const text = s.text.text(p)
    for (const off of occurrences(text, query, Boolean(input.caseSensitive))) {
      total += 1
      if (lines.length >= max) continue
      const cps = [...text]
      const ctx = cps.slice(Math.max(0, off - 30), off + [...query].length + 30).join('')
      lines.push(`${s.nodeAt(p)} @${off}${p.cell ? ' (cell)' : ''} | ${ctx}`)
    }
  }
  const more = total > lines.length ? `\n… ${total - lines.length} more` : ''
  return { output: total ? `${total} match(es) (Node id @offset | context):\n${lines.join('\n')}${more}` : 'no matches', mutated: false, summary: t('aiSumFind', { count: total, query }) }
}

function replaceText(s: Session, input: Record<string, unknown>): ToolExecution {
  const find = String(input.find ?? '')
  const replacement = String(input.replace ?? '')
  if (!find) throw new NodeError('find must not be empty')
  const all = input.all !== false
  const scope = input.ids === undefined ? allParagraphs(s) : ids(input).map((id) => requirePos(s, id))
  let count = 0
  const n = [...find].length
  const change = () =>
    s.group('ai:replace-text', () => {
      for (const p of scope) {
        // Right to left, so earlier offsets stay valid.
        const offs = occurrences(s.text.text(p), find, Boolean(input.caseSensitive))
        const take = all ? offs : offs.slice(0, 1)
        for (const off of [...take].reverse()) {
          // Insert at the match's end first, so the new text takes the
          // match's own character shape, then remove the match.
          const end = { ...p, offset: off + n }
          s.text.insert(end, replacement)
          s.text.delete({ ...p, offset: off }, end)
          count += 1
        }
        if (!all && count) break
      }
      return s.selection
    }, 'ai')
  // Count first, so a no-match is not an undo step.
  const matches = scope.reduce((k, p) => k + occurrences(s.text.text(p), find, Boolean(input.caseSensitive)).length, 0)
  if (!matches) return { output: `no occurrences of "${find}"`, mutated: false, summary: t('aiSumReplaceText', { count: 0, query: find }) }
  change()
  return { output: `Replaced ${count} occurrence(s).`, mutated: true, summary: t('aiSumReplaceText', { count, query: find }) }
}

function targetSelection(s: Session, entry: Record<string, unknown>, frozen: FrozenSelection | null): Selection {
  if (entry.range && typeof entry.range === 'object') {
    const r = entry.range as Record<string, unknown>
    const p = requirePos(s, Number(r.id))
    const len = s.text.length(p)
    const from = Math.max(0, Math.min(len, Number(r.from ?? 0)))
    const to = Math.max(from, Math.min(len, Number(r.to ?? len)))
    return { anchor: { ...p, offset: from }, head: { ...p, offset: to } }
  }
  if (entry.ids !== undefined) {
    const run = singleRun(s, ids(entry))
    const last = at(run.container, run.last, 0)
    return { anchor: at(run.container, run.first, 0), head: { ...last, offset: s.text.length(last) } }
  }
  if (frozen) return frozen.selection
  return s.selection
}

function applyCommands(s: Session, bus: CommandBus, input: Record<string, unknown>, frozen: FrozenSelection | null): ToolExecution {
  const list = input.commands
  if (!Array.isArray(list) || !list.length) throw new NodeError('commands must be a non-empty array')
  for (const e of list as Array<Record<string, unknown>>) {
    const id = String(e.command ?? '')
    if (!COMMAND_PREFIXES.some((p) => id.startsWith(p)) || !bus.has(id)) throw new NodeError(`unknown or disallowed command "${id}"`)
  }
  const report: string[] = []
  let applied = 0
  s.group('ai:apply-commands', () => {
    for (const e of list as Array<Record<string, unknown>>) {
      const id = String(e.command)
      s.select(targetSelection(s, e, frozen))
      const params = (e.params && typeof e.params === 'object' ? e.params : {}) as Record<string, unknown>
      const r = bus.run(id, params, 'ai')
      if (r) applied += 1
      report.push(`${id}: ${r ? 'applied' : 'not applicable to this target (needs a text range, a table cell, or other params)'}`)
    }
    return s.selection
  }, 'ai')
  return { output: report.join('\n'), mutated: applied > 0, summary: t('aiSumCommands', { count: applied }) }
}

function setHeaderFooter(s: Session, input: Record<string, unknown>): ToolExecution {
  const isHeader = input.kind !== 'footer'
  const applyTo = input.pages === 'even' ? 1 : input.pages === 'odd' ? 2 : 0
  const section = Math.max(0, Math.min(s.doc.sectionCount() - 1, Number(input.section) || 0))
  const text = String(input.text ?? '')
  const raw = s.doc.raw
  const okJson = (json: string, what: string) => {
    const r = JSON.parse(json) as Record<string, unknown>
    if (r.ok === false) throw new Error(`${what}: ${String(r.error ?? json)}`)
    return r
  }
  s.group('ai:set-header-footer', () => {
    const existing = okJson(raw.getHeaderFooter(section, isHeader, applyTo), 'getHeaderFooter') as { exists?: boolean; paraCount?: number }
    if (input.remove) {
      if (existing.exists) okJson(raw.deleteHeaderFooter(section, isHeader, applyTo), 'deleteHeaderFooter')
      return s.selection
    }
    if (!existing.exists) okJson(raw.createHeaderFooter(section, isHeader, applyTo), 'createHeaderFooter')
    else {
      // Merge every paragraph into the first and clear it; the first keeps its shapes.
      for (let k = Number(existing.paraCount ?? 1) - 1; k > 0; k--) okJson(raw.mergeParagraphInHeaderFooter(section, isHeader, applyTo, k), 'mergeParagraphInHeaderFooter')
      const now = okJson(raw.getHeaderFooter(section, isHeader, applyTo), 'getHeaderFooter') as { text?: string }
      const len = [...(now.text ?? '')].length
      if (len) okJson(raw.deleteTextInHeaderFooter(section, isHeader, applyTo, 0, 0, len), 'deleteTextInHeaderFooter')
    }
    if (text) okJson(raw.insertTextInHeaderFooter(section, isHeader, applyTo, 0, 0, text.replace(/\s*\n\s*/g, ' ')), 'insertTextInHeaderFooter')
    return s.selection
  }, 'ai')
  const kind = isHeader ? 'header' : 'footer'
  return { output: input.remove ? `Removed the ${kind}.` : `Set the ${kind} to "${text}".`, mutated: true, summary: t('aiSumHeaderFooter', { kind }) }
}

export interface ToolEnv {
  session: Session
  bus: CommandBus
  frozen: FrozenSelection | null
}

export function executeHangulTool(env: ToolEnv, call: AgentToolCall): ToolExecution {
  const { session: s, bus, frozen } = env
  try {
    switch (call.name) {
      case 'get_document_context':
        return { output: buildContext(s, frozen, Math.max(0, Number(call.input.offset) || 0)), mutated: false, summary: t('aiSumContext') }
      case 'read_blocks':
        return readBlocks(s, call.input)
      case 'replace_blocks':
        return replaceBlocks(s, call.input)
      case 'insert_content':
        return insertContent(s, call.input)
      case 'delete_blocks':
        return deleteBlocks(s, call.input)
      case 'find_text':
        return findText(s, call.input)
      case 'replace_text':
        return replaceText(s, call.input)
      case 'apply_commands':
        return applyCommands(s, bus, call.input, frozen)
      case 'set_header_footer':
        return setHeaderFooter(s, call.input)
      case 'read_comments': {
        const threads = new Comments(s).threads().filter((t) => call.input.includeResolved !== false || !t.resolved)
        const out = threads.map((t) => ({
          threadId: t.id,
          resolved: t.resolved,
          paragraph: t.anchor.nodeId,
          commentedText: t.anchor.text,
          comments: [t.root, ...t.replies].map((c) => ({ author: c.author, text: c.text, ...(c.at ? { at: c.at } : {}) })),
        }))
        return { output: out.length ? JSON.stringify(out) : 'no comments', mutated: false, summary: t('aiSumReadComments', { count: out.length }) }
      }
      case 'reply_comment': {
        const text = String(call.input.text ?? '').trim()
        if (!text) throw new NodeError('text must not be empty')
        const c = new Comments(s)
        if (!c.thread(Number(call.input.threadId))) throw new NodeError(`no comment thread ${String(call.input.threadId)}; call read_comments for current ids`)
        c.reply(Number(call.input.threadId), REDROB_AUTHOR, text, [], 'ai')
        return { output: 'Replied.', mutated: true, summary: t('aiSumReplyComment') }
      }
      case 'resolve_comment': {
        const c = new Comments(s)
        if (!c.thread(Number(call.input.threadId))) throw new NodeError(`no comment thread ${String(call.input.threadId)}; call read_comments for current ids`)
        c.resolve(Number(call.input.threadId), call.input.resolved !== false, 'ai')
        return { output: call.input.resolved === false ? 'Reopened.' : 'Resolved.', mutated: true, summary: t('aiSumResolveComment') }
      }
      default:
        return err(`Unknown tool: ${call.name}`, call.name)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // A NodeError is the model's to fix; anything else is reported as an engine failure, and the group already rolled back.
    const prefix = e instanceof NodeError ? '' : 'The editor rejected this edit and the document was left unchanged: '
    return err(`${prefix}${message}`, call.name)
  }
}

export type { Run }
