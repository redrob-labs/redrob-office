import { useCallback, useEffect, useId, useState, type FormEvent, type ReactElement } from 'react'
import { Alert, Badge, Button, Drawer } from '@genoffice/ui'
import type { VersionInfo, VersionsApi } from '@genoffice/versions'
import { verT } from './strings'

const when = (at: string) => {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export interface VersionHistoryProps {
  open: boolean
  onClose: () => void
  /** the document's path; null before its first save */
  path: string | null
  fileName: string
  api: Partial<VersionsApi> | undefined
}

/**
 * Version history behind the save status: every save kept on this computer,
 * newest first, with named versions and Restore (which opens a copy beside the
 * file, never overwriting it).
 */
export function VersionHistory({ open, onClose, path, fileName, api }: VersionHistoryProps): ReactElement | null {
  const [versions, setVersions] = useState<VersionInfo[]>([])
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

  useEffect(() => {
    if (open) {
      setMessage(null)
      reload()
    }
  }, [open, reload])

  const restore = (v: VersionInfo) => {
    if (!path || !api?.restoreVersion) return
    api.restoreVersion(path, v.id).then(
      (copy) => setMessage(copy ? { tone: 'success', text: verT('verRestored') } : { tone: 'danger', text: verT('verRestoreFailed') }),
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
        current ? (
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
      {message && <Alert tone={message.tone} title={message.text} />}
      {!path ? (
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
