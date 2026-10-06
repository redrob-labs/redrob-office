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
  accountHint: 'Their Redrob account id or e-mail address. Someone new to Redrob gets access when they first sign in with that address.',
  pending: 'Invited, not signed in yet',
  pendingCancel: 'Cancel the invite to {name}',
  pendingCancelShort: 'Cancel',
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
  stop: 'Stop sharing',
  stopConfirm: 'Stop sharing for everyone',
  stopCancel: 'Keep sharing',
  stopWhy: 'Everyone else loses access, and the shared versions are deleted. Every copy already on someone’s computer stays there, including yours.',
  makeOwner: 'Make {name} the owner',
  makeOwnerShort: 'Make owner',
  makeOwnerWhy: '{name} becomes the owner and decides who has the file. You stay on it as an editor.',
  makeOwnerConfirm: 'Make {name} the owner',
  makeOwnerCancel: 'Keep it',
  leave: 'Leave this file',
  leaveWhy: 'You lose access to the shared file, and your saves stop reaching the others. The copy on this computer stays.',
  leaveConfirm: 'Leave',
  leaveCancel: 'Stay',
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
  const [confirmStop, setConfirmStop] = useState(false)
  /** the member about to be made owner, while the owner confirms */
  const [handTo, setHandTo] = useState<{ sub: string; name: string } | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const accountId = useId()
  const hintId = useId()
  const stopWhyId = useId()
  const handWhyId = useId()
  const leaveWhyId = useId()

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmStop(false)
    setHandTo(null)
    setConfirmLeave(false)
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

  const stop = async () => {
    if (typeof api?.shareStop !== 'function' || !path) return
    setBusy(true)
    setError(null)
    const r = await api.shareStop(path)
    setBusy(false)
    setConfirmStop(false)
    if (r.ok) setStatus(r.status)
    else setError(r.error)
  }

  const transfer = async (sub: string) => {
    if (typeof api?.shareTransfer !== 'function' || !path) return
    setBusy(true)
    setError(null)
    const r = await api.shareTransfer(path, sub)
    setBusy(false)
    setHandTo(null)
    if (r.ok) setStatus(r.status)
    else setError(r.error)
  }

  const leave = async () => {
    if (typeof api?.shareLeave !== 'function' || !path) return
    setBusy(true)
    setError(null)
    const r = await api.shareLeave(path)
    setBusy(false)
    setConfirmLeave(false)
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
                    {status.role === 'owner' && m.role === 'edit' && typeof api?.shareTransfer === 'function' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={fill(SHARE_STRINGS.makeOwner, { name: m.name })}
                        disabled={busy}
                        onClick={() => setHandTo({ sub: m.sub, name: m.name })}
                      >
                        {SHARE_STRINGS.makeOwnerShort}
                      </Button>
                    )}
                    {status.role === 'owner' && m.role !== 'owner' && (
                      <Button size="sm" variant="ghost" aria-label={fill(SHARE_STRINGS.remove, { name: m.name })} onClick={() => void remove(m.sub)}>
                        {SHARE_STRINGS.removeShort}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {handTo && status.role === 'owner' && (
                <div className="doc-share__stop">
                  <p id={handWhyId} className="doc-share__note">
                    {fill(SHARE_STRINGS.makeOwnerWhy, { name: handTo.name })}
                  </p>
                  <div className="doc-share__row">
                    <Button size="sm" variant="primary" aria-describedby={handWhyId} disabled={busy} onClick={() => void transfer(handTo.sub)}>
                      {fill(SHARE_STRINGS.makeOwnerConfirm, { name: handTo.name })}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setHandTo(null)}>
                      {SHARE_STRINGS.makeOwnerCancel}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <p className="doc-share__note">{SHARE_STRINGS.notShared}</p>
          )}
          {status.available && status.shared && status.role === 'owner' && status.pending && status.pending.length > 0 && (
            <section aria-label={SHARE_STRINGS.pending}>
              <h3 className="doc-share__h">{SHARE_STRINGS.pending}</h3>
              <ul className="doc-share__people doc-share__pending">
                {status.pending.map((p) => (
                  <li key={p.email}>
                    <span className="doc-share__name">{p.email}</span>
                    <span className="doc-share__role">{ROLE_LABEL[p.role]}</span>
                    <Button size="sm" variant="ghost" aria-label={fill(SHARE_STRINGS.pendingCancel, { name: p.email })} onClick={() => void remove(p.email)}>
                      {SHARE_STRINGS.pendingCancelShort}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {status.available && status.shared && status.role === 'owner' && typeof api?.shareStop === 'function' && (
            <div className="doc-share__stop">
              {confirmStop ? (
                <>
                  <p id={stopWhyId} className="doc-share__note">
                    {SHARE_STRINGS.stopWhy}
                  </p>
                  <div className="doc-share__row">
                    <Button size="sm" variant="danger" aria-describedby={stopWhyId} disabled={busy} onClick={() => void stop()}>
                      {SHARE_STRINGS.stopConfirm}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmStop(false)}>
                      {SHARE_STRINGS.stopCancel}
                    </Button>
                  </div>
                </>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setConfirmStop(true)}>
                  {SHARE_STRINGS.stop}
                </Button>
              )}
            </div>
          )}
          {status.available && status.shared && status.role !== 'owner' && typeof api?.shareLeave === 'function' && (
            <div className="doc-share__stop">
              {confirmLeave ? (
                <>
                  <p id={leaveWhyId} className="doc-share__note">
                    {SHARE_STRINGS.leaveWhy}
                  </p>
                  <div className="doc-share__row">
                    <Button size="sm" variant="danger" aria-describedby={leaveWhyId} disabled={busy} onClick={() => void leave()}>
                      {SHARE_STRINGS.leaveConfirm}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmLeave(false)}>
                      {SHARE_STRINGS.leaveCancel}
                    </Button>
                  </div>
                </>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setConfirmLeave(true)}>
                  {SHARE_STRINGS.leave}
                </Button>
              )}
            </div>
          )}
          {note && <p className="doc-share__note">{note}</p>}
          <p className="doc-share__note">{SHARE_STRINGS.privateNote}</p>
        </>
      ) : null}
    </Dialog>
  )
}
