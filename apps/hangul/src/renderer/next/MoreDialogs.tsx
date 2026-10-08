/**
 * The remaining 한글 dialogs (spec task 2.6), each a small form over one bus
 * command: 줄/칸 추가하기 and 지우기, 단 설정, 구역 설정, 쪽 테두리/배경, 미주 모양,
 * 머리말/꼬리말 마당, 문단 번호 모양, 누름틀 고치기, 격자 설정, plus the 문자표
 * and 글머리표 pickers. Values are shown in 한글's units (mm, counts) and written
 * in the engine's; only what changed is written, as one undo step.
 */
import { useMemo, useState } from 'react'
import {
  HWPUNIT_PER_MM,
  NUMBERING_PRESETS,
  columnSettings,
  endnoteShape,
  fieldAt,
  pageBorder,
  sectionDef,
  type EditorView,
} from '@genoffice/hwp-editor'
import { Button, Checkbox, Dialog, Input, Select } from '@genoffice/ui'
import { useI18n, type StringKey } from '../i18n/locale'

type Props = { view: EditorView; onClose: () => void; onApplied: () => void }
type Value = string | number | boolean
type Field =
  | { key: string; label: StringKey; kind: 'number'; min?: number; max?: number }
  | { key: string; label: StringKey; kind: 'mm' }
  | { key: string; label: StringKey; kind: 'text' }
  | { key: string; label: StringKey; kind: 'check' }
  | { key: string; label: StringKey; kind: 'color' }
  | { key: string; label: StringKey; kind: 'select'; options: Array<[string, StringKey]> }

const mm = (hu: unknown) => Math.round((Number(hu) / HWPUNIT_PER_MM) * 10) / 10
const hu = (v: number) => Math.round(v * HWPUNIT_PER_MM)
const num = (v: string): number => Number(v.replace(',', '.'))

/** One form: the fields, the values the dialog opened with, and what Apply does with the changed ones. */
function FormDialog({ title, fields, initial, onApply, onClose, apply = 'nextDialogApply' }: { title: StringKey; fields: Field[]; initial: Record<string, Value>; onApply: (changed: Record<string, Value>, all: Record<string, Value>) => void; onClose: () => void; apply?: StringKey }): React.JSX.Element {
  const { t } = useI18n()
  const [v, setV] = useState<Record<string, Value>>(initial)
  const set = (k: string, x: Value) => setV((s) => ({ ...s, [k]: x }))
  const bad = fields.some((f) => f.kind === 'number' && (!Number.isFinite(Number(v[f.key])) || (f.min !== undefined && Number(v[f.key]) < f.min) || (f.max !== undefined && Number(v[f.key]) > f.max)))
  const submit = () => {
    if (bad) return
    const changed: Record<string, Value> = {}
    for (const f of fields) if (v[f.key] !== initial[f.key]) changed[f.key] = v[f.key]!
    onApply(changed, v)
    onClose()
  }
  const checks = fields.filter((f) => f.kind === 'check')
  return (
    <Dialog
      title={t(title)}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('nextDialogCancel')}
          </Button>
          <Button onClick={submit} disabled={bad}>
            {t(apply)}
          </Button>
        </>
      }
    >
      <div className="hangul-dialog-stack">
        <div className="hangul-dialog-grid">
          {fields.map((f) => {
            if (f.kind === 'check') return null
            if (f.kind === 'select') {
              return (
                <Select key={f.key} label={t(f.label)} value={String(v[f.key])} options={f.options.map(([value, label]) => ({ value, label: t(label) }))} onChange={(_e, o) => o && set(f.key, String(o.value))} />
              )
            }
            if (f.kind === 'color') return <Input key={f.key} type="color" label={t(f.label)} value={String(v[f.key])} onChange={(e) => set(f.key, e.target.value.toLowerCase())} />
            if (f.kind === 'text') return <Input key={f.key} label={t(f.label)} value={String(v[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
            return (
              <Input
                key={f.key}
                type="number"
                label={f.kind === 'mm' ? `${t(f.label)} (mm)` : t(f.label)}
                value={String(v[f.key])}
                aria-invalid={f.kind === 'number' && bad ? true : undefined}
                onChange={(e) => set(f.key, num(e.target.value))}
              />
            )
          })}
        </div>
        {checks.length ? (
          <div className="hangul-dialog-flags">
            {checks.map((f) => (
              <Checkbox key={f.key} label={t(f.label)} checked={!!v[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
            ))}
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}

export function InsertRowsColsDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  return (
    <FormDialog
      title="nextInsertRowsColsTitle"
      fields={[
        { key: 'where', label: 'nextInsertWhere', kind: 'select', options: [['below', 'nextWhereBelow'], ['above', 'nextWhereAbove'], ['right', 'nextWhereRight'], ['left', 'nextWhereLeft']] },
        { key: 'count', label: 'nextCount', kind: 'number', min: 1, max: 100 },
      ]}
      initial={{ where: 'below', count: 1 }}
      onApply={(_c, all) => (view.run('table:insert-rows-cols', { where: all.where, count: Number(all.count) }), onApplied())}
      onClose={onClose}
    />
  )
}

export function DeleteRowsColsDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  return (
    <FormDialog
      title="nextDeleteRowsColsTitle"
      fields={[{ key: 'what', label: 'nextDeleteWhat', kind: 'select', options: [['rows', 'nextRows'], ['cols', 'nextCols']] }]}
      initial={{ what: 'rows' }}
      onApply={(_c, all) => (view.run('table:delete-rows-cols', { what: all.what }), onApplied())}
      onClose={onClose}
      apply="nextDialogDelete"
    />
  )
}

export function ColumnSettingsDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const c = useMemo(() => columnSettings(view.session), [view])
  return (
    <FormDialog
      title="nextColumnsTitle"
      fields={[
        { key: 'count', label: 'nextColumnCount', kind: 'number', min: 1, max: 16 },
        { key: 'type', label: 'nextColumnType', kind: 'select', options: [['0', 'nextColumnNormal'], ['1', 'nextColumnDistribute'], ['2', 'nextColumnParallel']] },
        { key: 'spacing', label: 'nextColumnGap', kind: 'mm' },
      ]}
      initial={{ count: c.count, type: String(c.type), spacing: mm(c.spacing) }}
      onApply={(changed, all) => {
        if (!Object.keys(changed).length) return
        view.run('page:columns-set', { count: Number(all.count), type: Number(all.type), sameWidth: true, spacing: hu(Number(all.spacing)) })
        onApplied()
      }}
      onClose={onClose}
    />
  )
}

export function SectionSettingsDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const d = useMemo(() => sectionDef(view.session), [view])
  return (
    <FormDialog
      title="nextSectionTitle"
      fields={[
        { key: 'pageNum', label: 'nextSectionPageStart', kind: 'number', min: 0, max: 65535 },
        { key: 'defaultTabSpacing', label: 'nextSectionTab', kind: 'mm' },
        { key: 'columnSpacing', label: 'nextColumnGap', kind: 'mm' },
        { key: 'hideHeader', label: 'nextHideHeader', kind: 'check' },
        { key: 'hideFooter', label: 'nextHideFooter', kind: 'check' },
        { key: 'hideMasterPage', label: 'nextHideMaster', kind: 'check' },
        { key: 'hideBorder', label: 'nextHideBorder', kind: 'check' },
        { key: 'hideFill', label: 'nextHideFill', kind: 'check' },
        { key: 'hideEmptyLine', label: 'nextHideEmptyLine', kind: 'check' },
      ]}
      initial={{
        pageNum: Number(d.pageNum ?? 0),
        defaultTabSpacing: mm(d.defaultTabSpacing),
        columnSpacing: mm(d.columnSpacing),
        hideHeader: !!d.hideHeader,
        hideFooter: !!d.hideFooter,
        hideMasterPage: !!d.hideMasterPage,
        hideBorder: !!d.hideBorder,
        hideFill: !!d.hideFill,
        hideEmptyLine: !!d.hideEmptyLine,
      }}
      onApply={(changed) => {
        const props: Record<string, unknown> = {}
        for (const [k, x] of Object.entries(changed)) props[k] = k === 'defaultTabSpacing' || k === 'columnSpacing' ? hu(Number(x)) : x
        if (Object.keys(props).length) (view.run('page:section-set', { props }), onApplied())
      }}
      onClose={onClose}
    />
  )
}

const LINE_TYPES: Array<[string, StringKey]> = [
  ['0', 'nextLineNone'],
  ['1', 'nextLineSolid'],
  ['2', 'nextLineDash'],
  ['3', 'nextLineDot'],
  ['8', 'nextLineDouble'],
]

export function PageBorderDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const b = useMemo(() => pageBorder(view.session), [view])
  const top = (b.borderTop ?? {}) as { type?: number; width?: number; color?: string }
  return (
    <FormDialog
      title="nextPageBorderTitle"
      fields={[
        { key: 'type', label: 'nextLineType', kind: 'select', options: LINE_TYPES },
        { key: 'width', label: 'nextLineWidthIndex', kind: 'number', min: 0, max: 15 },
        { key: 'color', label: 'nextLineColor', kind: 'color' },
        { key: 'gap', label: 'nextPageBorderGap', kind: 'mm' },
        { key: 'fill', label: 'nextFillSolid', kind: 'check' },
        { key: 'fillColor', label: 'nextFillColor', kind: 'color' },
      ]}
      initial={{ type: String(top.type ?? 0), width: Number(top.width ?? 0), color: String(top.color ?? '#000000'), gap: mm(b.spacingTop), fill: b.fillType === 'solid', fillColor: String(b.fillColor ?? '#ffffff') }}
      onApply={(changed, all) => {
        if (!Object.keys(changed).length) return
        const line = { type: Number(all.type), width: Number(all.width), color: String(all.color) }
        const gap = hu(Number(all.gap))
        view.run('page:border-set', {
          props: {
            borderTop: line,
            borderBottom: line,
            borderLeft: line,
            borderRight: line,
            spacingTop: gap,
            spacingBottom: gap,
            spacingLeft: gap,
            spacingRight: gap,
            fillType: all.fill ? 'solid' : 'none',
            fillColor: String(all.fillColor),
          },
        })
        onApplied()
      }}
      onClose={onClose}
    />
  )
}

export function EndnoteShapeDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const e = useMemo(() => endnoteShape(view.session), [view])
  return (
    <FormDialog
      title="nextEndnoteTitle"
      fields={[
        { key: 'numberFormat', label: 'nextNoteNumberFormat', kind: 'select', options: [['digit', 'nextFmtDigit'], ['circledDigit', 'nextFmtCircled'], ['upperRoman', 'nextFmtRomanUpper'], ['lowerRoman', 'nextFmtRomanLower'], ['upperAlpha', 'nextFmtLatinUpper'], ['lowerAlpha', 'nextFmtLatinLower'], ['hangulSyllable', 'nextFmtHangul']] },
        { key: 'startNumber', label: 'nextNoteStart', kind: 'number', min: 1, max: 65535 },
        { key: 'prefixChar', label: 'nextNotePrefix', kind: 'text' },
        { key: 'suffixChar', label: 'nextNoteSuffix', kind: 'text' },
        { key: 'separatorEnabled', label: 'nextNoteSeparator', kind: 'check' },
        { key: 'numberCodeSuperscript', label: 'nextNoteSuperscript', kind: 'check' },
      ]}
      initial={{
        numberFormat: String(e.numberFormat ?? 'digit'),
        startNumber: Number(e.startNumber ?? 1),
        prefixChar: String(e.prefixChar ?? ''),
        suffixChar: String(e.suffixChar ?? ''),
        separatorEnabled: !!e.separatorEnabled,
        numberCodeSuperscript: !!e.numberCodeSuperscript,
      }}
      onApply={(changed) => Object.keys(changed).length && (view.run('note:endnote-shape-set', { props: changed }), onApplied())}
      onClose={onClose}
    />
  )
}

export function HeaderFooterTemplateDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  return (
    <FormDialog
      title="nextHfTemplateTitle"
      fields={[
        { key: 'kind', label: 'nextHfKind', kind: 'select', options: [['header', 'nextHideHeader'], ['footer', 'nextHideFooter']] },
        {
          key: 'template',
          label: 'nextHfTemplate',
          kind: 'select',
          options: [
            ['2', 'nextHfCenter'],
            ['1', 'nextHfLeft'],
            ['3', 'nextHfRight'],
            ['4', 'nextHfNumberName'],
            ['5', 'nextHfNameNumber'],
            ['7', 'nextHfCenterBold'],
            ['0', 'nextHfEmpty'],
          ],
        },
      ]}
      initial={{ kind: 'footer', template: '2' }}
      onApply={(_c, all) => (view.run('page:hf-template', { header: all.kind === 'header', template: Number(all.template) }), onApplied())}
      onClose={onClose}
    />
  )
}

const PRESET_KEYS: Record<string, StringKey> = {
  outline: 'nextNumOutline',
  digits: 'nextNumDigits',
  roman: 'nextNumRoman',
  chapters: 'nextNumChapters',
  hanja: 'nextNumHanja',
  circled: 'nextNumCircled',
}

export function NumberingShapeDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  return (
    <FormDialog
      title="nextNumberingTitle"
      fields={[
        { key: 'preset', label: 'nextNumberingPreset', kind: 'select', options: NUMBERING_PRESETS.map((p) => [p.id, PRESET_KEYS[p.id]!] as [string, StringKey]) },
        { key: 'start', label: 'nextNewPageNumStart', kind: 'number', min: 1, max: 65535 },
        { key: 'restart', label: 'nextNumberingRestart', kind: 'check' },
      ]}
      initial={{ preset: 'outline', start: 1, restart: false }}
      onApply={(_c, all) => (view.run('format:numbering-shape', { preset: all.preset, start: Number(all.start), restart: !!all.restart }), onApplied())}
      onClose={onClose}
    />
  )
}

export function FieldEditDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const f = useMemo(() => fieldAt(view.session), [view])
  return (
    <FormDialog
      title="nextFieldEditTitle"
      fields={[
        { key: 'name', label: 'nextFieldName', kind: 'text' },
        { key: 'value', label: 'nextFieldValue', kind: 'text' },
      ]}
      initial={{ name: f?.name ?? '', value: f?.value ?? '' }}
      onApply={(changed) => Object.keys(changed).length && (view.run('field:edit-apply', changed), onApplied())}
      onClose={onClose}
    />
  )
}

export function GridSettingsDialog({ size, onSize, onClose }: { size: number; onSize: (px: number) => void; onClose: () => void }): React.JSX.Element {
  return (
    <FormDialog
      title="nextGridTitle"
      fields={[{ key: 'size', label: 'nextGridSize', kind: 'mm' }]}
      initial={{ size: Math.round((size / 96) * 25.4 * 10) / 10 }}
      onApply={(_c, all) => onSize(Math.max(2, Math.round((Number(all.size) / 25.4) * 96)))}
      onClose={onClose}
    />
  )
}

/** 문자표 and 글머리표: a grid of characters. */
const SYMBOLS = '※★☆○●◎◇◆□■△▲▽▼→←↑↓↔〓“”‘’「」『』【】〔〕《》〈〉·…‥§¶†‡°℃℉‰±×÷≠≤≥∞∴∵√∑∏∫∮∂∇㉠㉡㉢㉣①②③④⑤⑥⑦⑧⑨⑩ⅠⅡⅢⅣⅤ㈜℡™©®'
const BULLETS = '●○■□◆◇▶▷★☆※✓✔➤–·'

function CharGridDialog({ title, chars, onPick, onClose }: { title: StringKey; chars: string; onPick: (ch: string) => void; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  return (
    <Dialog title={t(title)} closeLabel={t('nextDialogClose')} onClose={onClose} width={480} footer={<Button variant="secondary" onClick={onClose}>{t('nextDialogCancel')}</Button>}>
      <div className="hangul-char-grid" role="group" aria-label={t(title)}>
        {[...chars].map((ch) => (
          <button
            key={ch}
            type="button"
            className="hangul-char-grid__cell"
            aria-label={`U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`}
            onClick={() => {
              onPick(ch)
              onClose()
            }}
          >
            {ch}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

export function SymbolsDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  return <CharGridDialog title="nextSymbolsTitle" chars={SYMBOLS} onPick={(ch) => (view.run('edit:insert-text', { text: ch }), onApplied())} onClose={onClose} />
}

export function BulletShapeDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  return <CharGridDialog title="nextBulletTitle" chars={BULLETS} onPick={(ch) => (view.run('format:apply-bullet', { bulletChar: ch }), onApplied())} onClose={onClose} />
}
