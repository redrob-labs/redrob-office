import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, Session, columnSettings, endnoteShape, fieldAt, pageBorder, sectionDef, tableCells, type Pos } from '../src'

beforeAll(() => initHwpCoreNode())
const P = (offset: number): Pos => ({ section: 0, para: 0, offset })

function doc(format: 'hwpx' | 'hwp' = 'hwpx') {
  const s = new Session(HwpCoreDocument.blank(), format)
  s.text.insert(P(0), '본문')
  return { s, bus: new CommandBus(s) }
}
const reopen = (s: Session, f: 'hwpx' | 'hwp') => new Session(HwpCoreDocument.open(s.export(f)), f)

describe('dialog commands (task 2.6)', () => {
  it('inserts several rows and columns, then deletes the selected ones', () => {
    const { s, bus } = doc()
    bus.run('table:create', { rows: 2, cols: 2 })
    const h = s.selection.head
    const t = { section: 0, host: h.para, control: h.cell!.control }
    const dims = () => JSON.parse(s.doc.raw.getTableDimensions(0, t.host, t.control)) as { rowCount: number; colCount: number }
    bus.run('table:insert-rows-cols', { where: 'below', count: 3 })
    bus.run('table:insert-rows-cols', { where: 'right', count: 2 })
    expect(dims()).toMatchObject({ rowCount: 5, colCount: 4 })
    const at = (cell: number): Pos => ({ section: 0, para: t.host, offset: 0, cell: { control: t.control, cell, para: 0 } })
    s.select({ anchor: at(0), head: at(4) })
    bus.run('table:delete-rows-cols', { what: 'rows' })
    expect(dims().rowCount).toBe(3)
    bus.run('table:delete-rows-cols', { what: 'cols' })
    expect(dims().colCount).toBe(3)
    expect(tableCells(s, t)).toHaveLength(9)
    bus.run('edit:undo')
    expect(dims().colCount).toBe(4)
  })

  it('column, section, page border and endnote settings survive both formats', () => {
    for (const f of ['hwpx', 'hwp'] as const) {
      const { s, bus } = doc(f)
      bus.run('page:columns-set', { count: 3, type: 0, sameWidth: true, spacing: 1700 })
      bus.run('page:section-set', { props: { pageNum: 5, hideEmptyLine: true } })
      bus.run('page:border-set', { props: { borderTop: { type: 1, width: 2, color: '#0000ff' }, borderBottom: { type: 1, width: 2, color: '#0000ff' }, borderLeft: { type: 1, width: 2, color: '#0000ff' }, borderRight: { type: 1, width: 2, color: '#0000ff' } } })
      bus.run('note:endnote-shape-set', { props: { suffixChar: ']', startNumber: 3 } })
      const back = reopen(s, f)
      expect(columnSettings(back), f).toMatchObject({ count: 3, sameWidth: true, spacing: 1700 })
      expect(sectionDef(back).pageNum, f).toBe(5)
      expect((pageBorder(back).borderTop as { type: number }).type, f).toBe(1)
      expect(endnoteShape(back), f).toMatchObject({ suffixChar: ']', startNumber: 3 })
    }
  })

  it('applies a header template with a centred page number', () => {
    const { s, bus } = doc()
    bus.run('page:hf-template', { header: true, template: 2 })
    const hf = JSON.parse(s.doc.raw.getHeaderFooter(0, true, 0)) as { exists: boolean }
    expect(hf.exists).toBe(true)
    bus.run('edit:undo')
    expect((JSON.parse(s.doc.raw.getHeaderFooter(0, true, 0)) as { exists: boolean }).exists).toBe(false)
  })

  it('numbers paragraphs with a preset and restarts at a given number', () => {
    const { s, bus } = doc()
    bus.run('format:numbering-shape', { preset: 'circled', start: 4, restart: true })
    const pp = JSON.parse(s.doc.raw.getParaPropertiesAt(0, 0)) as { headType: string; numberingId: number }
    expect(pp.headType).toBe('Number')
    const list = JSON.parse(s.doc.raw.getNumberingList()) as Array<{ id: number; levelFormats: string[] }>
    expect(list.find((n) => n.id === pp.numberingId)!.levelFormats[0]).toBe('^1')
    expect(() => bus.run('format:numbering-shape', { preset: 'nope' })).toThrow()
  })

  it('renames a click-here field and sets its value', () => {
    const { s, bus } = doc()
    s.select({ anchor: P(2), head: P(2) })
    bus.run('insert:field', { guide: '이름', name: 'who' })
    bus.run('field:edit-apply', { name: 'applicant', value: '홍길동' })
    const f = fieldAt(s, P(2))!
    expect(f.name).toBe('applicant')
    expect(s.doc.text(0, 0)).toContain('홍길동')
  })
})
