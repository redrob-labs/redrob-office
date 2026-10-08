/**
 * 표/셀 속성 (table and cell properties) for the owned editor (spec task 2.3).
 * Three tabs, as in 한글 2024: 표 (margins, page breaks, header repeat,
 * placement), 셀 (size, inside margins, vertical alignment, header and
 * protection), and 테두리/배경 (border lines and fill for the selected cells).
 *
 * The dialog reads the engine's own property JSON and applies only what the
 * person changed: table keys through table:set-properties, cell keys through
 * table:cell-set-properties for every selected cell. Each is one undo step.
 */
import { useMemo, useState } from 'react'
import { HWPUNIT_PER_MM, cellProperties, selectedCells, tableProperties, type EditorView } from '@genoffice/hwp-editor'
import { Button, Checkbox, Dialog, Input, Select, Tabs } from '@genoffice/ui'
import { useI18n, type StringKey } from '../i18n/locale'

type Props = { view: EditorView; onClose: () => void; onApplied: () => void }
type Tab = 'table' | 'cell' | 'border'

const mm = (hu: unknown) => Math.round((Number(hu) / HWPUNIT_PER_MM) * 10) / 10
const hu = (mmValue: number) => Math.round(Math.max(0, mmValue) * HWPUNIT_PER_MM)
const num = (v: string): number => Number(v.replace(',', '.'))

/** HWP border width index → mm (the table every HWP writer shares). */
export const BORDER_WIDTHS_MM = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0] as const
/** The HWP line types the dialog offers, with their engine codes. */
const LINE_TYPES: Array<[number, StringKey]> = [
  [0, 'nextLineNone'],
  [1, 'nextLineSolid'],
  [2, 'nextLineDash'],
  [3, 'nextLineDot'],
  [4, 'nextLineDashDot'],
  [8, 'nextLineDouble'],
]
const PAGE_BREAKS: Array<[number, StringKey]> = [
  [2, 'nextPageBreakRow'],
  [1, 'nextPageBreakCell'],
  [0, 'nextPageBreakNone'],
]
const WRAPS: Array<[string, StringKey]> = [
  ['Square', 'nextWrapSquare'],
  ['TopAndBottom', 'nextWrapTopBottom'],
  ['BehindText', 'nextWrapBehind'],
  ['InFrontOfText', 'nextWrapFront'],
]
const VALIGNS: Array<[number, StringKey]> = [
  [0, 'nextVAlignTop'],
  [1, 'nextVAlignCenter'],
  [2, 'nextVAlignBottom'],
]
const SIDES = ['Left', 'Right', 'Top', 'Bottom'] as const
type Side = (typeof SIDES)[number]
const SIDE_KEYS: Record<Side, StringKey> = { Left: 'nextSideLeft', Right: 'nextSideRight', Top: 'nextSideTop', Bottom: 'nextSideBottom' }
interface Line {
  type: number
  width: number
  color: string
}

/** Values that differ from the engine's, so the dialog never resets what the person left alone. */
function changed<T extends Record<string, unknown>>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {}
  for (const k of Object.keys(after) as Array<keyof T>) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = after[k]
  return out
}

export function TableCellDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const { t } = useI18n()
  const s = view.session
  const cells = useMemo(() => selectedCells(s), [s])
  const table = useMemo(() => tableProperties(s) ?? {}, [s])
  const cell = useMemo(() => cellProperties(s) ?? {}, [s])
  const [tab, setTab] = useState<Tab>('table')

  const tableInit = {
    outerLeft: mm(table.outerLeft),
    outerRight: mm(table.outerRight),
    outerTop: mm(table.outerTop),
    outerBottom: mm(table.outerBottom),
    paddingLeft: mm(table.paddingLeft),
    paddingRight: mm(table.paddingRight),
    paddingTop: mm(table.paddingTop),
    paddingBottom: mm(table.paddingBottom),
    cellSpacing: mm(table.cellSpacing),
    pageBreak: Number(table.pageBreak ?? 0),
    repeatHeader: !!table.repeatHeader,
    treatAsChar: !!table.treatAsChar,
    textWrap: String(table.textWrap ?? 'Square'),
    hasCaption: !!table.hasCaption,
  }
  const cellInit = {
    width: mm(cell.width),
    height: mm(cell.height),
    paddingLeft: mm(cell.paddingLeft),
    paddingRight: mm(cell.paddingRight),
    paddingTop: mm(cell.paddingTop),
    paddingBottom: mm(cell.paddingBottom),
    applyInnerMargin: !!cell.applyInnerMargin,
    verticalAlign: Number(cell.verticalAlign ?? 0),
    isHeader: !!cell.isHeader,
    cellProtect: !!cell.cellProtect,
    fieldName: String(cell.fieldName ?? ''),
  }
  const lineOf = (side: Side): Line => {
    const b = (cell[`border${side}`] ?? {}) as Partial<Line>
    return { type: Number(b.type ?? 0), width: Number(b.width ?? 0), color: String(b.color ?? '#000000') }
  }
  const top = lineOf('Top')
  const borderInit = {
    line: top.type === 0 ? { type: 1, width: 1, color: '#000000' } : top,
    sides: Object.fromEntries(SIDES.map((sd) => [sd, false])) as Record<Side, boolean>,
    fill: cell.fillType === 'solid',
    fillColor: String(cell.fillColor ?? '#ffffff'),
  }
  const [tb, setTb] = useState(tableInit)
  const [cl, setCl] = useState(cellInit)
  const [bd, setBd] = useState(borderInit)

  const apply = () => {
    // Table
    const tChanged = changed(tableInit, tb)
    const tProps: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(tChanged)) tProps[k] = typeof v === 'number' && k !== 'pageBreak' ? hu(v) : v
    if (Object.keys(tProps).length) view.run('table:set-properties', { props: tProps })
    // Cell
    const cChanged = changed(cellInit, cl)
    const cProps: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(cChanged)) cProps[k] = typeof v === 'number' && k !== 'verticalAlign' ? hu(v) : v
    // Borders and fill
    for (const sd of SIDES) if (bd.sides[sd]) cProps[`border${sd}`] = { ...bd.line }
    if (bd.fill !== borderInit.fill || (bd.fill && bd.fillColor !== borderInit.fillColor)) {
      cProps.fillType = bd.fill ? 'solid' : 'none'
      cProps.fillColor = bd.fillColor
    }
    if (Object.keys(cProps).length) view.run('table:cell-set-properties', { props: cProps, cells })
    onApplied()
    onClose()
  }

  const lengthInput = (key: string, label: string, value: number, set: (v: number) => void) => (
    <Input key={key} type="number" label={`${label} (mm)`} value={String(value)} onChange={(e) => set(Math.max(0, num(e.target.value)))} />
  )
  type TableLen = 'outerLeft' | 'outerRight' | 'outerTop' | 'outerBottom' | 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom' | 'cellSpacing'
  type CellLen = 'width' | 'height' | 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom'
  const tLen = (key: TableLen, label: string) => lengthInput(key, label, tb[key], (v) => setTb((st) => ({ ...st, [key]: v })))
  const cLen = (key: CellLen, label: string) => lengthInput(key, label, cl[key], (v) => setCl((st) => ({ ...st, [key]: v })))
  const margins = (field: (side: Side) => React.JSX.Element, legend: StringKey) => (
    <fieldset className="hangul-dialog-group">
      <legend>{t(legend)}</legend>
      <div className="hangul-dialog-sides">{SIDES.map((sd) => field(sd))}</div>
    </fieldset>
  )
  const select = <V extends string | number>(label: string, value: V, options: Array<[V, StringKey]>, onChange: (v: V) => void) => (
    <Select
      label={label}
      value={String(value)}
      options={options.map(([v, k]) => ({ value: String(v), label: t(k) }))}
      onChange={(_e, o) => {
        if (!o) return
        const hit = options.find(([v]) => String(v) === String(o.value))
        if (hit) onChange(hit[0])
      }}
    />
  )

  return (
    <Dialog
      title={t('nextTableCellTitle')}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('nextDialogCancel')}
          </Button>
          <Button onClick={apply}>{t('nextDialogApply')}</Button>
        </>
      }
    >
      <Tabs
        label={t('nextTableCellTitle')}
        variant="line"
        value={tab}
        items={[
          { id: 'table', label: t('nextTabTableProps') },
          { id: 'cell', label: t('nextTabCellProps') },
          { id: 'border', label: t('nextTabBorderFill') },
        ]}
        onChange={(id) => setTab(id as Tab)}
      />
      {tab === 'table' ? (
        <div className="hangul-dialog-stack">
          {margins((sd) => tLen(`outer${sd}`, t(SIDE_KEYS[sd])), 'nextOuterMargins')}
          {margins((sd) => tLen(`padding${sd}`, t(SIDE_KEYS[sd])), 'nextInnerMargins')}
          <div className="hangul-dialog-grid">
            {tLen('cellSpacing', t('nextCellSpacing'))}
            {select(t('nextPageBreak'), tb.pageBreak, PAGE_BREAKS, (v) => setTb((st) => ({ ...st, pageBreak: v })))}
            {select(t('nextTextWrap'), tb.textWrap, WRAPS, (v) => setTb((st) => ({ ...st, textWrap: v })))}
          </div>
          <fieldset className="hangul-dialog-flags">
            <legend>{t('nextAttributes')}</legend>
            <Checkbox label={t('nextRepeatHeader')} checked={tb.repeatHeader} onChange={(e) => setTb((st) => ({ ...st, repeatHeader: e.target.checked }))} />
            <Checkbox label={t('nextTreatAsChar')} checked={tb.treatAsChar} onChange={(e) => setTb((st) => ({ ...st, treatAsChar: e.target.checked }))} />
            <Checkbox label={t('nextCaption')} checked={tb.hasCaption} onChange={(e) => setTb((st) => ({ ...st, hasCaption: e.target.checked }))} />
          </fieldset>
        </div>
      ) : null}
      {tab === 'cell' ? (
        <div className="hangul-dialog-stack">
          <p className="hangul-dialog-note">{t('nextCellsSelected', { n: cells.length })}</p>
          <div className="hangul-dialog-grid">
            {cLen('width', t('nextCellWidth'))}
            {cLen('height', t('nextCellHeight'))}
            {select(t('nextVAlign'), cl.verticalAlign, VALIGNS, (v) => setCl((st) => ({ ...st, verticalAlign: v })))}
            <Input label={t('nextFieldName')} value={cl.fieldName} onChange={(e) => setCl((st) => ({ ...st, fieldName: e.target.value }))} />
          </div>
          <Checkbox label={t('nextApplyInnerMargin')} checked={cl.applyInnerMargin} onChange={(e) => setCl((st) => ({ ...st, applyInnerMargin: e.target.checked }))} />
          {cl.applyInnerMargin ? margins((sd) => cLen(`padding${sd}`, t(SIDE_KEYS[sd])), 'nextInnerMargins') : null}
          <fieldset className="hangul-dialog-flags">
            <legend>{t('nextAttributes')}</legend>
            <Checkbox label={t('nextHeaderCell')} checked={cl.isHeader} onChange={(e) => setCl((st) => ({ ...st, isHeader: e.target.checked }))} />
            <Checkbox label={t('nextCellProtect')} checked={cl.cellProtect} onChange={(e) => setCl((st) => ({ ...st, cellProtect: e.target.checked }))} />
          </fieldset>
        </div>
      ) : null}
      {tab === 'border' ? (
        <div className="hangul-dialog-stack">
          <div className="hangul-dialog-grid">
            {select(t('nextLineType'), bd.line.type, LINE_TYPES, (v) => setBd((st) => ({ ...st, line: { ...st.line, type: v } })))}
            <Select
              label={t('nextLineWidth')}
              value={String(bd.line.width)}
              options={BORDER_WIDTHS_MM.map((w, i) => ({ value: String(i), label: `${w} mm` }))}
              onChange={(_e, o) => o && setBd((st) => ({ ...st, line: { ...st.line, width: Number(o.value) } }))}
            />
            <Input type="color" label={t('nextLineColor')} value={bd.line.color} onChange={(e) => setBd((st) => ({ ...st, line: { ...st.line, color: e.target.value.toLowerCase() } }))} />
          </div>
          <fieldset className="hangul-dialog-flags">
            <legend>{t('nextBorderSides')}</legend>
            <div className="hangul-dialog-span">
            <Checkbox
              label={t('nextBorderAll')}
              checked={SIDES.every((sd) => bd.sides[sd])}
              onChange={(e) => {
                const on = e.target.checked
                setBd((st) => ({ ...st, sides: Object.fromEntries(SIDES.map((sd) => [sd, on])) as Record<Side, boolean> }))
              }}
            />
            </div>
            {SIDES.map((sd) => (
              <Checkbox key={sd} label={t(SIDE_KEYS[sd])} checked={bd.sides[sd]} onChange={(e) => setBd((st) => ({ ...st, sides: { ...st.sides, [sd]: e.target.checked } }))} />
            ))}
          </fieldset>
          <fieldset className="hangul-dialog-flags">
            <legend>{t('nextFill')}</legend>
            <Checkbox label={t('nextFillSolid')} checked={bd.fill} onChange={(e) => setBd((st) => ({ ...st, fill: e.target.checked }))} />
            {bd.fill ? <Input type="color" label={t('nextFillColor')} value={bd.fillColor} onChange={(e) => setBd((st) => ({ ...st, fillColor: e.target.value.toLowerCase() }))} /> : null}
          </fieldset>
        </div>
      ) : null}
    </Dialog>
  )
}
