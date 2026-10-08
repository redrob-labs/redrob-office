/**
 * 차트 (chart) for the owned editor (spec task 2.4): insert a chart from a small
 * data sheet, or edit the selected chart's data. The sheet is laid out as 한글's
 * own: categories down the first column, one column per series. Values must be
 * numbers; the engine stores them in the chart part and its OLE copy.
 */
import { useMemo, useState } from 'react'
import { chartData, selectedChart, type EditorView } from '@genoffice/hwp-editor'
import type { ChartKind } from '@genoffice/hwp-core'
import { Button, Dialog, Input, Select } from '@genoffice/ui'
import { useI18n, type StringKey } from '../i18n/locale'

type Props = { view: EditorView; onClose: () => void; onApplied: () => void }

const KINDS: Array<[ChartKind, StringKey]> = [
  ['column', 'nextChartColumn'],
  ['bar', 'nextChartBar'],
  ['line', 'nextChartLine'],
  ['pie', 'nextChartPie'],
]
const MAX_SERIES = 25
const MAX_ROWS = 500

interface Sheet {
  series: string[]
  categories: string[]
  /** values[row][col] as typed */
  values: string[][]
}

const isNumber = (v: string) => v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.')))
const toNumber = (v: string) => Number(v.replace(',', '.'))

export function ChartDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const { t } = useI18n()
  const editing = useMemo(() => selectedChart(view.session), [view])
  const initial = useMemo<Sheet>(() => {
    const d = editing ? chartData(view.session, editing) : null
    if (d?.ok && d.series?.length && d.labels) {
      return {
        series: d.series.map((s, i) => s.name ?? `${t('nextChartSeries')} ${i + 1}`),
        categories: [...d.labels],
        values: d.labels.map((_, r) => d.series!.map((s) => s.values[r] ?? '')),
      }
    }
    return {
      series: [1, 2, 3].map((i) => `${t('nextChartSeries')} ${i}`),
      categories: [1, 2, 3, 4].map((i) => `${t('nextChartCategory')} ${i}`),
      values: [
        ['4.3', '2.4', '2'],
        ['2.5', '4.4', '2'],
        ['3.5', '1.8', '3'],
        ['4.5', '2.8', '5'],
      ],
    }
  }, [editing, view, t])
  const [sheet, setSheet] = useState<Sheet>(initial)
  const [kind, setKind] = useState<ChartKind>('column')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const bad = sheet.values.some((row) => row.some((v) => !isNumber(v)))
  const setCell = (r: number, c: number, v: string) => setSheet((s) => ({ ...s, values: s.values.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) }))
  const addRow = () => setSheet((s) => (s.categories.length >= MAX_ROWS ? s : { ...s, categories: [...s.categories, `${t('nextChartCategory')} ${s.categories.length + 1}`], values: [...s.values, s.series.map(() => '0')] }))
  const addColumn = () => setSheet((s) => (s.series.length >= MAX_SERIES ? s : { ...s, series: [...s.series, `${t('nextChartSeries')} ${s.series.length + 1}`], values: s.values.map((row) => [...row, '0']) }))
  const removeRow = () => setSheet((s) => (s.categories.length <= 1 ? s : { ...s, categories: s.categories.slice(0, -1), values: s.values.slice(0, -1) }))
  const removeColumn = () => setSheet((s) => (s.series.length <= 1 ? s : { ...s, series: s.series.slice(0, -1), values: s.values.map((row) => row.slice(0, -1)) }))

  const apply = () => {
    if (bad) return
    const series = sheet.series.map((name, c) => ({ name: name.trim() || `${t('nextChartSeries')} ${c + 1}`, values: sheet.values.map((row) => toNumber(row[c]!)) }))
    const categories = sheet.categories.map((c, i) => c.trim() || `${t('nextChartCategory')} ${i + 1}`)
    try {
      if (editing) view.run('chart:set-data', { categories, series })
      else view.run('insert:chart', { chart: { kind, title: title.trim() || undefined, categories, series } })
    } catch (e) {
      setError(/[<>&]/.test(JSON.stringify({ categories, series, title })) ? t('nextChartBadText') : String(e instanceof Error ? e.message : e))
      return
    }
    onApplied()
    onClose()
  }

  return (
    <Dialog
      title={editing ? t('nextChartEditTitle') : t('nextChartTitle')}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('nextDialogCancel')}
          </Button>
          <Button onClick={apply} disabled={bad}>
            {editing ? t('nextDialogApply') : t('nextChartInsert')}
          </Button>
        </>
      }
    >
      <div className="hangul-dialog-stack">
        {editing ? null : (
          <div className="hangul-dialog-grid">
            <Select label={t('nextChartKind')} value={kind} options={KINDS.map(([k, key]) => ({ value: k, label: t(key) }))} onChange={(_e, o) => o && setKind(o.value as ChartKind)} />
            <Input label={t('nextChartTitleLabel')} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}
        {kind === 'pie' && !editing ? <p className="hangul-dialog-note">{t('nextChartPieNote')}</p> : null}
        <div className="hangul-chart-sheet" role="group" aria-label={t('nextChartData')}>
          <table>
            <thead>
              <tr>
                <th scope="col" />
                {sheet.series.map((name, c) => (
                  <th key={c} scope="col">
                    <input aria-label={`${t('nextChartSeries')} ${c + 1}`} value={name} onChange={(e) => setSheet((s) => ({ ...s, series: s.series.map((x, j) => (j === c ? e.target.value : x)) }))} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.categories.map((cat, r) => (
                <tr key={r}>
                  <th scope="row">
                    <input aria-label={`${t('nextChartCategory')} ${r + 1}`} value={cat} onChange={(e) => setSheet((s) => ({ ...s, categories: s.categories.map((x, i) => (i === r ? e.target.value : x)) }))} />
                  </th>
                  {sheet.series.map((_, c) => {
                    const v = sheet.values[r]![c]!
                    return (
                      <td key={c}>
                        <input inputMode="decimal" aria-label={`${cat}, ${sheet.series[c]}`} aria-invalid={!isNumber(v)} value={v} onChange={(e) => setCell(r, c, e.target.value)} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hangul-style-editor__actions">
          <Button size="sm" variant="secondary" onClick={addRow}>
            {t('nextChartAddRow')}
          </Button>
          <Button size="sm" variant="secondary" onClick={removeRow} disabled={sheet.categories.length <= 1}>
            {t('nextChartRemoveRow')}
          </Button>
          <Button size="sm" variant="secondary" onClick={addColumn}>
            {t('nextChartAddSeries')}
          </Button>
          <Button size="sm" variant="secondary" onClick={removeColumn} disabled={sheet.series.length <= 1}>
            {t('nextChartRemoveSeries')}
          </Button>
        </div>
        {bad ? (
          <p className="hangul-dialog-note" role="alert">
            {t('nextChartNumbersOnly')}
          </p>
        ) : null}
        {error ? (
          <p className="hangul-dialog-note" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
