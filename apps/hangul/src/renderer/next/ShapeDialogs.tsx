/**
 * 글자 모양 (character shape, Alt+L) and 문단 모양 (paragraph shape, Alt+T)
 * dialogs for the owned editor (spec task 2.3). Built on @genoffice/ui's
 * Dialog and the kit's form controls. They read the selection's current shape
 * from the engine and apply only what the person changed, as one undo step,
 * through format:char-shape-apply and format:para-shape-apply.
 */
import { useMemo, useState } from 'react'
import type { EditorView } from '@genoffice/hwp-editor'
import { ordered } from '@genoffice/hwp-editor'
import { Button, Checkbox, Dialog, Input, Select } from '@genoffice/ui'
import { useI18n, type StringKey } from '../i18n/locale'
import { HANGUL_FONTS } from './HangulRibbon'
import {
  ALIGNMENTS,
  LIMITS,
  LINE_SPACING_TYPES,
  SCRIPTS,
  clamp,
  lineSpacingForDialog,
  lineSpacingToEngine,
  paraLengthToEngine,
  pxToPt,
  setPerScript,
  type Alignment,
  type LineSpacingType,
  type ParaLength,
} from './shape-units'

const SCRIPT_KEYS: StringKey[] = ['nextScriptHangul', 'nextScriptLatin', 'nextScriptHanja', 'nextScriptJapanese', 'nextScriptOther', 'nextScriptSymbol', 'nextScriptUser']

type Props = { view: EditorView; onClose: () => void; onApplied: () => void }

const num = (v: string): number => Number(v.replace(',', '.'))

/** Changed keys only, so applying the dialog never resets what the person left alone. */
function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(after)) if (JSON.stringify(before[k]) !== JSON.stringify(v)) out[k] = v
  return out
}

export function CharShapeDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const { t } = useI18n()
  const s = view.session
  const initial = useMemo(() => s.text.charPropertiesAt(ordered(s.selection)[0]), [s])
  const [script, setScript] = useState<number | 'all'>('all')
  const [state, setState] = useState(() => ({
    fontSizePt: Number(initial.fontSize) / 100,
    fontFamilies: [...((initial.fontFamilies as string[]) ?? new Array(SCRIPTS).fill(String(initial.fontFamily)))],
    ratios: [...((initial.ratios as number[]) ?? new Array(SCRIPTS).fill(100))],
    spacings: [...((initial.spacings as number[]) ?? new Array(SCRIPTS).fill(0))],
    relativeSizes: [...((initial.relativeSizes as number[]) ?? new Array(SCRIPTS).fill(100))],
    charOffsets: [...((initial.charOffsets as number[]) ?? new Array(SCRIPTS).fill(0))],
    bold: !!initial.bold,
    italic: !!initial.italic,
    underline: !!initial.underline,
    strikethrough: !!initial.strikethrough,
    superscript: !!initial.superscript,
    subscript: !!initial.subscript,
    emboss: !!initial.emboss,
    engrave: !!initial.engrave,
    textColor: String(initial.textColor ?? '#000000'),
  }))
  const at = script === 'all' ? 0 : script
  const perScript = (key: 'ratios' | 'spacings' | 'relativeSizes' | 'charOffsets', limits: readonly [number, number]) => (
    <Input
      type="number"
      label={t(({ ratios: 'nextRatio', spacings: 'nextSpacing', relativeSizes: 'nextRelativeSize', charOffsets: 'nextOffset' } as const)[key])}
      value={String(state[key][at])}
      onChange={(e) => setState((st) => ({ ...st, [key]: setPerScript(st[key], script, clamp(num(e.target.value), limits)) }))}
    />
  )

  const apply = () => {
    const before = {
      fontSize: initial.fontSize,
      ratios: initial.ratios,
      spacings: initial.spacings,
      relativeSizes: initial.relativeSizes,
      charOffsets: initial.charOffsets,
      bold: !!initial.bold,
      italic: !!initial.italic,
      underline: !!initial.underline,
      strikethrough: !!initial.strikethrough,
      superscript: !!initial.superscript,
      subscript: !!initial.subscript,
      emboss: !!initial.emboss,
      engrave: !!initial.engrave,
      textColor: initial.textColor,
    }
    const after: Record<string, unknown> = {
      ...state,
      fontSize: Math.round(clamp(state.fontSizePt, LIMITS.fontSizePt) * 100),
    }
    delete after.fontSizePt
    delete after.fontFamilies
    const changes = diff(before, after)
    if (JSON.stringify(state.fontFamilies) !== JSON.stringify(initial.fontFamilies)) {
      changes.fontIds = state.fontFamilies.map((name, k) => s.doc.raw.findOrCreateFontIdForLang(k, name))
    }
    if (Object.keys(changes).length) view.run('format:char-shape-apply', { props: changes })
    onApplied()
    onClose()
  }

  const fonts = HANGUL_FONTS.includes(state.fontFamilies[at]!) ? HANGUL_FONTS : [state.fontFamilies[at]!, ...HANGUL_FONTS]
  const flags: Array<[keyof typeof state, StringKey]> = [
    ['bold', 'nextBold'],
    ['italic', 'nextItalic'],
    ['underline', 'nextUnderline'],
    ['strikethrough', 'nextStrikethrough'],
    ['superscript', 'nextSuperscript'],
    ['subscript', 'nextSubscript'],
    ['emboss', 'nextEmboss'],
    ['engrave', 'nextEngrave'],
  ]
  return (
    <Dialog
      title={t('nextCharShapeTitle')}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('nextDialogCancel')}
          </Button>
          <Button onClick={apply}>{t('nextDialogApply')}</Button>
        </>
      }
    >
      <div className="hangul-dialog-grid">
        <Input type="number" label={t('nextBaseSize')} value={String(state.fontSizePt)} onChange={(e) => setState((st) => ({ ...st, fontSizePt: num(e.target.value) }))} />
        <Select
          label={t('nextScript')}
          value={String(script)}
          options={[{ value: 'all', label: t('nextScriptAll') }, ...SCRIPT_KEYS.map((k, i) => ({ value: String(i), label: t(k) }))]}
          onChange={(_e, o) => setScript(o?.value === 'all' || o === undefined ? 'all' : Number(o.value))}
        />
        <Select
          label={t('nextFontLabel')}
          value={state.fontFamilies[at]}
          options={fonts.map((f) => ({ value: f, label: f }))}
          onChange={(_e, o) => {
            if (!o) return
            setState((st) => ({ ...st, fontFamilies: st.fontFamilies.map((f, k) => (script === 'all' || k === script ? String(o.value) : f)) }))
          }}
        />
        {perScript('ratios', LIMITS.ratio)}
        {perScript('spacings', LIMITS.spacing)}
        {perScript('relativeSizes', LIMITS.relativeSize)}
        {perScript('charOffsets', LIMITS.offset)}
        <Input type="color" label={t('nextTextColor')} value={state.textColor} onChange={(e) => setState((st) => ({ ...st, textColor: e.target.value.toLowerCase() }))} />
      </div>
      <fieldset className="hangul-dialog-flags">
        <legend>{t('nextAttributes')}</legend>
        {flags.map(([key, label]) => (
          <Checkbox
            key={key}
            label={t(label)}
            checked={Boolean(state[key])}
            onChange={(e) => {
              const on = e.target.checked
              setState((st) => ({
                ...st,
                [key]: on,
                ...(key === 'superscript' && on ? { subscript: false } : {}),
                ...(key === 'subscript' && on ? { superscript: false } : {}),
              }))
            }}
          />
        ))}
      </fieldset>
    </Dialog>
  )
}

const ALIGN_KEYS: Record<Alignment, StringKey> = {
  justify: 'nextAlignJustify',
  left: 'nextAlignLeft',
  right: 'nextAlignRight',
  center: 'nextAlignCenter',
  distribute: 'nextAlignDistribute',
  split: 'nextAlignSplit',
}
const SPACING_KEYS: Record<LineSpacingType, StringKey> = {
  Percent: 'nextLineSpacingPercent',
  Fixed: 'nextLineSpacingFixed',
  SpaceOnly: 'nextLineSpacingSpaceOnly',
  Minimum: 'nextLineSpacingMinimum',
}

export function ParaShapeDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const { t } = useI18n()
  const s = view.session
  const initial = useMemo(() => {
    const h = s.selection.head
    const raw = h.cell ? s.doc.raw.getCellParaPropertiesAt(h.section, h.para, h.cell.control, h.cell.cell, h.cell.para) : s.doc.raw.getParaPropertiesAt(h.section, h.para)
    return JSON.parse(raw) as Record<string, unknown>
  }, [s])
  const lengths: ParaLength[] = ['marginLeft', 'marginRight', 'indent', 'spacingBefore', 'spacingAfter']
  const [state, setState] = useState(() => ({
    alignment: (String(initial.alignment) as Alignment) ?? 'justify',
    ...Object.fromEntries(lengths.map((k) => [k, pxToPt(Number(initial[k] ?? 0))])),
    lineSpacingType: (String(initial.lineSpacingType) as LineSpacingType) ?? 'Percent',
    lineSpacing: lineSpacingForDialog(String(initial.lineSpacingType), Number(initial.lineSpacing ?? 160)),
    keepWithNext: !!initial.keepWithNext,
    keepLines: !!initial.keepLines,
    widowOrphan: !!initial.widowOrphan,
    pageBreakBefore: !!initial.pageBreakBefore,
  }) as Record<string, unknown> & { alignment: Alignment; lineSpacingType: LineSpacingType; lineSpacing: number })
  const initialPt = Object.fromEntries(lengths.map((k) => [k, pxToPt(Number(initial[k] ?? 0))]))

  const apply = () => {
    const changes: Record<string, unknown> = {}
    if (state.alignment !== initial.alignment) changes.alignment = state.alignment
    for (const k of lengths) {
      const v = clamp(Number(state[k]), LIMITS.lengthPt)
      if (v !== initialPt[k]) changes[k] = paraLengthToEngine(k, v)
    }
    const initialSpacing = lineSpacingForDialog(String(initial.lineSpacingType), Number(initial.lineSpacing ?? 160))
    if (state.lineSpacingType !== initial.lineSpacingType || state.lineSpacing !== initialSpacing) {
      changes.lineSpacingType = state.lineSpacingType
      const v = state.lineSpacingType === 'Percent' ? clamp(state.lineSpacing, LIMITS.lineSpacingPercent) : clamp(state.lineSpacing, LIMITS.lengthPt)
      changes.lineSpacing = lineSpacingToEngine(state.lineSpacingType, v)
    }
    for (const k of ['keepWithNext', 'keepLines', 'widowOrphan', 'pageBreakBefore']) if (state[k] !== !!initial[k]) changes[k] = state[k]
    if (Object.keys(changes).length) view.run('format:para-shape-apply', { props: changes })
    onApplied()
    onClose()
  }
  const set = (k: string, v: unknown) => setState((st) => ({ ...st, [k]: v }))
  const label: Record<ParaLength, StringKey> = {
    marginLeft: 'nextMarginLeft',
    marginRight: 'nextMarginRight',
    indent: 'nextIndent',
    spacingBefore: 'nextSpacingBefore',
    spacingAfter: 'nextSpacingAfter',
  }
  return (
    <Dialog
      title={t('nextParaShapeTitle')}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('nextDialogCancel')}
          </Button>
          <Button onClick={apply}>{t('nextDialogApply')}</Button>
        </>
      }
    >
      <div className="hangul-dialog-grid">
        <Select
          label={t('nextAlignment')}
          value={state.alignment}
          options={ALIGNMENTS.map((a) => ({ value: a, label: t(ALIGN_KEYS[a]) }))}
          onChange={(_e, o) => o && set('alignment', o.value)}
        />
        {lengths.map((k) => (
          <Input key={k} type="number" label={`${t(label[k])} (pt)`} value={String(state[k])} onChange={(e) => set(k, num(e.target.value))} />
        ))}
        <Select
          label={t('nextLineSpacing')}
          value={state.lineSpacingType}
          options={LINE_SPACING_TYPES.map((v) => ({ value: v, label: t(SPACING_KEYS[v]) }))}
          onChange={(_e, o) => o && set('lineSpacingType', o.value)}
        />
        <Input
          type="number"
          label={state.lineSpacingType === 'Percent' ? `${t('nextLineSpacingValue')} (%)` : `${t('nextLineSpacingValue')} (pt)`}
          value={String(state.lineSpacing)}
          onChange={(e) => set('lineSpacing', num(e.target.value))}
        />
      </div>
      <fieldset className="hangul-dialog-flags">
        <legend>{t('nextPagination')}</legend>
        {(
          [
            ['keepWithNext', 'nextKeepWithNext'],
            ['keepLines', 'nextKeepLines'],
            ['widowOrphan', 'nextWidowOrphan'],
            ['pageBreakBefore', 'nextPageBreakBefore'],
          ] as Array<[string, StringKey]>
        ).map(([k, l]) => (
          <Checkbox key={k} label={t(l)} checked={Boolean(state[k])} onChange={(e) => set(k, e.target.checked)} />
        ))}
      </fieldset>
    </Dialog>
  )
}
