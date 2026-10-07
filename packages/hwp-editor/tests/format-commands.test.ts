import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, nextFontSize, styleAt, styleList, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())

function open(text = '대한민국 헌법'): { s: Session; bus: CommandBus } {
  const doc = HwpCoreDocument.blank()
  doc.insertText(0, 0, 0, text)
  const s = new Session(doc, 'hwpx')
  return { s, bus: new CommandBus(s) }
}

const p = (para: number, offset: number): Pos => ({ section: 0, para, offset })
const select = (s: Session, a: Pos, b: Pos) => s.select({ anchor: a, head: b })

/** Every command must survive a save and reopen with its effect intact. */
function reopen(s: Session): HwpCoreDocument {
  return HwpCoreDocument.open(s.export('hwpx'))
}

describe('character commands', () => {
  it('자간 and 장평 step by one point per script and survive a save', () => {
    const { s, bus } = open()
    select(s, p(0, 0), p(0, 4))
    bus.run('format:char-spacing-increase')
    bus.run('format:char-spacing-increase')
    bus.run('format:char-ratio-decrease')
    const back = reopen(s).charPropertiesAt(0, 0, 0)
    expect(back.spacings).toEqual([2, 2, 2, 2, 2, 2, 2])
    expect(back.ratios).toEqual([99, 99, 99, 99, 99, 99, 99])
    expect(reopen(s).charPropertiesAt(0, 0, 5).spacings).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('font size steps through 한글’s sizes', () => {
    expect(nextFontSize(10, 1)).toBe(11)
    expect(nextFontSize(16, 1)).toBe(18)
    expect(nextFontSize(18, -1)).toBe(16)
    const { s, bus } = open()
    select(s, p(0, 0), p(0, 2))
    bus.run('format:font-size-increase')
    expect(s.text.charPropertiesAt(p(0, 0)).fontSize).toBe(1100)
    bus.run('format:font-size', { pt: 24 })
    expect(reopen(s).charPropertiesAt(0, 0, 0).fontSize).toBe(2400)
  })

  it('superscript and subscript exclude each other', () => {
    const { s, bus } = open()
    select(s, p(0, 0), p(0, 2))
    bus.run('format:superscript')
    expect(bus.isActive('format:superscript')).toBe(true)
    bus.run('format:subscript')
    const c = s.text.charPropertiesAt(p(0, 0))
    expect([c.superscript, c.subscript]).toEqual([false, true])
  })

  it('sets colour and a font for one script only', () => {
    const { s, bus } = open('한글 English')
    select(s, p(0, 0), p(0, 10))
    bus.run('format:text-color', { color: '#FF0000' })
    bus.run('format:font-family', { name: '함초롬돋움', scripts: [0] })
    const c = reopen(s).charPropertiesAt(0, 0, 0)
    expect(c.textColor).toBe('#ff0000')
    expect((c.fontFamilies as string[])[0]).toBe('함초롬돋움')
    expect((c.fontFamilies as string[])[1]).toBe('함초롬바탕')
  })

  it('needs a selection', () => {
    const { bus } = open()
    expect(bus.isEnabled('format:char-spacing-increase')).toBe(false)
  })
})

describe('paragraph commands', () => {
  it('aligns every selected paragraph, or the caret’s paragraph', () => {
    const { s, bus } = open('첫째')
    bus.run('edit:insert-text', { text: '\n둘째\n셋째' })
    select(s, p(0, 1), p(1, 1))
    bus.run('format:align-center')
    const back = reopen(s)
    expect([0, 1, 2].map((i) => back.paraPropertiesAt(0, i).alignment)).toEqual(['center', 'center', 'justify'])
    s.select({ anchor: p(2, 0), head: p(2, 0) })
    bus.run('format:align-right')
    expect(bus.isActive('format:align-right')).toBe(true)
    expect(reopen(s).paraPropertiesAt(0, 2).alignment).toBe('right')
  })

  it('line spacing steps by 10%', () => {
    const { s, bus } = open()
    bus.run('format:line-spacing-increase')
    expect(reopen(s).paraPropertiesAt(0, 0).lineSpacing).toBe(170)
    bus.run('format:line-spacing-decrease')
    bus.run('format:line-spacing-decrease')
    expect(reopen(s).paraPropertiesAt(0, 0).lineSpacing).toBe(150)
  })

  it('applies a style from the document’s style list', () => {
    const { s, bus } = open()
    const outline1 = styleList(s).find((x) => x.name === '개요 1')!
    bus.run('format:apply-style', { styleId: outline1.id })
    expect(styleAt(s)).toBe(outline1.id)
    expect(JSON.parse(reopen(s).raw.getStyleAt(0, 0)).name).toBe('개요 1')
  })

  it('each command is one undo step', () => {
    const { s, bus } = open()
    select(s, p(0, 0), p(0, 4))
    bus.run('format:char-ratio-increase')
    bus.run('format:align-center')
    bus.run('edit:undo')
    expect(s.text.charPropertiesAt(p(0, 0)).ratios).toEqual([101, 101, 101, 101, 101, 101, 101])
    expect(JSON.parse(s.doc.raw.getParaPropertiesAt(0, 0)).alignment).toBe('justify')
  })
})

describe('structure commands', () => {
  it('page break, then a table with row and column edits', () => {
    const { s, bus } = open('앞 문단')
    s.select({ anchor: p(0, 4), head: p(0, 4) })
    bus.run('page:break')
    expect(s.doc.pageCount()).toBe(2)
    bus.run('table:create', { rows: 2, cols: 2 })
    expect(s.selection.head.cell).toEqual({ control: expect.any(Number), cell: 0, para: 0 })
    bus.run('edit:insert-text', { text: '머리' })
    bus.run('table:insert-row-below')
    bus.run('table:insert-col-right')
    const host = s.selection.head.para
    const control = s.selection.head.cell!.control
    expect(JSON.parse(s.doc.raw.getTableDimensions(0, host, control))).toMatchObject({ rowCount: 3, colCount: 3 })
    bus.run('table:delete-row')
    expect(JSON.parse(s.doc.raw.getTableDimensions(0, host, control))).toMatchObject({ rowCount: 2 })
    const back = reopen(s)
    expect(JSON.parse(back.raw.getTableDimensions(0, host, control))).toMatchObject({ rowCount: 2, colCount: 3 })
  })

  it('merges a range of cells', () => {
    const { s, bus } = open('')
    bus.run('table:create', { rows: 2, cols: 2 })
    const h = s.selection.head
    s.select({ anchor: h, head: { ...h, cell: { ...h.cell!, cell: 3 } } })
    expect(bus.isEnabled('table:cell-merge')).toBe(true)
    bus.run('table:cell-merge')
    expect(JSON.parse(s.doc.raw.getTableDimensions(0, h.para, h.cell!.control)).cellCount).toBe(1)
  })

  it('table commands need the caret in a table', () => {
    const { bus } = open()
    expect(bus.isEnabled('table:insert-row-below')).toBe(false)
    expect(bus.isEnabled('table:delete')).toBe(false)
  })
})

describe('coverage (task 2.6)', () => {
  it('reports which 한글 commands the editor can run', () => {
    const coverage = JSON.parse(readFileSync(join(__dirname, '../../../.kiro/specs/hangul-editor/coverage/commands.json'), 'utf8')) as { commands: Array<{ id: string; group: string }> }
    const { bus } = open()
    const ids = new Set(bus.ids())
    const covered = coverage.commands.filter((c) => ids.has(c.id))
    // Today's floor; raise it as commands land. The full list must be reached before cutover.
    expect(covered.length).toBeGreaterThanOrEqual(37)
    const byGroup: Record<string, string> = {}
    for (const g of new Set(coverage.commands.map((c) => c.group))) {
      const all = coverage.commands.filter((c) => c.group === g)
      byGroup[g] = `${all.filter((c) => ids.has(c.id)).length}/${all.length}`
    }
    console.log('coverage', covered.length, '/', coverage.commands.length, byGroup)
  })
})
