import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Alert, Button, EmptyState, Icon, Tabs } from '@genoffice/ui'
import type { ShareApi, SharedByMe, SharedWithMe } from '@genoffice/sync-client'
import { useI18n } from '../locale'

type Tab = 'with-me' | 'by-me'
type Row = { id: string; name: string; detail: string; localPath: string | null }

/**
 * Shared files: what other people shared with this person, and what this
 * person shares. Opening one keeps a copy on this computer.
 */
export function SharedView({ api = window.aiOfficeShare }: { api?: Partial<ShareApi> | undefined }): ReactElement {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('with-me')
  const [withMe, setWithMe] = useState<SharedWithMe[] | null>(null)
  const [byMe, setByMe] = useState<SharedByMe[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const roleLabel = (r: SharedWithMe['role']) =>
    r === 'edit' ? t('sharedRoleEdit') : r === 'comment' ? t('sharedRoleComment') : t('sharedRoleView')
  const peopleLabel = (n: number) =>
    n === 0 ? t('sharedPeopleNone') : n === 1 ? t('sharedPeopleOne') : t('sharedPeopleMany').replace('{n}', String(n))

  const load = useCallback(() => {
    if (!api) return
    const fail = (message: string | null) => setError(message)
    if (tab === 'with-me') {
      if (!api.sharedWithMe) return fail('unavailable')
      void api.sharedWithMe().then((r) => {
        setWithMe(Array.isArray(r) ? r : [])
        fail(Array.isArray(r) ? null : r.error)
      })
    } else {
      if (!api.sharedByMe) return fail('unavailable')
      void api.sharedByMe().then((r) => {
        setByMe(Array.isArray(r) ? r : [])
        fail(Array.isArray(r) ? null : r.error)
      })
    }
  }, [api, tab])

  useEffect(load, [load])

  const rows: Row[] | null =
    tab === 'with-me'
      ? withMe && withMe.map((f) => ({ id: f.id, name: f.name, detail: roleLabel(f.role), localPath: f.localPath }))
      : byMe && byMe.map((f) => ({ id: f.id, name: f.name, detail: peopleLabel(f.people), localPath: f.localPath }))
  const errorText = error === 'unavailable' ? t('sharedUnavailable') : error

  const open = async (f: Row) => {
    if (!api?.openShared) return
    const r = await api.openShared(f.id)
    if (!r.ok) setError(r.error)
    else load()
  }

  const head = (
    <header className="updates-head">
      <h1 id="shared-title" className="updates-title">
        {t('navShared')}
      </h1>
      <p className="updates-sub">{t('sharedSub')}</p>
    </header>
  )

  if (!api) {
    return (
      <main className="content updates" aria-labelledby="shared-title">
        {head}
        <Alert tone="warning" title={t('sharedUnavailable')} />
      </main>
    )
  }

  const empty =
    tab === 'with-me'
      ? { title: t('sharedEmptyTitle'), body: t('sharedEmptyBody') }
      : { title: t('sharedByMeEmptyTitle'), body: t('sharedByMeEmptyBody') }

  return (
    <main className="content updates" aria-labelledby="shared-title">
      {head}
      <Tabs
        label={t('navShared')}
        value={tab}
        onChange={(id) => setTab(id as Tab)}
        items={[
          { id: 'with-me', label: t('sharedTabWithMe') },
          { id: 'by-me', label: t('sharedTabByMe') },
        ]}
      />
      {errorText && (
        <Alert
          tone="warning"
          title={errorText}
          action={
            <Button size="sm" variant="secondary" onClick={load}>
              {t('updatesRetry')}
            </Button>
          }
        />
      )}
      {rows && rows.length === 0 && !error ? (
        <EmptyState className="updates-empty" icon={<Icon name="users" size={20} />} title={empty.title} description={empty.body} />
      ) : (
        <ul className="shared-list" aria-label={tab === 'with-me' ? t('sharedTabWithMe') : t('sharedTabByMe')}>
          {(rows ?? []).map((f) => (
            <li key={f.id} className="shared-row">
              <b className="updf__n">{f.name}</b>
              <span className="updf__dir">{f.detail}</span>
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
