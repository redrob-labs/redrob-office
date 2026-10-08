// More 한글 commands over the engine (spec task 2.6), under the coverage list's
// ids: paragraph numbering, bullets and outline levels; columns; header and
// footer removal; table structure (split, attach, split cell, distribute,
// transposed copy, formula, caption); object transforms (rotate, flip, caption,
// ungroup) and the text box; delete and memo navigation.
//
// The engine calls are those rhwp-studio makes for the same commands
// (rhwp-studio/src/command/commands, MIT); each runs as one undo step.
import { ordered, type Session } from './session'
import { inBody, fromEngine, type Pos } from './position'
import { deleteForward, type Command } from './commands'
import { applyCharShape, applyParaShape, styleAt, styleList } from './format-commands'
import { insertShape, objectBox, objectProperties, selectedCells, tableAt, tableCells, type TableTarget } from './object-commands'

function json(r: string, what: string): Record<string, unknown> {
  const v = JSON.parse(r) as Record<string, unknown>
  if (v.ok === false) throw new Error(`${what}: ${String(v.error ?? r)}`)
  return v
}

const body = (s: Session): Pos | null => (inBody(s.selection.head) ? s.selection.head : null)

function paraProps(s: Session, p: Pos = s.selection.head): Record<string, unknown> {
  if (p.cell) return JSON.parse(s.doc.raw.getCellParaPropertiesAt(p.section, p.para, p.cell.control, p.cell.cell, p.cell.para)) as Record<string, unknown>
  return JSON.parse(s.doc.raw.getParaPropertiesAt(p.section, p.para)) as Record<string, unknown>
}

// ── Numbering, bullets, outline levels ─────────────────────────────────

function headCommand(id: string, kind: 'Number' | 'Bullet', toggle: boolean): Command<{ bulletChar?: string } | undefined> {
  return {
    id,
    isEnabled: () => true,
    isActive: ({ session }) => {
      try {
        return paraProps(session).headType === kind
      } catch {
        return false
      }
    },
    run(ctx, params) {
      const { session } = ctx
      const on = paraProps(session).headType === kind
      return session.group(id, () => {
        if (toggle && on) applyParaShape.run(ctx, { props: { headType: 'None' } })
        else {
          const nid = kind === 'Number' ? session.doc.raw.ensureDefaultNumbering() : session.doc.raw.ensureDefaultBullet(params?.bulletChar ?? '●')
          applyParaShape.run(ctx, { props: { headType: kind, numberingId: nid, paraLevel: 0 } })
        }
        return session.selection
      })
    },
  }
}

/** 한 수준 증가/감소: move between the 개요 1–7 styles, as 한글 does for outline paragraphs. */
function outlineLevel(id: string, delta: -1 | 1): Command {
  const target = (s: Session): number | null => {
    const cur = styleList(s).find((x) => x.id === styleAt(s))
    const m = cur && /^개요\s*(\d)$/.exec(cur.name)
    if (!m) return null
    const level = Number(m[1]) + delta
    if (level < 1 || level > 7) return null
    return styleList(s).find((x) => new RegExp(`^개요\\s*${level}$`).test(x.name))?.id ?? null
  }
  return {
    id,
    isEnabled: ({ session }) => target(session) !== null,
    run({ session }) {
      const styleId = target(session)!
      const sel = session.selection
      return session.edit(id, () => {
        json(session.doc.raw.applyStyle(session.selection.head.section, session.selection.head.para, styleId), 'applyStyle')
        return sel
      })
    },
  }
}

// ── Columns ─────────────────────────────────────────────────────────────

/** 다단: type 0 일반, same width 1, gap 8 mm (2268 HWPUNIT), as 한글's presets. */
function columns(id: string, count: number, sameWidth: 0 | 1): Command {
  return {
    id,
    isEnabled: ({ session }) => body(session) !== null,
    isActive: ({ session }) => {
      try {
        const c = JSON.parse(session.doc.raw.getColumnDef(session.selection.head.section)) as { columnCount: number; sameWidth: boolean }
        return c.columnCount === count && (count === 1 || c.sameWidth === !!sameWidth)
      } catch {
        return false
      }
    },
    run({ session }) {
      const sel = session.selection
      return session.edit(id, () => {
        json(session.doc.raw.setColumnDef(sel.head.section, count, 0, sameWidth, count === 1 ? 0 : 2268), 'setColumnDef')
        return sel
      })
    },
  }
}

/** 왼쪽/오른쪽: two columns, the narrow one on that side (1 : 2), 8 mm apart. */
function unequalColumns(id: string, ratios: number[]): Command {
  return {
    id,
    isEnabled: ({ session }) => body(session) !== null,
    run({ session }) {
      const sel = session.selection
      return session.edit(id, () => {
        json(session.doc.raw.setColumnWidths(sel.head.section, JSON.stringify(ratios), 2268), 'setColumnWidths')
        return sel
      })
    },
  }
}

// ── Header and footer ───────────────────────────────────────────────────

export const deleteHeaderFooter: Command<{ kind?: 'header' | 'footer' } | undefined> = {
  id: 'page:headerfooter-delete',
  isEnabled: () => true,
  run({ session }, params) {
    const section = session.selection.head.section
    const kinds = params?.kind ? [params.kind] : (['header', 'footer'] as const)
    const sel = session.selection
    return session.edit('page:headerfooter-delete', () => {
      // apply_to: 0 both pages, 1 even, 2 odd
      for (const k of kinds) for (const applyTo of [0, 1, 2]) {
        try {
          session.doc.raw.deleteHeaderFooter(section, k === 'header', applyTo)
        } catch {
          // none of that kind on those pages
        }
      }
      return sel
    })
  },
}

// ── Tables ──────────────────────────────────────────────────────────────

function caret(s: Session): { t: TableTarget; row: number; col: number; cell: number } | null {
  const t = tableAt(s)
  const h = s.selection.head
  if (!t || !h.cell) return null
  const c = tableCells(s, t)[h.cell.cell]
  return c ? { t, row: c.row, col: c.col, cell: c.index } : null
}

function tableCommand(id: string, op: (s: Session, c: NonNullable<ReturnType<typeof caret>>) => Pos | null, enabled?: (s: Session, c: NonNullable<ReturnType<typeof caret>>) => boolean): Command {
  return {
    id,
    isEnabled: ({ session }) => {
      const c = caret(session)
      return !!c && (!enabled || enabled(session, c))
    },
    run({ session }) {
      const c = caret(session)!
      const sel = session.selection
      return session.edit(id, () => {
        const q = op(session, c)
        return q ? { anchor: q, head: q } : sel
      })
    },
  }
}

const firstCell = (t: TableTarget, para = t.host): Pos => ({ section: t.section, para, offset: 0, cell: { control: t.control, cell: 0, para: 0 } })

/** 표 나누기: the rows from the caret's row on become a new table below. */
export const splitTable = tableCommand(
  'table:split',
  (s, c) => {
    const r = json(s.doc.raw.splitTable(c.t.section, c.t.host, c.t.control, c.row), 'splitTable')
    return firstCell(c.t, Number(r.backParaIdx))
  },
  (_s, c) => c.row > 0,
)

/** 표 붙이기: the next table joins this one. */
export const attachTable = tableCommand('table:attach', (s, c) => {
  json(s.doc.raw.mergeTableWithNext(c.t.section, c.t.host, c.t.control), 'mergeTableWithNext')
  return null
})

/** 셀 나누기: a merged cell splits back; a plain cell splits into two columns. */
export const splitCell = tableCommand('table:cell-split', (s, c) => {
  const info = json(s.doc.raw.getCellInfo(c.t.section, c.t.host, c.t.control, c.cell), 'getCellInfo')
  if (Number(info.rowSpan) > 1 || Number(info.colSpan) > 1) json(s.doc.raw.splitTableCell(c.t.section, c.t.host, c.t.control, c.row, c.col), 'splitTableCell')
  else json(s.doc.raw.splitTableCellInto(c.t.section, c.t.host, c.t.control, c.row, c.col, 1, 2, false, false), 'splitTableCellInto')
  return firstCell(c.t)
})

/** 셀 높이를/너비를 같게: the selected cells take their average height or width. */
function distribute(id: string, dim: 'height' | 'width'): Command {
  return tableCommand(
    id,
    (s, c) => {
      const cells = selectedCells(s)
      const sizes = cells.map((i) => Number(json(s.doc.raw.getCellProperties(c.t.section, c.t.host, c.t.control, i), 'getCellProperties')[dim]))
      const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)
      const edits = cells.map((i, k) => ({ cellIdx: i, [dim === 'height' ? 'heightDelta' : 'widthDelta']: avg - sizes[k]! })).filter((e) => Object.values(e)[1] !== 0)
      if (edits.length) json(s.doc.raw.resizeTableCells(c.t.section, c.t.host, c.t.control, JSON.stringify(edits)), 'resizeTableCells')
      return null
    },
    (s) => selectedCells(s).length > 1,
  )
}

/** 행/열 바꿈 복사 and 붙이기 (the engine keeps the transposed copy). */
export const transposeCopy: Command = {
  id: 'table:transpose-copy',
  isEnabled: ({ session }) => caret(session) !== null,
  run({ session }) {
    const c = caret(session)!
    const cells = tableCells(session, c.t)
    const sel = selectedCells(session).map((i) => cells[i]!)
    const r0 = Math.min(...sel.map((x) => x.row))
    const c0 = Math.min(...sel.map((x) => x.col))
    const r1 = Math.max(...sel.map((x) => x.row + x.rowSpan - 1))
    const c1 = Math.max(...sel.map((x) => x.col + x.colSpan - 1))
    json(session.doc.raw.copyTableCellsTransposed(c.t.section, c.t.host, c.t.control, r0, c0, r1, c1), 'copyTableCellsTransposed')
    return null
  },
}

export const transposePaste = tableCommand(
  'table:transpose-paste',
  (s, c) => {
    json(s.doc.raw.pasteTableCellsTransposed(c.t.section, c.t.host, c.t.control, c.row, c.col), 'pasteTableCellsTransposed')
    return null
  },
  (s) => s.doc.raw.hasTableTransposeClipboard(),
)

/** 계산식: write a formula's result (=SUM(A1:A3), =A1*B2 …) into the caret's cell. */
export const tableFormula: Command<{ formula: string }> = {
  id: 'table:formula',
  isEnabled: ({ session }) => caret(session) !== null,
  run({ session }, { formula }) {
    const c = caret(session)!
    const f = formula.trim().startsWith('=') ? formula.trim() : `=${formula.trim()}`
    const sel = session.selection
    return session.edit('table:formula', () => {
      json(session.doc.raw.evaluateTableFormula(c.t.section, c.t.host, c.t.control, c.row, c.col, f, true), 'evaluateTableFormula')
      return sel
    })
  },
}

/** 블록 계산식 (합계, 평균, 곱): the selected cells' result goes into the cell below each column of the block. */
function blockCalc(id: string, fn: 'SUM' | 'AVG' | 'PRODUCT'): Command {
  return {
  id,
  isEnabled: ({ session }) => caret(session) !== null && selectedCells(session).length > 1,
  run({ session }) {
    const c = caret(session)!
    const cells = tableCells(session, c.t)
    const sel = selectedCells(session).map((i) => cells[i]!)
    const r1 = Math.max(...sel.map((x) => x.row + x.rowSpan - 1))
    const c0 = Math.min(...sel.map((x) => x.col))
    const c1 = Math.max(...sel.map((x) => x.col + x.colSpan - 1))
    const r0 = Math.min(...sel.map((x) => x.row))
    const ref = (r: number, col: number) => `${String.fromCharCode(65 + col)}${r + 1}`
    const below = r1 + 1
    const dims = json(session.doc.raw.getTableDimensions(c.t.section, c.t.host, c.t.control), 'getTableDimensions')
    if (below >= Number(dims.rowCount)) throw new Error(`${id}: no row below the block for the result`)
    const s0 = session.selection
    return session.edit(id, () => {
      for (let col = c0; col <= c1; col++) json(session.doc.raw.evaluateTableFormula(c.t.section, c.t.host, c.t.control, below, col, `=${fn}(${ref(r0, col)}:${ref(r1, col)})`, true), 'evaluateTableFormula')
      return s0
    })
  },
  }
}
export const blockFormula = blockCalc('table:block-formula', 'SUM')

export const tableCaption = tableCommand('table:caption-toggle', (s, c) => {
  const p = json(s.doc.raw.getTableProperties(c.t.section, c.t.host, c.t.control), 'getTableProperties')
  json(s.doc.raw.setTableProperties(c.t.section, c.t.host, c.t.control, JSON.stringify({ hasCaption: !p.hasCaption })), 'setTableProperties')
  return null
})

// ── Objects ─────────────────────────────────────────────────────────────

function objectCommand(id: string, props: (p: Record<string, unknown>) => Record<string, unknown>): Command {
  return {
    id,
    isEnabled: ({ session }) => session.object !== null && session.object.kind !== 'chart' && session.object.kind !== 'equation',
    run(ctx) {
      const p = objectProperties(ctx.session)
      if (!p) return null
      const o = ctx.session.object!
      const sel = ctx.session.selection
      return ctx.session.edit(id, () => {
        const raw = ctx.session.doc.raw
        const body = JSON.stringify(props(p))
        json(o.kind === 'picture' ? raw.setPictureProperties(o.section, o.para, o.control, body) : raw.setShapeProperties(o.section, o.para, o.control, body), id)
        return sel
      })
    },
  }
}

const rotate = (by: number) => (p: Record<string, unknown>) => ({ rotationAngle: (((Number(p.rotationAngle ?? 0) + by) % 360) + 360) % 360 })

/** 글상자: a text box at the caret, through insert:shape. */
export const insertTextbox: Command = {
  id: 'insert:textbox',
  isEnabled: ({ session }) => body(session) !== null,
  run: (ctx) => insertShape.run(ctx, { shapeType: 'textbox' }),
}

/** 개체 묶기: the objects Shift+clicked together become one group. */
export const group: Command = {
  id: 'insert:group-shapes',
  isEnabled: ({ session }) => {
    const all = session.selectedObjects()
    return all.length >= 2 && all.every((o) => (o.kind === 'shape' || o.kind === 'picture') && o.section === all[0]!.section)
  },
  run({ session }) {
    const all = session.selectedObjects()
    const section = all[0]!.section
    let made: { paraIdx: number; controlIdx: number } | null = null
    const change = session.edit('insert:group-shapes', () => {
      made = json(session.doc.raw.groupShapes(JSON.stringify({ sectionIdx: section, targets: all.map((o) => ({ paraIdx: o.para, controlIdx: o.control })) })), 'groupShapes') as { paraIdx: number; controlIdx: number }
      return session.selection
    })
    const m = made as { paraIdx: number; controlIdx: number } | null
    session.selectObject(m ? { kind: 'shape', section, para: m.paraIdx, control: m.controlIdx } : null)
    return change
  },
}

export const ungroup: Command = {
  id: 'insert:ungroup-shapes',
  isEnabled: ({ session }) => {
    const o = session.object
    if (!o || o.kind !== 'shape' || session.others.length) return false
    try {
      return !!objectBox(session, o)?.group
    } catch {
      return false
    }
  },
  run({ session }) {
    const o = session.object!
    const change = session.edit('insert:ungroup-shapes', () => {
      json(session.doc.raw.ungroupShape(o.section, o.para, o.control), 'ungroupShape')
      return session.selection
    })
    session.selectObject(null)
    return change
  },
}

// ── Editing ─────────────────────────────────────────────────────────────

/** 지우기 (Ctrl+E): the selection, or the character after the caret. */
export const deleteCommand: Command = {
  id: 'edit:delete',
  isEnabled: () => true,
  run: (ctx) => deleteForward.run(ctx),
}

/** 메모 이동: the caret goes to the next or previous memo's text, in document order. */
function memoMove(id: string, dir: 1 | -1): Command {
  const target = (s: Session): Pos | null => {
    const here = ordered(s.selection)[dir > 0 ? 1 : 0]
    const memos = s.doc.memos()
      .filter((m) => m.target.cellPath.length === 0)
      .map((m) => ({ section: m.target.section, para: m.target.para, offset: m.start }))
      .sort((a, b) => a.section - b.section || a.para - b.para || a.offset - b.offset)
    const key = (p: Pos) => [p.section, p.para, p.offset]
    const cmp = (a: Pos, b: Pos) => {
      const x = key(a)
      const y = key(b)
      for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!
      return 0
    }
    const hits = dir > 0 ? memos.filter((m) => cmp(m, here) > 0) : memos.filter((m) => cmp(m, here) < 0).reverse()
    return hits[0] ?? null
  }
  return {
    id,
    isEnabled: ({ session }) => target(session) !== null,
    run({ session }) {
      const p = target(session)!
      session.select({ anchor: p, head: p })
      return null
    },
  }
}

/** 메모 지우기: the memo whose text holds the caret. */
export const deleteMemo: Command = {
  id: 'review:memo-delete',
  isEnabled: ({ session }) => memoAt(session) !== null,
  run({ session }) {
    const m = memoAt(session)!
    const sel = session.selection
    return session.edit('review:memo-delete', () => {
      session.doc.removeMemo(m)
      return sel
    })
  },
}

function memoAt(s: Session): number | null {
  const h = s.selection.head
  const m = s.doc.memos().find((x) => x.target.cellPath.length === 0 && x.target.section === h.section && x.target.para === h.para && h.offset >= x.start && h.offset <= x.end)
  return m ? m.fieldId : null
}

// ── Character outline, format painter ───────────────────────────────────

/** 외곽선: the character outline attribute (HWP outline type 1 = solid). */
export const toggleOutline: Command = {
  id: 'format:outline',
  isEnabled: () => true,
  isActive: ({ session }) => Number(session.text.charPropertiesAt(ordered(session.selection)[0]).outlineType ?? 0) !== 0,
  run(ctx) {
    const on = Number(ctx.session.text.charPropertiesAt(ordered(ctx.session.selection)[0]).outlineType ?? 0) !== 0
    return applyCharShape.run(ctx, { props: { outlineType: on ? 0 : 1 } })
  },
}

/** 모양 복사 holds one character and paragraph shape per session, as 한글's does. */
const painter = new WeakMap<Session, { char: Record<string, unknown>; para: Record<string, unknown> }>()
const CHAR_KEYS = ['fontSize', 'bold', 'italic', 'underline', 'strikethrough', 'superscript', 'subscript', 'emboss', 'engrave', 'textColor', 'shadeColor', 'ratios', 'spacings', 'relativeSizes', 'charOffsets', 'outlineType']

export const formatCopy: Command = {
  id: 'edit:format-copy',
  isEnabled: () => true,
  isActive: ({ session }) => painter.has(session),
  run({ session }) {
    const at = ordered(session.selection)[0]
    const c = session.text.charPropertiesAt(at)
    const p = paraProps(session, at)
    const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))
    // Read-back lengths are px; the apply path takes the dialog's write units, so only
    // unit-free paragraph keys are carried (alignment and percent line spacing).
    const para = pick(p, ['alignment', ...(p.lineSpacingType === 'Percent' ? ['lineSpacing', 'lineSpacingType'] : [])])
    if (c.fontFamilies) (c as Record<string, unknown>).fontIds = (c.fontFamilies as string[]).map((name, k) => session.doc.raw.findOrCreateFontIdForLang(k, name))
    painter.set(session, { char: { ...pick(c, CHAR_KEYS), ...(c.fontIds ? { fontIds: c.fontIds } : {}) }, para })
    return null
  },
}

export const formatPaste: Command = {
  id: 'edit:format-paste',
  isEnabled: ({ session }) => painter.has(session),
  run(ctx) {
    const f = painter.get(ctx.session)!
    return ctx.session.group('edit:format-paste', () => {
      if (Object.keys(f.char).length && ordered(ctx.session.selection)[0] !== ordered(ctx.session.selection)[1]) applyCharShape.run(ctx, { props: f.char })
      if (Object.keys(f.para).length) applyParaShape.run(ctx, { props: f.para })
      return ctx.session.selection
    })
  },
}

// ── Pages: go to, new page number, page-number fields ──────────────────

/** 찾아가기 (쪽): the caret goes to the top of the body on a page (1-based). */
export const gotoPage: Command<{ page: number }> = {
  id: 'edit:goto-page',
  isEnabled: () => true,
  run({ session }, { page }) {
    const n = session.doc.pageCount()
    const i = Math.min(Math.max(1, Math.round(page)), n) - 1
    const info = session.doc.pageInfo(i)
    const q = fromEngine(session.doc.hitTest(i, info.marginLeft + 1, info.marginTop + info.marginHeader + 1))
    if (q) session.select({ anchor: q, head: q })
    return null
  },
}

/** 새 번호로 시작: page numbers restart at `start` from the caret's page. */
export const newPageNumber: Command<{ start: number }> = {
  id: 'page:new-page-num',
  isEnabled: ({ session }) => body(session) !== null,
  run({ session }, { start }) {
    const p = body(session)!
    const sel = session.selection
    return session.edit('page:new-page-num', () => {
      json(session.doc.raw.insertNewNumber(p.section, p.para, p.offset, Math.max(1, Math.round(start))), 'insertNewNumber')
      return sel
    })
  },
}

/** In a header or footer: 1 page number, 2 total pages, 3 file name, as 한글's field markers. */
function headerFooterField(s: Session, id: string, fieldType: 1 | 2 | 3): ReturnType<Command['run']> {
  const p = s.selection.head
  const st = p.story!
  if (st.kind === 'note') return null
  return s.edit(id, () => {
    json(s.doc.raw.insertFieldInHf(p.section, st.kind === 'header', st.applyTo, p.para, p.offset, fieldType), 'insertFieldInHf')
    const q: Pos = { ...p, offset: Math.min(s.text.length(p), p.offset + 1) }
    return { anchor: q, head: q }
  })
}

const inHeaderFooter = (s: Session) => {
  const st = s.selection.head.story
  return !!st && st.kind !== 'note'
}

/** 파일 이름: only inside a header or footer, where 한글 keeps it. */
export const fileNameField: Command = {
  id: 'page:insert-field-filename',
  isEnabled: ({ session }) => inHeaderFooter(session),
  run: ({ session }) => headerFooterField(session, 'page:insert-field-filename', 3),
}

/** 쪽 번호 / 전체 쪽 수 at the caret, as an automatic number (a field marker in a header or footer). */
function autoNumber(id: string, kind: 'page' | 'total'): Command {
  return {
    id,
    isEnabled: ({ session }) => inHeaderFooter(session) || (body(session) !== null && session.selection.head.section === 0),
    run({ session }) {
      if (inHeaderFooter(session)) return headerFooterField(session, id, kind === 'page' ? 1 : 2)
      const p = body(session)!
      return session.edit(id, () => {
        json(session.doc.raw.insertAutoNumberAtCursor(0, p.para, p.offset, kind), 'insertAutoNumberAtCursor')
        const q: Pos = { ...p, offset: Math.min(session.text.length(p), p.offset + 1) }
        return { anchor: q, head: q }
      })
    },
  }
}

// ── Table numbers: thousands separators ─────────────────────────────────

/** 1,000 단위 구분 쉼표 넣기/빼기 over the selected cells' numbers. */
function thousands(id: string, add: boolean): Command {
  const fmt = (t: string): string => {
    const m = /^(\s*)([-+]?)([\d,]+)(\.\d+)?(\s*)$/.exec(t)
    if (!m) return t
    const digits = m[3]!.replace(/,/g, '')
    const body = add ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : digits
    return `${m[1]}${m[2]}${body}${m[4] ?? ''}${m[5]}`
  }
  return {
    id,
    isEnabled: ({ session }) => tableAt(session) !== null,
    run({ session }) {
      const t = tableAt(session)!
      const sel = session.selection
      return session.edit(id, () => {
        for (const cell of selectedCells(session)) {
          const at: Pos = { section: t.section, para: t.host, offset: 0, cell: { control: t.control, cell, para: 0 } }
          const text = session.text.text(at)
          const next = fmt(text)
          if (next === text) continue
          session.text.delete(at, { ...at, offset: session.text.length(at) })
          session.text.insert(at, next)
        }
        return sel
      })
    },
  }
}

// ── 감추기 ───────────────────────────────────────────────────────────────

export interface PageHide {
  header: boolean
  footer: boolean
  master: boolean
  border: boolean
  fill: boolean
  pageNum: boolean
}

/** What is hidden on the caret's page (the 감추기 control in its paragraph). */
export function pageHideAt(s: Session): PageHide {
  const p = s.selection.head
  try {
    const r = JSON.parse(s.doc.raw.getPageHide(p.section, p.para)) as Record<string, boolean>
    return { header: !!r.hideHeader, footer: !!r.hideFooter, master: !!r.hideMasterPage, border: !!r.hideBorder, fill: !!r.hideFill, pageNum: !!r.hidePageNum }
  } catch {
    return { header: false, footer: false, master: false, border: false, fill: false, pageNum: false }
  }
}

export const setPageHide: Command<PageHide> = {
  id: 'page:hide',
  isEnabled: ({ session }) => body(session) !== null,
  run({ session }, h) {
    const p = body(session)!
    const sel = session.selection
    return session.edit('page:hide', () => {
      json(session.doc.raw.setPageHide(p.section, p.para, h.header, h.footer, h.master, h.border, h.fill, h.pageNum), 'setPageHide')
      return sel
    })
  },
}

export const STRUCTURE_COMMANDS = [
  setPageHide,
  fileNameField,
  toggleOutline,
  formatCopy,
  formatPaste,
  gotoPage,
  newPageNumber,
  autoNumber('page:insert-field-pagenum', 'page'),
  autoNumber('page:insert-field-totalpage', 'total'),
  thousands('table:thousand-sep', true),
  thousands('table:decimal-add', true),
  thousands('table:decimal-remove', false),
  headCommand('format:toggle-numbering', 'Number', true),
  headCommand('format:toggle-bullet', 'Bullet', true),
  headCommand('format:apply-bullet', 'Bullet', false),
  outlineLevel('format:level-increase', -1),
  outlineLevel('format:level-decrease', 1),
  columns('page:col-1', 1, 1),
  columns('page:col-2', 2, 1),
  columns('page:col-3', 3, 1),
  unequalColumns('page:col-left', [1, 2]),
  unequalColumns('page:col-right', [2, 1]),
  deleteHeaderFooter,
  splitTable,
  attachTable,
  splitCell,
  distribute('table:cell-height-equal', 'height'),
  distribute('table:cell-width-equal', 'width'),
  transposeCopy,
  transposePaste,
  tableFormula,
  blockFormula,
  blockCalc('table:block-avg', 'AVG'),
  blockCalc('table:block-product', 'PRODUCT'),
  tableCaption,
  objectCommand('insert:rotate-cw', rotate(90)),
  objectCommand('insert:rotate-ccw', rotate(-90)),
  objectCommand('insert:flip-horz', (p) => ({ horzFlip: !p.horzFlip })),
  objectCommand('insert:flip-vert', (p) => ({ vertFlip: !p.vertFlip })),
  objectCommand('insert:caption-toggle', (p) => ({ hasCaption: !p.hasCaption })),
  insertTextbox,
  group,
  ungroup,
  deleteCommand,
  memoMove('review:memo-next', 1),
  memoMove('review:memo-previous', -1),
  deleteMemo,
] as Command<never>[]
