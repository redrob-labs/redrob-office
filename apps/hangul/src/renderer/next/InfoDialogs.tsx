/**
 * 정보 (About) and 감추기 (hide on this page) for the owned editor (spec task 2.6).
 * About carries the Hancom attribution the HWP specification's terms require.
 */
import { useMemo, useState } from 'react'
import { pageHideAt, type EditorView, type PageHide } from '@genoffice/hwp-editor'
import { Button, Checkbox, Dialog } from '@genoffice/ui'
import { useI18n, type StringKey } from '../i18n/locale'

type Props = { view: EditorView; onClose: () => void; onApplied: () => void }

export function AboutDialog({ engine, onClose }: { engine: string; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  return (
    <Dialog title={t('nextAboutTitle')} closeLabel={t('nextDialogClose')} onClose={onClose} width={440} footer={<Button onClick={onClose}>{t('nextAboutClose')}</Button>}>
      <div className="hangul-dialog-stack">
        <p>{t('nextAboutEngine', { engine })}</p>
        <p lang="ko">{t('nextAttribution')}</p>
      </div>
    </Dialog>
  )
}

const HIDE: Array<[keyof PageHide, StringKey]> = [
  ['header', 'nextHideHeader'],
  ['footer', 'nextHideFooter'],
  ['master', 'nextHideMaster'],
  ['border', 'nextHideBorder'],
  ['fill', 'nextHideFill'],
  ['pageNum', 'nextHidePageNum'],
]

export function PageHideDialog({ view, onClose, onApplied }: Props): React.JSX.Element {
  const { t } = useI18n()
  const initial = useMemo(() => pageHideAt(view.session), [view])
  const [h, setH] = useState<PageHide>(initial)
  const apply = () => {
    if (JSON.stringify(h) !== JSON.stringify(initial)) view.run('page:hide', h)
    onApplied()
    onClose()
  }
  return (
    <Dialog
      title={t('nextPageHideTitle')}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('nextDialogCancel')}
          </Button>
          <Button onClick={apply}>{t('nextDialogApply')}</Button>
        </>
      }
    >
      <div className="hangul-dialog-flags">
        {HIDE.map(([k, label]) => (
          <Checkbox key={k} label={t(label)} checked={h[k]} onChange={(e) => setH((x) => ({ ...x, [k]: e.target.checked }))} />
        ))}
      </div>
    </Dialog>
  )
}
