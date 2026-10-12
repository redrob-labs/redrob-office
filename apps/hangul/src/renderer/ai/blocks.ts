// Blocks for the Hangul AI skill (spec task 3.2/3.3): Node ids resolved to
// editor positions, document content read as restricted HTML, and restricted
// HTML written back with the document's own formatting.
//
// Addressing is by Node id (E1), never by index, so an edit earlier in the
// document never shifts what a later tool call means.
//
// Formatting inheritance (Docs' `inheritBlockFormatting` principle mapped to
// HWP): every paragraph written keeps the exact style, paragraph shape and
// character shape of a template paragraph with the same role (heading level,
// body, list) taken from the paragraphs being replaced or the anchor. Shapes
// are copied by id (`setParaShapeId`, `setCharShapeId`), so no property is
// converted between units and the file gains no near-duplicate shapes.
import type { NodeId, NodeLocation, OutlineParagraph } from '@genoffice/hwp-core'
import { at, containerOf, paraIndex, sameContainer, styleList, tidyHtml, type Container, type Pos, type Session } from '@genoffice/hwp-editor'

// ── Resolving nodes ─────────────────────────────────────────────────────

/** Where a node can be edited: body paragraphs and paragraphs in a top-level table cell. */
export function posOf(s: Session, id: NodeId): Pos | null {
  const loc = s.doc.locate(id)
  return loc ? posOfLocation(loc) : null
}

export function posOfLocation(loc: NodeLocation): Pos | null {
  if (loc.path.length === 0) return { section: loc.section, para: loc.para, offset: 0 }
  if (loc.path.length === 1 && loc.path[0]!.kind === 'cell') {
    const step = loc.path[0]!
    return { section: loc.section, para: loc.para, offset: 0, cell: { control: step.controlIndex, cell: step.cellIndex ?? 0, para: step.para } }
  }
  return null
}

export class NodeError extends Error {}

/** Why a node can't be edited, in words the model can act on. */
function unreachable(s: Session, id: NodeId): NodeError {
  const loc = s.doc.locate(id)
  if (!loc) return new NodeError(`node ${id} no longer exists (deleted or replaced); call get_document_context for current ids`)
  const kinds = loc.path.map((p) => p.kind).join(' > ')
  return new NodeError(`node ${id} is inside ${kinds}; only body paragraphs and table-cell paragraphs can be edited by id (use set_header_footer for headers and footers)`)
}

export function requirePos(s: Session, id: NodeId): Pos {
  const p = posOf(s, id)
  if (!p) throw unreachable(s, id)
  return p
}

function containerKey(c: Container): string {
  return c.cell ? `${c.section}:${c.cell.host}:${c.cell.control}:${c.cell.cell}` : `${c.section}`
}

export interface Run {
  container: Container
  /** Paragraph indexes, ascending and consecutive. */
  first: number
  last: number
}

/**
 * Group node ids into runs of consecutive paragraphs per container, sorted
 * last-first, so deleting or rewriting one run never moves the next.
 */
export function runsOf(s: Session, ids: NodeId[]): Run[] {
  const groups = new Map<string, { container: Container; indexes: number[] }>()
  for (const id of new Set(ids)) {
    const p = requirePos(s, id)
    const c = containerOf(p)
    const key = containerKey(c)
    const g = groups.get(key) ?? { container: c, indexes: [] }
    g.indexes.push(paraIndex(p))
    groups.set(key, g)
  }
  const runs: Run[] = []
  for (const { container, indexes } of groups.values()) {
    indexes.sort((a, b) => a - b)
    let first = indexes[0]!
    let prev = first
    for (const i of indexes.slice(1)) {
      if (i !== prev + 1) {
        runs.push({ container, first, last: prev })
        first = i
      }
      prev = i
    }
    runs.push({ container, first, last: prev })
  }
  // Later runs first: by section, then host paragraph, then index, descending.
  const order = (r: Run) => [r.container.section, r.container.cell?.host ?? r.first, r.container.cell ? r.first : 0]
  return runs.sort((a, b) => {
    const x = order(a)
    const y = order(b)
    return y[0]! - x[0]! || y[1]! - x[1]! || y[2]! - x[2]!
  })
}

/** One contiguous run, or an error naming why the ids aren't one. */
export function singleRun(s: Session, ids: NodeId[]): Run {
  if (!ids.length) throw new NodeError('ids must not be empty')
  const runs = runsOf(s, ids)
  if (runs.length !== 1) throw new NodeError('ids must be consecutive paragraphs in one container (the body, or one table cell); split the call per run')
  return runs[0]!
}

// ── Roles and templates ─────────────────────────────────────────────────

export type Role = { kind: 'body' } | { kind: 'heading'; level: number } | { kind: 'list'; ordered: boolean }

const roleKey = (r: Role) => (r.kind === 'heading' ? `h${r.level}` : r.kind === 'list' ? `list:${r.ordered ? 'ol' : 'ul'}` : 'body')

/** Heading level of a style name (개요 N / Outline N), or 0. */
export function headingLevel(styleName: string): number {
  const m = /^(?:개요|Outline)\s*(\d+)$/i.exec(styleName.trim())
  return m ? Math.min(6, Number(m[1])) : 0
}

interface Template {
  styleId: number
  paraShapeId: number
  charShapeId: number
}

function styleNames(s: Session): Map<number, string> {
  return new Map(styleList(s).map((x) => [x.id, x.name]))
}

function paraProps(s: Session, p: Pos): Record<string, unknown> {
  const raw = s.doc.raw
  return JSON.parse(p.cell ? raw.getCellParaPropertiesAt(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para) : raw.getParaPropertiesAt(p.section, p.para)) as Record<string, unknown>
}

function readOne(s: Session, p: Pos): { styleId: number; paraShapeId: number; charShapeId: number } {
  const id = s.nodeAt(p)
  const r = id !== null ? s.doc.readNodes([id])[0] : undefined
  if (!r || r.missing) return { styleId: 0, paraShapeId: 0, charShapeId: 0 }
  return { styleId: r.styleId, paraShapeId: r.paraShapeId, charShapeId: dominantCharShape(r.charShapes, [...r.text].length) }
}

/**
 * The character shape covering most of a paragraph: its body text, not a bold
 * lead-in like "제1조(목적)" or a trailing emphasis.
 */
export function dominantCharShape(runs: Array<{ start: number; charShapeId: number }>, length: number): number {
  if (!runs.length) return 0
  const total = new Map<number, number>()
  runs.forEach((r, i) => {
    const end = runs[i + 1]?.start ?? length
    total.set(r.charShapeId, (total.get(r.charShapeId) ?? 0) + Math.max(0, end - r.start))
  })
  let best = runs[0]!.charShapeId
  for (const [id, n] of total) if (n > (total.get(best) ?? 0)) best = id
  return best
}

export function roleAt(s: Session, p: Pos, names = styleNames(s)): Role {
  const { styleId } = readOne(s, p)
  const level = headingLevel(names.get(styleId) ?? '')
  if (level) return { kind: 'heading', level }
  const head = String(paraProps(s, p).headType ?? 'None')
  if (head === 'Bullet') return { kind: 'list', ordered: false }
  if (head === 'Number') return { kind: 'list', ordered: true }
  return { kind: 'body' }
}

/** Template per role from the paragraphs of a run (the first of each role wins). */
export function templatesOf(s: Session, c: Container, first: number, last: number): Map<string, Template> {
  const names = styleNames(s)
  const out = new Map<string, Template>()
  for (let i = first; i <= last; i++) {
    const p = at(c, i, 0)
    const key = roleKey(roleAt(s, p, names))
    if (!out.has(key)) out.set(key, readOne(s, p))
  }
  return out
}

/**
 * Fill templates for roles the blocks need but the run lacks, from the
 * nearest paragraphs of that role around the run in the same container, so a
 * body paragraph written after a heading looks like the document's body text.
 */
export function addNeighbourTemplates(s: Session, c: Container, first: number, last: number, blocks: Block[], templates: Map<string, Template>, reach = 60): void {
  const need = new Set(blocks.flatMap((b) => (b.type === 'para' ? [roleKey(b.role)] : [])).filter((k) => !templates.has(k)))
  if (!need.size) return
  const names = styleNames(s)
  const count = s.text.paragraphCount(c)
  for (let d = 1; d <= reach && need.size; d++) {
    for (const i of [last + d, first - d]) {
      if (i < 0 || i >= count) continue
      const p = at(c, i, 0)
      const key = roleKey(roleAt(s, p, names))
      if (need.has(key) && s.text.length(p) > 0) {
        templates.set(key, readOne(s, p))
        need.delete(key)
      }
    }
  }
}

// ── Reading: paragraphs as restricted HTML ──────────────────────────────

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function inlineHtml(s: Session, p: Pos): string {
  const len = s.text.length(p)
  if (!len) return ''
  const id = s.nodeAt(p)
  const r = id !== null ? s.doc.readNodes([id])[0] : undefined
  const starts = r && !r.missing ? r.charShapes.map((c) => c.start).filter((x) => x < len) : [0]
  if (!starts.includes(0)) starts.unshift(0)
  const bounds = [...new Set(starts)].sort((a, b) => a - b)
  let html = ''
  bounds.forEach((start, i) => {
    const end = bounds[i + 1] ?? len
    if (end <= start) return
    let t = esc(s.text.text(p, start, end - start))
    const c = s.text.charPropertiesAt({ ...p, offset: start + 1 > len ? start : start + 1 })
    if (c.strikethrough) t = `<s>${t}</s>`
    if (c.underline) t = `<u>${t}</u>`
    if (c.italic) t = `<em>${t}</em>`
    if (c.bold) t = `<strong>${t}</strong>`
    html += t
  })
  return html
}

function alignAttr(s: Session, p: Pos): string {
  const a = String(paraProps(s, p).alignment ?? 'justify')
  return a === 'center' || a === 'right' ? ` style="text-align:${a}"` : ''
}

/** One paragraph (and the tables it hosts) as restricted HTML with `data-id`. */
export function paragraphHtml(s: Session, p: Pos, node: OutlineParagraph | undefined, names = styleNames(s)): string {
  const id = s.nodeAt(p)
  const role = roleAt(s, p, names)
  const tag = role.kind === 'heading' ? `h${role.level}` : role.kind === 'list' ? 'li' : 'p'
  let html = `<${tag} data-id="${id}"${alignAttr(s, p)}>${inlineHtml(s, p)}</${tag}>`
  for (const ctl of node?.controls ?? []) {
    if (ctl.kind === 'table' && ctl.cells) {
      const rows = new Map<number, string[]>()
      for (const cell of ctl.cells) {
        const cellHtml = cell.paragraphs
          .map((cp, k) => {
            const pos: Pos = { section: p.section, para: p.para, offset: 0, cell: { control: ctl.controlIndex, cell: cell.cellIndex, para: k } }
            return `<p data-id="${cp.id}">${inlineHtml(s, pos)}</p>`
          })
          .join('')
        const span = `${cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''}${cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''}`
        const list = rows.get(cell.row) ?? []
        list.push(`<td${span}>${cellHtml}</td>`)
        rows.set(cell.row, list)
      }
      const body = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, cells]) => `<tr>${cells.join('')}</tr>`).join('')
      html += `<table data-host="${id}" data-rows="${ctl.rows}" data-cols="${ctl.cols}">${body}</table>`
    } else {
      html += `<object kind="${esc(ctl.kind)}" data-host="${id}"/>`
    }
  }
  return html
}

// ── Writing: restricted HTML to paragraphs ──────────────────────────────

export interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
}

export type Block =
  | { type: 'para'; role: Role; runs: InlineRun[]; align?: 'left' | 'center' | 'right' | 'justify' }
  | { type: 'table'; html: string }

export const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'a', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'pre', 'code', 'span']

function inlineRuns(node: Node, fmt: Omit<InlineRun, 'text'>, out: InlineRun[][]): void {
  // `out` is a list of lines; <br> starts a new line (a new paragraph of the same role).
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      const text = (child.textContent ?? '').replace(/\s+/g, ' ')
      if (text) out[out.length - 1]!.push({ text, ...fmt })
      continue
    }
    if (child.nodeType !== 1) continue
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') {
      out.push([])
      continue
    }
    const next = { ...fmt }
    if (tag === 'strong' || tag === 'b') next.bold = true
    if (tag === 'em' || tag === 'i') next.italic = true
    if (tag === 'u') next.underline = true
    if (tag === 's' || tag === 'del' || tag === 'strike') next.strike = true
    inlineRuns(el, next, out)
  }
}

function trimRuns(runs: InlineRun[]): InlineRun[] {
  const out = runs.filter((r) => r.text)
  if (out.length) {
    out[0] = { ...out[0]!, text: out[0]!.text.replace(/^\s+/, '') }
    const l = out.length - 1
    out[l] = { ...out[l]!, text: out[l]!.text.replace(/\s+$/, '') }
  }
  return out.filter((r) => r.text)
}

function alignOf(el: Element): Block extends { align?: infer A } ? A : never {
  const m = /text-align\s*:\s*(left|center|right|justify)/i.exec(el.getAttribute('style') ?? '')
  return (m?.[1]?.toLowerCase() ?? el.getAttribute('align')?.toLowerCase()) as never
}

/** Parse the restricted HTML dialect into blocks. Unknown tags keep their text. */
export function parseBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const blocks: Block[] = []
  const para = (el: Node, role: Role, align?: string, prefix = '') => {
    const lines: InlineRun[][] = [[]]
    inlineRuns(el, {}, lines)
    lines.forEach((line, i) => {
      const runs = trimRuns(i === 0 && prefix ? [{ text: prefix }, ...line] : line)
      blocks.push({ type: 'para', role, runs, ...(align ? { align: align as 'left' } : {}) })
    })
  }
  const walk = (parent: Element) => {
    let loose: ChildNode[] = []
    const flush = () => {
      if (!loose.length) return
      const span = doc.createElement('span')
      for (const n of loose) span.appendChild(n.cloneNode(true))
      if ((span.textContent ?? '').trim()) para(span, { kind: 'body' })
      loose = []
    }
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType !== 1) {
        if (child.nodeType === 3) loose.push(child)
        continue
      }
      const el = child as Element
      const tag = el.tagName.toLowerCase()
      const heading = /^h([1-6])$/.exec(tag)
      if (heading) {
        flush()
        para(el, { kind: 'heading', level: Number(heading[1]) }, alignOf(el))
      } else if (tag === 'p' || tag === 'blockquote' || tag === 'div') {
        flush()
        if (el.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, table')) walk(el)
        else para(el, { kind: 'body' }, alignOf(el))
      } else if (tag === 'pre') {
        flush()
        for (const line of (el.textContent ?? '').replace(/\n$/, '').split('\n')) blocks.push({ type: 'para', role: { kind: 'body' }, runs: line ? [{ text: line }] : [] })
      } else if (tag === 'ul' || tag === 'ol') {
        flush()
        let n = 0
        for (const li of Array.from(el.children)) {
          if (li.tagName.toLowerCase() !== 'li') continue
          n += 1
          const ordered = tag === 'ol'
          para(li, { kind: 'list', ordered }, alignOf(li), ordered ? `${n}. ` : '• ')
        }
      } else if (tag === 'table') {
        flush()
        blocks.push({ type: 'table', html: el.outerHTML })
      } else {
        loose.push(child)
      }
    }
    flush()
  }
  walk(doc.body)
  return blocks
}

function ok(json: string, what: string): Record<string, unknown> {
  const r = JSON.parse(json) as Record<string, unknown>
  if (r.ok === false) throw new Error(`${what}: ${String(r.error ?? json)}`)
  return r
}

function setShapes(s: Session, p: Pos, t: Template, setStyle: boolean): void {
  const raw = s.doc.raw
  const len = s.text.length(p)
  if (p.cell) {
    if (setStyle) ok(raw.applyCellStyle(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, t.styleId), 'applyCellStyle')
    ok(raw.setCellParaShapeId(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, t.paraShapeId), 'setCellParaShapeId')
    if (len) ok(raw.setCharShapeIdInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, 0, len, t.charShapeId), 'setCharShapeIdInCell')
  } else {
    if (setStyle) ok(raw.applyStyle(p.section, p.para, t.styleId), 'applyStyle')
    ok(raw.setParaShapeId(p.section, p.para, t.paraShapeId), 'setParaShapeId')
    if (len) ok(raw.setCharShapeId(p.section, p.para, 0, len, t.charShapeId), 'setCharShapeId')
  }
}

function setCharShape(s: Session, p: Pos, from: number, to: number, id: number): void {
  const raw = s.doc.raw
  if (p.cell) ok(raw.setCharShapeIdInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, from, to, id), 'setCharShapeIdInCell')
  else ok(raw.setCharShapeId(p.section, p.para, from, to, id), 'setCharShapeId')
}

function applyStyleOnly(s: Session, p: Pos, styleId: number): void {
  const raw = s.doc.raw
  if (p.cell) ok(raw.applyCellStyle(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, styleId), 'applyCellStyle')
  else ok(raw.applyStyle(p.section, p.para, styleId), 'applyStyle')
}

/**
 * How a block of a role gets its look: the template of that role if the run
 * or its neighbours had one; for a heading without one, the document's 개요 N
 * style; for body text, the default style.
 */
function lookFor(role: Role, templates: Map<string, Template>, styleIds: Map<string, number>): Template | { styleId: number } | null {
  const t = templates.get(roleKey(role))
  if (t) return t
  if (role.kind === 'heading') {
    const id = styleIds.get(`개요 ${role.level}`) ?? styleIds.get(`Outline ${role.level}`)
    if (id !== undefined) return { styleId: id }
  }
  if (role.kind !== 'body') return templates.get('body') ?? null
  // Body text after a heading, in a document with no body text near by: the default style.
  const normal = styleIds.get('바탕글') ?? styleIds.get('Normal')
  // Some documents carry no style table at all; then the paragraph keeps what it inherited.
  return normal === undefined ? null : { styleId: normal }
}

export interface WriteResult {
  /** Node ids of the paragraphs written, in order. */
  ids: NodeId[]
  /** Position at the end of the last paragraph written. */
  end: Pos
}

/**
 * Write blocks starting at `start`, an empty paragraph. Each later block
 * starts a new paragraph after the previous one. Call inside `Session.edit`.
 */
export function writeBlocks(s: Session, start: Pos, blocks: Block[], templates: Map<string, Template>, startRole: Role | null): WriteResult {
  const styles = styleList(s)
  const styleIds = new Map(styles.map((x) => [x.name, x.id]))
  const known = new Set(styles.map((x) => x.id))
  const ids: NodeId[] = []
  let p = start
  let prevRole: Role | null = startRole
  let prevBase: number | null = null
  blocks.forEach((block, i) => {
    if (i > 0) p = s.text.split({ ...p, offset: s.text.length(p) })
    if (block.type === 'table') {
      if (p.cell) throw new NodeError('tables cannot be written inside a table cell')
      const r = ok(s.doc.raw.pasteHtml(p.section, p.para, 0, tidyHtml(block.html)), 'pasteHtml')
      const last = Number(r.paraIdx)
      for (let k = p.para; k <= last; k++) {
        const id = s.doc.nodeIdAt(p.section, k)
        if (id !== null) ids.push(id)
      }
      p = { section: p.section, para: last, offset: s.doc.paragraphLength(p.section, last) }
      prevRole = null
      prevBase = null
      return
    }
    const text = block.runs.map((r) => r.text).join('')
    const end = s.text.insert({ ...p, offset: 0 }, text)
    const role = block.role
    if (!prevRole || roleKey(prevRole) !== roleKey(role)) {
      const look = lookFor(role, templates, styleIds)
      // A document may reference style 0 without defining any style; only apply styles that exist.
      if (look && 'paraShapeId' in look) setShapes(s, p, look, known.has(look.styleId))
      else if (look) applyStyleOnly(s, p, look.styleId)
    } else if (text && (prevBase ?? templates.get(roleKey(role))?.charShapeId) !== undefined) {
      // Same role as the paragraph before: take its base character shape, not
      // the inline formatting (bold, …) its last run happened to end with.
      setCharShape(s, p, 0, [...text].length, (prevBase ?? templates.get(roleKey(role))?.charShapeId)!)
    }
    prevBase = text ? readOne(s, p).charShapeId : prevBase
    let off = 0
    for (const run of block.runs) {
      const n = [...run.text].length
      const props: Record<string, unknown> = {}
      if (run.bold) props.bold = true
      if (run.italic) props.italic = true
      if (run.underline) props.underline = true
      if (run.strike) props.strikethrough = true
      if (Object.keys(props).length) s.text.applyCharFormat({ ...p, offset: off }, { ...p, offset: off + n }, props)
      off += n
    }
    if (block.align) {
      const raw = s.doc.raw
      const j = JSON.stringify({ alignment: block.align })
      if (p.cell) ok(raw.applyParaFormatInCell(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para, j), 'applyParaFormatInCell')
      else ok(raw.applyParaFormat(p.section, p.para, j), 'applyParaFormat')
    }
    const id = s.nodeAt(p)
    if (id !== null) ids.push(id)
    p = end
    prevRole = role
  })
  return { ids, end: p }
}

/** Remove a run of paragraphs entirely (the container keeps one empty paragraph if it would be left with none). */
export function deleteRun(s: Session, run: Run): Pos {
  const c = run.container
  const count = s.text.paragraphCount(c)
  const lastPos = at(c, run.last, 0)
  const lastEnd = { ...lastPos, offset: s.text.length(lastPos) }
  if (run.first > 0) {
    const prev = at(c, run.first - 1, 0)
    return s.text.delete({ ...prev, offset: s.text.length(prev) }, lastEnd)
  }
  if (run.last + 1 < count) return s.text.delete(at(c, 0, 0), at(c, run.last + 1, 0))
  return s.text.delete(at(c, 0, 0), lastEnd)
}

/** Empty a run into its first paragraph, which keeps that paragraph's shapes. */
export function clearRun(s: Session, run: Run): Pos {
  const c = run.container
  const lastPos = at(c, run.last, 0)
  return s.text.delete(at(c, run.first, 0), { ...lastPos, offset: s.text.length(lastPos) })
}

export { sameContainer }
