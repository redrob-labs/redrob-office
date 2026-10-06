import { useCallback, useEffect, useId, useState, type FormEvent, type ReactElement } from 'react'
import { Alert, Badge, Button, Drawer, Tabs } from '../kit'
import type { VersionInfo, VersionsApi } from '@genoffice/versions'
import type { ShareApi, SharedVersion } from '@genoffice/sync-client'
import { verT } from './strings'

const when = (at: string) => {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** the part of the Share bridge the history uses: versions kept by the sync service */
export type SharedVersionsApi = Pick<ShareApi, 'shareVersions' | 'shareRestoreVersion'>

export interface VersionHistoryProps {
  open: boolean
  onClose: () => void
  /** the document's path; null before its first save */
  path: string | null
  fileName: string
  api: Partial<VersionsApi> | undefined
  /** the Share bridge; when the file is shared, a second tab lists the versions everyone saved */
  share?: Partial<SharedVersionsApi> | undefined
}

type Tab = 'local' | 'shared'

/**
 * Version history behind the save status: every save kept on this computer,
 * newest first, with named versions and Restore (which opens a copy beside the
 * file, never overwriting it). A shared file also has the versions everyone
 * saved to the sync service; one of those opens as a copy the same way.
 */
export function VersionHistory({ open, onClose, path, fileName, api, share }: VersionHistoryProps): ReactElement | null {
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [shared, setShared] = useState<SharedVersion[] | null>(null)
  const [sharedError, setSharedError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('local')
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [naming, setNaming] = useState('')
  const nameId = useId()

  const reload = useCallback(() => {
    if (!path || !api?.listVersions) {
      setVersions([])
      return
    }
    void api.listVersions(path).then(setVersions)
  }, [path, api])

  const reloadShared = useCallback(() => {
    setShared(null)
    setSharedError(null)
    if (!path || typeof share?.shareVersions !== 'function') return
    void share.shareVersions(path).then(
      (r) => {
        if (Array.isArray(r)) setShared(r)
        // not shared (null) shows no tab; an error shows the tab with the reason
        else if (r) {
          setShared([])
          setSharedError(r.error)
        }
      },
      () => undefined,
    )
  }, [path, share])

  useEffect(() => {
    if (open) {
      setMessage(null)
      setTab('local')
      reload()
      reloadShared()
    }
  }, [open, reload, reloadShared])

  const restore = (v: VersionInfo) => {
    if (!path || !api?.restoreVersion) return
    api.restoreVersion(path, v.id).then(
      (copy) => setMessage(copy ? { tone: 'success', text: verT('verRestored') } : { tone: 'danger', text: verT('verRestoreFailed') }),
      () => setMessage({ tone: 'danger', text: verT('verRestoreFailed') }),
    )
  }

  const restoreShared = (v: SharedVersion) => {
    if (!path || typeof share?.shareRestoreVersion !== 'function') return
    share.shareRestoreVersion(path, v.version).then(
      (r) => setMessage(r.ok ? { tone: 'success', text: verT('verSharedRestored') } : { tone: 'danger', text: r.error }),
      () => setMessage({ tone: 'danger', text: verT('verRestoreFailed') }),
    )
  }

  const current = versions[0]
  const nameCurrent = (e: FormEvent) => {
    e.preventDefault()
    if (!path || !current || !api?.nameVersion || !naming.trim()) return
    void api.nameVersion(path, current.id, naming).then(() => {
      setNaming('')
      setMessage({ tone: 'success', text: verT('verNamed') })
      reload()
    })
  }

  const showShared = shared !== null
  const onShared = showShared && tab === 'shared'

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={verT('verTitle')}
      description={fileName}
      side="right"
      width={380}
      closeLabel={verT('verClose')}
      className="doc-versions"
      footer={
        current && !onShared ? (
          <form className="doc-versions__name" onSubmit={nameCurrent}>
            <label htmlFor={nameId}>{verT('verName')}</label>
            <div className="doc-versions__row">
              <input id={nameId} value={naming} maxLength={120} onChange={(e) => setNaming(e.target.value)} />
              <Button size="sm" variant="secondary" type="submit" disabled={!naming.trim()}>
                {verT('verNameSave')}
              </Button>
            </div>
          </form>
        ) : undefined
      }
    >
      {showShared && (
        <Tabs
          label={verT('verTabs')}
          value={tab}
          onChange={(id) => {
            setTab(id as Tab)
            setMessage(null)
          }}
          items={[
            { id: 'local', label: verT('verTabLocal') },
            { id: 'shared', label: verT('verTabShared') },
          ]}
        />
      )}
      {message && <Alert tone={message.tone} title={message.text} />}
      {onShared ? (
        sharedError ? (
          <Alert tone="warning" title={verT('verSharedLoadFailed')}>
            {sharedError}
          </Alert>
        ) : shared.length === 0 ? (
          <p className="doc-versions__empty">{verT('verSharedEmpty')}</p>
        ) : (
          <ol className="doc-versions__list">
            {shared.map((v, i) => (
              <li key={v.version} className={i === 0 ? 'is-current' : undefined}>
                <div className="doc-versions__text">
                  <b>{verT('verSharedVersion', { n: v.version })}</b>
                  <span>{`${when(v.at)} · ${v.by}`}</span>
                </div>
                {i === 0 ? (
                  <Badge tone="brand">{verT('verCurrent')}</Badge>
                ) : (
                  <Button size="sm" variant="ghost" aria-label={verT('verSharedRestoreLabel', { n: v.version })} onClick={() => restoreShared(v)}>
                    {verT('verSharedRestore')}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )
      ) : !path ? (
        <p className="doc-versions__empty">{verT('verUnsaved')}</p>
      ) : versions.length === 0 ? (
        <p className="doc-versions__empty">{verT('verEmpty')}</p>
      ) : (
        <ol className="doc-versions__list">
          {versions.map((v, i) => (
            <li key={v.id} className={i === 0 ? 'is-current' : undefined}>
              <div className="doc-versions__text">
                <b>{v.name ?? when(v.at)}</b>
                <span>
                  {v.name ? `${when(v.at)} · ${v.by}` : v.by}
                  {v.auto ? ` · ${verT('verAuto')}` : ''}
                </span>
              </div>
              {i === 0 ? (
                <Badge tone="brand">{verT('verCurrent')}</Badge>
              ) : (
                <Button size="sm" variant="ghost" aria-label={verT('verRestoreLabel', { at: when(v.at) })} onClick={() => restore(v)}>
                  {verT('verRestore')}
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  )
}
