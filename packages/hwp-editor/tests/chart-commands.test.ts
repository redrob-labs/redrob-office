import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode, type NewChart } from '@genoffice/hwp-core/node'
import { CommandBus, Session, chartData, objectBox, objectsOnPage, selectedChart } from '../src'

beforeAll(() => initHwpCoreNode())

const chart = (kind: NewChart['kind'] = 'column'): NewChart => ({
  kind,
  title: '분기별 실적',
  categories: ['1분기', '2분기', '3분기'],
  series: [
    { name: '매출', values: [4.3, 2.5, 3.5] },
    { name: '비용', values: [2, 3, 1.5] },
  ],
})

describe('charts (task 2.4, engine E7)', () => {
  it('inserts a chart at the caret, selects it, and it is drawn on the page', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    const bus = new CommandBus(s)
    bus.run('insert:chart', { chart: chart() })
    const o = selectedChart(s)!
    expect(o.kind).toBe('chart')
    const box = objectBox(s, o)!
    expect(box.width).toBeGreaterThan(300)
    expect(objectsOnPage(s, 0).filter((b) => b.kind === 'chart')).toHaveLength(1)
    const d = chartData(s)!
    expect(d.labels).toEqual(['1분기', '2분기', '3분기'])
    expect(d.series!.map((x) => x.name)).toEqual(['매출', '비용'])
    bus.run('edit:undo')
    expect(s.doc.charts()).toHaveLength(0)
  })

  it('every kind survives a save in both formats', () => {
    for (const format of ['hwpx', 'hwp'] as const) {
      for (const kind of ['column', 'bar', 'line', 'pie'] as const) {
        const s = new Session(HwpCoreDocument.blank(), format)
        new CommandBus(s).run('insert:chart', { chart: chart(kind) })
        const back = new Session(HwpCoreDocument.open(s.export(format)), format)
        const [c] = back.doc.charts()
        expect(c, `${format} ${kind}`).toBeDefined()
        expect(back.doc.chartData(c!.section, c!.paragraph, c!.control).series![0]!.values, `${format} ${kind}`).toEqual(['4.3', '2.5', '3.5'])
      }
    }
  })

  it('edits data, adding a category and a series, as one undo step', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    const bus = new CommandBus(s)
    bus.run('insert:chart', { chart: chart() })
    bus.run('chart:set-data', {
      categories: ['1분기', '2분기', '3분기', '4분기'],
      series: [
        { name: '매출', values: [4.3, 2.5, 3.5, 6] },
        { name: '비용', values: [2, 3, 1.5, 2] },
        { name: '이익', values: [2.3, -0.5, 2, 4] },
      ],
    })
    const d = chartData(s)!
    expect(d.labels).toEqual(['1분기', '2분기', '3분기', '4분기'])
    expect(d.series!.map((x) => x.name)).toEqual(['매출', '비용', '이익'])
    expect(d.series![2]!.values).toEqual(['2.3', '-0.5', '2', '4'])
    const back = new Session(HwpCoreDocument.open(s.export('hwp')), 'hwp')
    const [c] = back.doc.charts()
    expect(back.doc.chartData(c!.section, c!.paragraph, c!.control).series).toHaveLength(3)
    s.selectObject(selectedChart(s) ?? objectsOnPage(s, 0).find((b) => b.kind === 'chart')!)
    bus.run('edit:undo')
    const [u] = s.doc.charts()
    expect(s.doc.chartData(u!.section, u!.paragraph, u!.control).series).toHaveLength(2)
  })

  it('refuses mismatched or non-numeric data and markup in names', () => {
    const s = new Session(HwpCoreDocument.blank(), 'hwpx')
    const bus = new CommandBus(s)
    bus.run('insert:chart', { chart: chart() })
    expect(() => bus.run('chart:set-data', { categories: ['a'], series: [{ name: 'x', values: [1, 2] }] })).toThrow(/one number per category/)
    expect(() => bus.run('chart:set-data', { categories: ['a'], series: [{ name: 'x', values: [Number.NaN] }] })).toThrow(/one number per category/)
    expect(() => bus.run('insert:chart', { chart: { ...chart(), title: 'A & B' } })).toThrow()
    expect(s.doc.charts()).toHaveLength(1)
  })
})
