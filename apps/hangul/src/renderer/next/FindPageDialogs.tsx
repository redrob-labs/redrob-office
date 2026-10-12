/**
 * 찾기 / 찾아 바꾸기 (Ctrl+F / Ctrl+F2) and 편집 용지 (F7) dialogs for the owned
 * editor (spec task 2.3). Search and replace run through edit:find-next,
 * edit:replace and edit:replace-all; page setup through page:setup-apply, so
 * each change is one undo step.
 */
import { useMemo, useState } from 'react'
import type { EditorView } from '@genoffice/hwp-editor'
import { HWPUNIT_PER_MM, countMatches, pageDef, type PageDef } from '@genoffice/hwp-editor'
import { Button, Checkbox, Dialog, Input } from '@genoffice/ui'
import { useI18n } from '../i18n/locale'

type Props = { view: EditorView; onClose: () => void; onApplied: () => void }

export function FindDialog({ view, onClose, onApplied, replace: initialReplace }: Props & { replace: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCase] = useState(false)
  const [replace, setReplace] = useState(initialReplace)
  const [status, setStatus] = useState('')
  const params = { query, caseSensitive }
  const after = () => {
    view.render()
    onApplied()
  }
  const find = (backward: boolean) => {
    view.run('edit:find-next', { ...params, backward })
    const n = countMatches(view.session, query, caseSensitive)
    setStatus(n ? t('nextFindCount', { count: n }) : t('nextFindNone'))
    after()
  }
  const doReplace = () => {
    view.run('edit:replace', { ...params, replacement })
    setStatus(t('nextFindCount', { count: countMatches(view.session, query, caseSensitive) }))
    after()
  }
  const doReplaceAll = () => {
    const n = countMatches(view.session, query, caseSensitive)
    view.run('edit:replace-all', { ...params, replacement })
    setStatus(n ? t('nextReplacedCount', { count: n }) : t('nextFindNone'))
    after()
  }
  return (
    <Dialog
      title={replace ? t('nextReplaceTitle') : t('nextFindTitle')}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button variant="secondary" disabled={!query} onClick={() => find(true)}>
            {t('nextFindPrevious')}
          </Button>
          <Button variant={replace ? 'secondary' : 'primary'} disabled={!query} onClick={() => find(false)}>
            {t('nextFindNext')}
          </Button>
          {replace ? (
            <>
              <Button variant="secondary" disabled={!query || view.readOnly} onClick={doReplace}>
                {t('nextReplace')}
              </Button>
              <Button disabled={!query || view.readOnly} onClick={doReplaceAll}>
                {t('nextReplaceAll')}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <form
        className="hangul-find"
        onSubmit={(e) => {
          e.preventDefault()
          find(false)
        }}
      >
        <Input label={t('nextFindLabel')} value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
        {replace ? <Input label={t('nextReplaceLabel')} value={replacement} onChange={(e) => setReplacement(e.target.value)} /> : null}
        <Checkbox label={t('nextMatchCase')} checked={caseSensitive} onChange={(e) => setCase(e.target.checked)} />
        {!replace ? <Checkbox label={t('nextShowReplace')} checked={false} onChange={() => setReplace(true)} /> : null}
        <p className="hangul-find__status" role="status" aria-live="polite">
          {status}
        </p>
      </form>
    </Dialog>
  )
}

const mm = (hu: number) => Math.round((hu / HWPUNIT_PER_MM) * 10) / 10
const hu = (mmValue: number) => Math.round(mmValue * HWPUNIT_PER_MM)

/** Paper sizes 한글 offers first, in mm (width × height, portrait). */
const PAPERS: Array<[string, number, number]> = [
  ['A4', 210, 297],
  ['A3', 297, 420],
  ['B4', 257, 364],
  ['B5', 182, 257],
  ['Letter', 215.9, 279.4],
  ['Legal', 215.9, 355.6],
]

export function PageSetupDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const { t } = useI18n()
  const initial = useMemo(() => pageDef(view.session), [view])
  const fields = ['width', 'height', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHeader', 'marginFooter', 'marginGutter'] as const
  const [state, setState] = useState(() => ({
    ...Object.fromEntries(fields.map((f) => [f, mm(initial[f])])),
    landscape: initial.landscape,
  }) as Record<(typeof fields)[number], number> & { landscape: boolean })
  const label: Record<(typeof fields)[number], string> = {
    width: t('nextPaperWidth'),
    height: t('nextPaperHeight'),
    marginTop: t('nextMarginTop'),
    marginBottom: t('nextMarginBottom'),
    marginLeft: t('nextMarginLeft'),
    marginRight: t('nextMarginRight'),
    marginHeader: t('nextMarginHeader'),
    marginFooter: t('nextMarginFooter'),
    marginGutter: t('nextMarginGutter'),
  }
  const apply = () => {
    const props: Partial<PageDef> = {}
    for (const f of fields) if (state[f] !== mm(initial[f])) props[f] = hu(Math.max(0, state[f]))
    if (state.landscape !== initial.landscape) props.landscape = state.landscape
    if (Object.keys(props).length) view.run('page:setup-apply', { props })
    onApplied()
    onClose()
  }
  const paper = PAPERS.find(([, w, h]) => Math.abs(w - state.width) < 0.6 && Math.abs(h - state.height) < 0.6)?.[0]
  return (
    <Dialog
      title={t('nextPageSetupTitle')}
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
      <div className="hangul-paper-presets" role="group" aria-label={t('nextPaperKind')}>
        {PAPERS.map(([name, w, h]) => (
          <Button key={name} size="sm" variant={paper === name ? 'primary' : 'secondary'} onClick={() => setState((st) => ({ ...st, width: w, height: h }))}>
            {name}
          </Button>
        ))}
      </div>
      <div className="hangul-dialog-grid">
        {fields.map((f) => (
          <Input key={f} type="number" label={`${label[f]} (mm)`} value={String(state[f])} onChange={(e) => setState((st) => ({ ...st, [f]: Number(e.target.value) }))} />
        ))}
      </div>
      <fieldset className="hangul-dialog-flags">
        <legend>{t('nextOrientation')}</legend>
        <Checkbox label={t('nextLandscape')} checked={state.landscape} onChange={(e) => setState((st) => ({ ...st, landscape: e.target.checked }))} />
      </fieldset>
    </Dialog>
  )
}
