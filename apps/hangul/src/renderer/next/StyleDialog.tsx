/**
 * 스타일 (F6) for the owned editor (spec task 2.3): the document's styles on the
 * left; name, next style and the common character and paragraph settings of the
 * chosen style on the right. Saving a style restyles every paragraph that uses
 * it. "Apply" puts the chosen style on the selected paragraphs.
 *
 * Units follow the shape dialogs: font size in pt, paragraph lengths in pt,
 * line spacing in percent.
 */
import { useMemo, useState } from 'react'
import { lastCreatedStyle, styleAt, styleDetail, styleList, type EditorView, type StyleInfo } from '@genoffice/hwp-editor'
import { Button, Checkbox, Dialog, Input, Select } from '@genoffice/ui'
import { useI18n, type StringKey } from '../i18n/locale'
import { HANGUL_FONTS } from './HangulRibbon'
import { ALIGNMENTS, LIMITS, clamp, paraLengthToEngine, pxToPt, type Alignment, type ParaLength } from './shape-units'

type Props = { view: EditorView; onClose: () => void; onApplied: () => void }

const ALIGN_KEYS: Record<Alignment, StringKey> = {
  justify: 'nextAlignJustify',
  left: 'nextAlignLeft',
  right: 'nextAlignRight',
  center: 'nextAlignCenter',
  distribute: 'nextAlignDistribute',
  split: 'nextAlignSplit',
}
type StyleLength = Extract<ParaLength, 'marginLeft' | 'indent' | 'spacingBefore' | 'spacingAfter'>
const LENGTHS: Array<[StyleLength, StringKey]> = [
  ['marginLeft', 'nextMarginLeft'],
  ['indent', 'nextIndent'],
  ['spacingBefore', 'nextSpacingBefore'],
  ['spacingAfter', 'nextSpacingAfter'],
]
const num = (v: string): number => Number(v.replace(',', '.'))

interface Form {
  name: string
  englishName: string
  nextStyleId: number
  fontFamily: string
  fontSizePt: number
  bold: boolean
  italic: boolean
  underline: boolean
  textColor: string
  alignment: Alignment
  lineSpacing: number
  marginLeft: number
  indent: number
  spacingBefore: number
  spacingAfter: number
}

function formOf(view: EditorView, st: StyleInfo): Form {
  const d = styleDetail(view.session, st.id)
  const c = d.charProps
  const p = d.paraProps
  return {
    name: st.name,
    englishName: st.englishName,
    nextStyleId: st.nextStyleId,
    fontFamily: String(c.fontFamily ?? ''),
    fontSizePt: Number(c.fontSize) / 100,
    bold: !!c.bold,
    italic: !!c.italic,
    underline: !!c.underline,
    textColor: String(c.textColor ?? '#000000'),
    alignment: (ALIGNMENTS as readonly string[]).includes(String(p.alignment)) ? (p.alignment as Alignment) : 'justify',
    lineSpacing: p.lineSpacingType === 'Percent' ? Number(p.lineSpacing) : 160,
    marginLeft: pxToPt(Number(p.marginLeft ?? 0)),
    indent: pxToPt(Number(p.indent ?? 0)),
    spacingBefore: pxToPt(Number(p.spacingBefore ?? 0)),
    spacingAfter: pxToPt(Number(p.spacingAfter ?? 0)),
  }
}

/** Only what changed, in the engine's units. */
function edits(view: EditorView, before: Form | null, f: Form) {
  const char: Record<string, unknown> = {}
  const para: Record<string, unknown> = {}
  const b = before
  if (!b || b.fontSizePt !== f.fontSizePt) char.fontSize = Math.round(clamp(f.fontSizePt, LIMITS.fontSizePt) * 100)
  for (const k of ['bold', 'italic', 'underline'] as const) if (!b || b[k] !== f[k]) char[k] = f[k]
  if (!b || b.textColor !== f.textColor) char.textColor = f.textColor
  if (f.fontFamily && (!b || b.fontFamily !== f.fontFamily)) char.fontIds = Array.from({ length: 7 }, (_, k) => view.session.doc.raw.findOrCreateFontIdForLang(k, f.fontFamily))
  if (!b || b.alignment !== f.alignment) para.alignment = f.alignment
  if (!b || b.lineSpacing !== f.lineSpacing) {
    para.lineSpacingType = 'Percent'
    para.lineSpacing = Math.round(clamp(f.lineSpacing, LIMITS.lineSpacingPercent))
  }
  for (const [k] of LENGTHS) if (!b || b[k] !== f[k]) para[k] = paraLengthToEngine(k, clamp(f[k], LIMITS.lengthPt))
  return { char, para }
}

export function StyleDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const { t } = useI18n()
  const s = view.session
  const [version, setVersion] = useState(0)
  const styles = useMemo(() => styleList(s), [s, version])
  const [selected, setSelected] = useState<number | 'new'>(() => Math.max(0, styleAt(s)))
  const current = selected === 'new' ? null : (styles.find((x) => x.id === selected) ?? null)
  const initial = useMemo(() => (current ? formOf(view, current) : null), [current, view, version])
  const blank = useMemo<Form>(() => ({ ...(styles[0] ? formOf(view, styles[0]) : ({} as Form)), name: '', englishName: '', nextStyleId: -1 }), [styles, view])
  const [form, setForm] = useState<Form>(() => initial ?? blank)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const choose = (id: number | 'new') => {
    setSelected(id)
    setError(null)
    const st = id === 'new' ? null : styles.find((x) => x.id === id)
    setForm(st ? formOf(view, st) : blank)
  }

  const save = (): number | null => {
    setError(null)
    try {
      if (selected === 'new') {
        const { char, para } = edits(view, null, form)
        view.run('style:create', { name: form.name, englishName: form.englishName, ...(form.nextStyleId >= 0 ? { nextStyleId: form.nextStyleId } : {}), char, para })
        const id = lastCreatedStyle(s)
        setVersion((v) => v + 1)
        setSelected(id)
        onApplied()
        return id
      }
      const { char, para } = edits(view, initial, form)
      view.run('style:update', { styleId: selected, name: form.name, englishName: form.englishName, nextStyleId: form.nextStyleId, char, para })
      setVersion((v) => v + 1)
      onApplied()
      return selected
    } catch (e) {
      setError(/already exists/.test(String(e)) ? t('nextStyleExists') : /needs a name/.test(String(e)) ? t('nextStyleNeedsName') : String(e))
      return null
    }
  }

  const applyToSelection = () => {
    const id = save()
    if (id === null) return
    view.run('format:apply-style', { styleId: id })
    onApplied()
    onClose()
  }

  const remove = () => {
    if (selected === 'new' || selected === 0) return
    view.run('style:delete', { styleId: selected })
    setVersion((v) => v + 1)
    onApplied()
    choose(0)
  }

  const fonts = HANGUL_FONTS.includes(form.fontFamily) || !form.fontFamily ? HANGUL_FONTS : [form.fontFamily, ...HANGUL_FONTS]
  return (
    <Dialog
      title={t('nextStyleTitle')}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('nextDialogClose')}
          </Button>
          <Button variant="secondary" onClick={() => void save()}>
            {selected === 'new' ? t('nextStyleCreate') : t('nextStyleSave')}
          </Button>
          <Button onClick={applyToSelection}>{t('nextStyleApply')}</Button>
        </>
      }
    >
      <div className="hangul-style-editor">
        <div className="hangul-style-editor__list">
          <ul role="listbox" aria-label={t('nextStyleList')}>
            {styles.map((st) => (
              <li key={st.id} role="option" aria-selected={selected === st.id} tabIndex={0} onClick={() => choose(st.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && choose(st.id)}>
                {st.name}
              </li>
            ))}
          </ul>
          <div className="hangul-style-editor__actions">
            <Button size="sm" variant="secondary" onClick={() => choose('new')}>
              {t('nextStyleNew')}
            </Button>
            <Button size="sm" variant="secondary" disabled={selected === 'new' || selected === 0} onClick={remove}>
              {t('nextStyleDelete')}
            </Button>
          </div>
        </div>
        <div className="hangul-style-editor__form">
          {error ? (
            <p className="hangul-dialog-note" role="alert">
              {error}
            </p>
          ) : null}
          <div className="hangul-dialog-grid">
            <Input label={t('nextStyleName')} value={form.name} autoFocus={selected === 'new'} onChange={(e) => set('name', e.target.value)} />
            <Input label={t('nextStyleEnglishName')} value={form.englishName} onChange={(e) => set('englishName', e.target.value)} />
            <Select
              label={t('nextStyleNext')}
              value={String(form.nextStyleId)}
              options={[...(selected === 'new' ? [{ value: '-1', label: t('nextStyleNextSame') }] : []), ...styles.map((st) => ({ value: String(st.id), label: st.name }))]}
              onChange={(_e, o) => o && set('nextStyleId', Number(o.value))}
            />
          </div>
          <fieldset className="hangul-dialog-group">
            <legend>{t('nextStyleChar')}</legend>
            <div className="hangul-dialog-grid">
              <Select label={t('nextFontLabel')} value={form.fontFamily} options={fonts.map((f) => ({ value: f, label: f }))} onChange={(_e, o) => o && set('fontFamily', String(o.value))} />
              <Input type="number" label={t('nextBaseSize')} value={String(form.fontSizePt)} onChange={(e) => set('fontSizePt', num(e.target.value))} />
              <Input type="color" label={t('nextTextColor')} value={form.textColor} onChange={(e) => set('textColor', e.target.value.toLowerCase())} />
            </div>
            <div className="hangul-dialog-flags">
              <Checkbox label={t('nextBold')} checked={form.bold} onChange={(e) => set('bold', e.target.checked)} />
              <Checkbox label={t('nextItalic')} checked={form.italic} onChange={(e) => set('italic', e.target.checked)} />
              <Checkbox label={t('nextUnderline')} checked={form.underline} onChange={(e) => set('underline', e.target.checked)} />
            </div>
          </fieldset>
          <fieldset className="hangul-dialog-group">
            <legend>{t('nextStylePara')}</legend>
            <div className="hangul-dialog-grid">
              <Select
                label={t('nextAlignment')}
                value={form.alignment}
                options={ALIGNMENTS.map((a) => ({ value: a, label: t(ALIGN_KEYS[a]) }))}
                onChange={(_e, o) => o && set('alignment', o.value as Alignment)}
              />
              <Input type="number" label={t('nextLineSpacingPercentLabel')} value={String(form.lineSpacing)} onChange={(e) => set('lineSpacing', num(e.target.value))} />
              {LENGTHS.map(([k, label]) => (
                <Input key={k} type="number" label={`${t(label)} (pt)`} value={String(form[k])} onChange={(e) => set(k, num(e.target.value))} />
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </Dialog>
  )
}
