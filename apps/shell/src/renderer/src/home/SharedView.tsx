import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Alert, Button, EmptyState, Icon } from '@genoffice/ui'
import type { ShareApi, SharedWithMe } from '@genoffice/sync-client'
import { useI18n } from '../locale'

/** Files other people shared with this person; opening one keeps a copy on this computer. */
export function SharedView({ api = window.aiOfficeShare }: { api?: ShareApi | undefined }): ReactElement {
  const { t } = useI18n()
  const [files, setFiles] = useState<SharedWithMe[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!api) return
    void api.sharedWithMe().then((r) => {
      if (Array.isArray(r)) {
        setFiles(r)
        setError(null)
      } else {
        setFiles([])
        setError(r.error)
      }
    })
  }, [api])

  useEffect(load, [load])

  const open = async (f: SharedWithMe) => {
    if (!api) return
    const r = await api.openShared(f.id)
    if (!r.ok) setError(r.error)
    else load()
  }

  if (!api) {
    return (
      <main className="content updates" aria-labelledby="shared-title">
        <header className="updates-head">
          <h1 id="shared-title" className="updates-title">
            {t('navShared')}
          </h1>
          <p className="updates-sub">{t('sharedSub')}</p>
        </header>
        <Alert tone="warning" title={t('sharedUnavailable')} />
      </main>
    )
  }

  const roleLabel = (r: SharedWithMe['role']) =>
    r === 'edit' ? t('sharedRoleEdit') : r === 'comment' ? t('sharedRoleComment') : t('sharedRoleView')

  return (
    <main className="content updates" aria-labelledby="shared-title">
      <header className="updates-head">
        <h1 id="shared-title" className="updates-title">
          {t('navShared')}
        </h1>
        <p className="updates-sub">{t('sharedSub')}</p>
      </header>
      {error && (
        <Alert
          tone="warning"
          title={error}
          action={
            <Button size="sm" variant="secondary" onClick={load}>
              {t('updatesRetry')}
            </Button>
          }
        />
      )}
      {files && files.length === 0 && !error ? (
        <EmptyState
          className="updates-empty"
          icon={<Icon name="users" size={20} />}
          title={t('sharedEmptyTitle')}
          description={t('sharedEmptyBody')}
        />
      ) : (
        <ul className="shared-list">
          {(files ?? []).map((f) => (
            <li key={f.id} className="shared-row">
              <b className="updf__n">{f.name}</b>
              <span className="updf__dir">{roleLabel(f.role)}</span>
              <span className="updf__s updf__s--done">{f.localPath ? t('sharedOnThisComputer') : t('sharedInCloud')}</span>
              <Button size="sm" variant="ghost" aria-label={`${t('updatesOpen')} ${f.name}`} onClick={() => void open(f)}>
                {t('updatesOpen')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
