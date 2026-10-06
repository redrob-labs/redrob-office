import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react'
import { Alert, Button } from '../kit'
import { Dialog } from '../Dialog'
import type { Role, ShareApi, ShareStatus } from '@genoffice/sync-client'

/** Share copy; English is the master and the only selectable language. */
export const SHARE_STRINGS = {
  button: 'Share',
  title: 'Share {name}',
  close: 'Close',
  account: 'Redrob account',
  accountHint: 'The account id or e-mail they sign in to Redrob with.',
  role: 'They may',
  roleEdit: 'Edit',
  roleComment: 'Comment',
  roleView: 'View',
  roleOwner: 'Owner',
  invite: 'Share',
  people: 'People with access',
  remove: 'Remove {name}',
  removeShort: 'Remove',
  notShared: 'Only you have this file. Share it and it is copied to Redrob sync; your saves keep it current.',
  noService: 'Sharing is not available in this build yet. Files stay on this computer.',
  signedOut: 'Sign in to Redrob in Settings, Sharing, to share files.',
  unreachable: 'The sync service could not be reached. Nothing changed.',
  unsaved: 'Save the file first; then it can be shared.',
  fileOnlyNote: 'Shared as a file: each save becomes a new version for everyone. Editing together live is not available for this kind of file.',
  privateNote: "Redrob's proposals that nobody has kept are never shared.",
} as const

const fill = (s: string, v: Record<string, string>) => Object.entries(v).reduce((o, [k, x]) => o.split(`{${k}}`).join(x), s)

const ROLE_LABEL: Record<Role, string> = {
  owner: SHARE_STRINGS.roleOwner,
  edit: SHARE_STRINGS.roleEdit,
  comment: SHARE_STRINGS.roleComment,
  view: SHARE_STRINGS.roleView,
}

export interface ShareDialogProps {
  open: boolean
  onClose: () => void
  path: string | null
  fileName: string
  api: ShareApi | undefined
  /** an extra line under the people list, e.g. that this kind of file has no live editing */
  note?: string | undefined
}

/** Share: people and what each may do. The owner gives edit, comment or view. */
export function ShareDialog({ open, onClose, path, fileName, api, note }: ShareDialogProps): ReactElement | null {
  const [status, setStatus] = useState<ShareStatus | null>(null)
  const [account, setAccount] = useState('')
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('edit')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const accountId = useId()
  const hintId = useId()

  useEffect(() => {
    if (!open) return
    setError(null)
    if (!api || !path) {
      setStatus(api ? null : { available: false, reason: 'no-service' })
      return
    }
    void api.shareStatus(path).then(setStatus)
  }, [open, api, path])

  if (!open) return null

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    if (!api || !path || !account.trim()) return
    setBusy(true)
    setError(null)
    const r = await api.shareInvite(path, account.trim(), role)
    setBusy(false)
    if (r.ok) {
      setStatus(r.status)
      setAccount('')
    } else setError(r.error)
  }

  const remove = async (sub: string) => {
    if (!api || !path) return
    const r = await api.shareRemove(path, sub)
    if (r.ok) setStatus(r.status)
    else setError(r.error)
  }

  const unavailable =
    !path ? SHARE_STRINGS.unsaved
    : status && !status.available
      ? status.reason === 'signed-out'
        ? SHARE_STRINGS.signedOut
        : status.reason === 'unreachable'
          ? SHARE_STRINGS.unreachable
          : SHARE_STRINGS.noService
      : null
  const isOwner = !!status && status.available && (!status.shared || status.role === 'owner')

  return (
    <Dialog title={fill(SHARE_STRINGS.title, { name: fileName })} closeLabel={SHARE_STRINGS.close} onClose={onClose} width={480} className="doc-share">
      {error && <Alert tone="danger" title={error} />}
      {unavailable ? (
        <p className="doc-share__note">{unavailable}</p>
      ) : status ? (
        <>
          {isOwner && (
            <form className="doc-share__form" onSubmit={invite}>
              <label htmlFor={accountId}>{SHARE_STRINGS.account}</label>
              <div className="doc-share__row">
                <input
                  id={accountId}
                  value={account}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={hintId}
                  onChange={(e) => setAccount(e.target.value)}
                />
                <select
                  aria-label={SHARE_STRINGS.role}
                  value={role}
                  onChange={(e) => setRole(e.target.value as Exclude<Role, 'owner'>)}
                >
                  <option value="edit">{SHARE_STRINGS.roleEdit}</option>
                  <option value="comment">{SHARE_STRINGS.roleComment}</option>
                  <option value="view">{SHARE_STRINGS.roleView}</option>
                </select>
                <Button size="sm" variant="primary" type="submit" disabled={busy || !account.trim()}>
                  {SHARE_STRINGS.invite}
                </Button>
              </div>
              <p id={hintId} className="doc-share__note">
                {SHARE_STRINGS.accountHint}
              </p>
            </form>
          )}
          {status.available && status.shared ? (
            <section aria-label={SHARE_STRINGS.people}>
              <h3 className="doc-share__h">{SHARE_STRINGS.people}</h3>
              <ul className="doc-share__people">
                {status.members.map((m) => (
                  <li key={m.sub}>
                    <span className="doc-share__name">{m.name}</span>
                    <span className="doc-share__role">{ROLE_LABEL[m.role]}</span>
                    {status.role === 'owner' && m.role !== 'owner' && (
                      <Button size="sm" variant="ghost" aria-label={fill(SHARE_STRINGS.remove, { name: m.name })} onClick={() => void remove(m.sub)}>
                        {SHARE_STRINGS.removeShort}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="doc-share__note">{SHARE_STRINGS.notShared}</p>
          )}
          {note && <p className="doc-share__note">{note}</p>}
          <p className="doc-share__note">{SHARE_STRINGS.privateNote}</p>
        </>
      ) : null}
    </Dialog>
  )
}
