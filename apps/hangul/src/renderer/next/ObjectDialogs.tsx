/**
 * 개체 속성 (object properties) for pictures and drawing objects (spec task
 * 2.3). Tabs follow 한글 2024: 기본 (size, position, wrapping), 여백 (outside
 * margins), 선 and 채우기 for drawing objects, and 그림 for pictures
 * (effect, brightness, contrast, transparency).
 *
 * Reads the engine's property JSON for the selected object and applies only
 * the changed keys through object:set-properties, as one undo step.
 */
import { useMemo, useState } from 'react'
import { HWPUNIT_PER_MM, colorRefToCss, cssToColorRef, objectProperties, type EditorView } from '@genoffice/hwp-editor'
import { Button, Checkbox, Dialog, Input, Select, Tabs } from '@genoffice/ui'
import { useI18n, type StringKey } from '../i18n/locale'

type Props = { view: EditorView; onClose: () => void; onApplied: () => void }
type Tab = 'basic' | 'margins' | 'line' | 'fill' | 'picture'

const mm = (hu: unknown) => Math.round((Number(hu) / HWPUNIT_PER_MM) * 10) / 10
const hu = (mmValue: number) => Math.round(mmValue * HWPUNIT_PER_MM)
const num = (v: string): number => Number(v.replace(',', '.'))

const WRAPS: Array<[string, StringKey]> = [
  ['Square', 'nextWrapSquare'],
  ['TopAndBottom', 'nextWrapTopBottom'],
  ['BehindText', 'nextWrapBehind'],
  ['InFrontOfText', 'nextWrapFront'],
]
const HORZ_REL: Array<[string, StringKey]> = [
  ['Paper', 'nextRelPaper'],
  ['Page', 'nextRelPage'],
  ['Column', 'nextRelColumn'],
  ['Para', 'nextRelPara'],
]
const VERT_REL: Array<[string, StringKey]> = [
  ['Paper', 'nextRelPaper'],
  ['Page', 'nextRelPage'],
  ['Para', 'nextRelPara'],
]
const LINE_TYPES: Array<[number, StringKey]> = [
  [0, 'nextLineNone'],
  [1, 'nextLineSolid'],
  [2, 'nextLineDash'],
  [3, 'nextLineDot'],
  [4, 'nextLineDashDot'],
  [8, 'nextLineDouble'],
]
const EFFECTS: Array<[string, StringKey]> = [
  ['RealPic', 'nextEffectNone'],
  ['GrayScale', 'nextEffectGray'],
  ['BlackWhite', 'nextEffectBlackWhite'],
]
const SIDES = ['Left', 'Right', 'Top', 'Bottom'] as const
const SIDE_KEYS: Record<(typeof SIDES)[number], StringKey> = { Left: 'nextSideLeft', Right: 'nextSideRight', Top: 'nextSideTop', Bottom: 'nextSideBottom' }

/** Dialog state keys, and how each maps to the engine's value. */
type Kind = 'length' | 'offset' | 'color' | 'plain'
const KINDS: Record<string, Kind> = {
  width: 'length',
  height: 'length',
  horzOffset: 'offset',
  vertOffset: 'offset',
  outerMarginLeft: 'length',
  outerMarginRight: 'length',
  outerMarginTop: 'length',
  outerMarginBottom: 'length',
  borderWidth: 'length',
  borderColor: 'color',
  fillBgColor: 'color',
}
type State = Record<string, string | number | boolean>

function toDialog(p: Record<string, unknown>): State {
  const out: State = {}
  for (const [k, v] of Object.entries(p)) {
    const kind = KINDS[k]
    if (kind === 'length' || kind === 'offset') out[k] = mm(v)
    else if (kind === 'color') out[k] = colorRefToCss(v)
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v
  }
  return out
}

function toEngine(k: string, v: string | number | boolean): unknown {
  const kind = KINDS[k]
  if (kind === 'length') return hu(Math.max(0, Number(v)))
  if (kind === 'offset') return hu(Number(v))
  if (kind === 'color') return cssToColorRef(String(v))
  return v
}

export function ObjectPropertiesDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const { t } = useI18n()
  const s = view.session
  const object = s.object
  const initial = useMemo(() => toDialog(objectProperties(s) ?? {}), [s])
  const [st, setSt] = useState<State>(initial)
  const [tab, setTab] = useState<Tab>('basic')
  const isShape = object?.kind === 'shape'
  const set = (k: string, v: string | number | boolean) => setSt((x) => ({ ...x, [k]: v }))

  const apply = () => {
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(st)) if (initial[k] !== v) props[k] = toEngine(k, v)
    // A fill colour only shows with a solid fill.
    if ('fillBgColor' in props && st.fillType !== 'solid') props.fillType = 'solid'
    if (Object.keys(props).length) view.run('object:set-properties', { props })
    onApplied()
    onClose()
  }

  const length = (k: string, label: string) => (
    <Input key={k} type="number" label={`${label} (mm)`} value={String(st[k] ?? 0)} onChange={(e) => set(k, num(e.target.value))} />
  )
  const select = (k: string, label: string, options: Array<[string | number, StringKey]>) => (
    <Select
      label={label}
      value={String(st[k])}
      options={options.map(([v, key]) => ({ value: String(v), label: t(key) }))}
      onChange={(_e, o) => {
        const hit = o && options.find(([v]) => String(v) === String(o.value))
        if (hit) set(k, hit[0])
      }}
    />
  )
  const flag = (k: string, label: StringKey) => <Checkbox label={t(label)} checked={!!st[k]} onChange={(e) => set(k, e.target.checked)} />
  const percent = (k: string, label: StringKey, lo: number, hi: number) => (
    <Input type="number" label={t(label)} value={String(st[k] ?? 0)} onChange={(e) => set(k, Math.min(hi, Math.max(lo, Math.round(num(e.target.value)))))} />
  )

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'basic', label: t('nextObjTabBasic') },
    { id: 'margins', label: t('nextObjTabMargins') },
    ...(isShape
      ? [
          { id: 'line' as const, label: t('nextObjTabLine') },
          { id: 'fill' as const, label: t('nextObjTabFill') },
        ]
      : [{ id: 'picture' as const, label: t('nextObjTabPicture') }]),
  ]

  return (
    <Dialog
      title={t('nextObjectTitle')}
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
      <Tabs label={t('nextObjectTitle')} variant="line" value={tab} items={tabs} onChange={(id) => setTab(id as Tab)} />
      {tab === 'basic' ? (
        <div className="hangul-dialog-stack">
          <div className="hangul-dialog-grid">
            {length('width', t('nextCellWidth'))}
            {length('height', t('nextCellHeight'))}
            {select('textWrap', t('nextTextWrap'), WRAPS)}
            <span />
            {select('horzRelTo', t('nextHorzRel'), HORZ_REL)}
            {length('horzOffset', t('nextHorzOffset'))}
            {select('vertRelTo', t('nextVertRel'), VERT_REL)}
            {length('vertOffset', t('nextVertOffset'))}
          </div>
          <fieldset className="hangul-dialog-flags">
            <legend>{t('nextAttributes')}</legend>
            {flag('treatAsChar', 'nextTreatAsChar')}
            {flag('sizeProtect', 'nextSizeProtect')}
            {flag('allowOverlap', 'nextAllowOverlap')}
            {flag('restrictInPage', 'nextRestrictInPage')}
          </fieldset>
        </div>
      ) : null}
      {tab === 'margins' ? (
        <fieldset className="hangul-dialog-group">
          <legend>{t('nextOuterMargins')}</legend>
          <div className="hangul-dialog-sides">{SIDES.map((sd) => length(`outerMargin${sd}`, t(SIDE_KEYS[sd])))}</div>
        </fieldset>
      ) : null}
      {tab === 'line' ? (
        <div className="hangul-dialog-grid hangul-dialog-stack">
          {select('lineType', t('nextLineType'), LINE_TYPES)}
          {length('borderWidth', t('nextLineWidth'))}
          <Input type="color" label={t('nextLineColor')} value={String(st.borderColor ?? '#000000')} onChange={(e) => set('borderColor', e.target.value.toLowerCase())} />
        </div>
      ) : null}
      {tab === 'fill' ? (
        <div className="hangul-dialog-stack">
          <Checkbox label={t('nextFillSolid')} checked={st.fillType === 'solid'} onChange={(e) => set('fillType', e.target.checked ? 'solid' : 'none')} />
          {st.fillType === 'solid' ? (
            <div className="hangul-dialog-grid">
              <Input type="color" label={t('nextFillColor')} value={String(st.fillBgColor ?? '#ffffff')} onChange={(e) => set('fillBgColor', e.target.value.toLowerCase())} />
            </div>
          ) : null}
        </div>
      ) : null}
      {tab === 'picture' ? (
        <div className="hangul-dialog-grid hangul-dialog-stack">
          {select('effect', t('nextPictureEffect'), EFFECTS)}
          {percent('transparency', 'nextTransparency', 0, 100)}
          {percent('brightness', 'nextBrightness', -100, 100)}
          {percent('contrast', 'nextContrast', -100, 100)}
        </div>
      ) : null}
    </Dialog>
  )
}
