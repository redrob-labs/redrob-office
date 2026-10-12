/**
 * 정보 (About) and 감추기 (hide on this page) for the owned editor (spec task 2.6).
 * About carries the Hancom attribution the HWP specification's terms require.
 */
import { useEffect, useMemo, useState } from 'react'
import { pageHideAt, type CompareEntry, type EditorView, type PageHide } from '@genoffice/hwp-editor'
import { Button, Checkbox, Dialog } from '@genoffice/ui'
import { useI18n, type StringKey } from '../i18n/locale'
import type { HangulApi } from '../../shared/ipc'

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

/** 문서 비교: how this document differs from another, paragraph by paragraph. */
export function CompareDialog({ name, entries, onGo, onClose }: { name: string; entries: CompareEntry[]; onGo: (at: { section: number; para: number }) => void; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const label = (e: CompareEntry) => (e.kind === 'added' ? t('nextCompareAdded') : e.kind === 'removed' ? t('nextCompareRemoved', { name }) : t('nextCompareChanged'))
  return (
    <Dialog title={t('nextCompareTitle')} closeLabel={t('nextDialogClose')} onClose={onClose} width={640} footer={<Button onClick={onClose}>{t('nextDialogClose')}</Button>}>
      <div className="hangul-dialog-stack">
        <p>{t('nextCompareWith', { name })}</p>
        {entries.length ? (
          <ol className="hangul-compare-list">
            {entries.map((e, i) => (
              <li key={i} className={`hangul-compare-${e.kind}`}>
                <strong>{label(e)}</strong>
                {e.kind !== 'added' ? <del lang="ko">{e.theirs}</del> : null}
                {e.kind !== 'removed' ? <ins lang="ko">{e.mine}</ins> : null}
                {e.at ? (
                  <Button size="sm" variant="ghost" onClick={() => onGo(e.at!)}>
                    {t('nextCompareGo')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p>{t('nextCompareNone')}</p>
        )}
      </div>
    </Dialog>
  )
}

/** 최근 문서: the Hangul files in the suite's recent list; one opens in its own tab. */
export function RecentDialog({ api, onClose }: { api: Pick<HangulApi, 'recentFiles' | 'openRecent' | 'clearRecent'>; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const [files, setFiles] = useState<string[] | null>(null)
  useEffect(() => {
    let live = true
    void (api.recentFiles?.() ?? Promise.resolve([])).then((f) => live && setFiles(f))
    return () => {
      live = false
    }
  }, [api])
  const open = (p: string) => {
    void api.openRecent?.(p)
    onClose()
  }
  const clear = () => {
    void api.clearRecent?.().then(() => setFiles([]))
  }
  return (
    <Dialog
      title={t('nextRecentTitle')}
      closeLabel={t('nextDialogClose')}
      onClose={onClose}
      width={520}
      footer={
        <>
          <Button variant="secondary" disabled={!files?.length} onClick={clear}>
            {t('nextRecentClear')}
          </Button>
          <Button onClick={onClose}>{t('nextDialogClose')}</Button>
        </>
      }
    >
      {files === null ? null : files.length ? (
        <ul className="hangul-recent-list" aria-label={t('nextRecentTitle')}>
          {files.map((p) => (
            <li key={p}>
              <Button variant="ghost" title={p} onClick={() => open(p)}>
                {p.split(/[\\/]/).pop()}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('nextRecentEmpty')}</p>
      )}
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
