import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react'
import { Alert, Button } from '../kit'
import { Dialog } from '../Dialog'
import type { RemoteLink, Role, ShareApi, ShareStatus } from '@genoffice/sync-client'

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
  linkTitle: 'Invite link',
  linkWhy: 'Anyone signed in to Redrob who has the link can join with this role until it expires. Revoke it to stop that.',
  linkRole: 'People with the link may',
  linkDays: 'Works for',
  linkDay1: '1 day',
  linkDay7: '7 days',
  linkDay30: '30 days',
  linkCreate: 'Create link',
  linkMade: 'The link is shown only now. Copy it and send it to the people you choose.',
  linkUrl: 'Invite link',
  linkCopy: 'Copy',
  linkCopied: 'Copied',
  linkItem: '{role} · until {until} · used {n} times',
  linkItemOne: '{role} · until {until} · used once',
  linkExpired: '{role} · expired {until}',
  linkRevoke: 'Revoke the {role} link until {until}',
  linkRevokeShort: 'Revoke',
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
  const [links, setLinks] = useState<RemoteLink[]>([])
  const [linkRole, setLinkRole] = useState<Exclude<Role, 'owner'>>('view')
  const [linkDays, setLinkDays] = useState(7)
  const [madeUrl, setMadeUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const linkWhyId = useId()
  const linkUrlId = useId()

  const ownerShared = !!status && status.available && status.shared && status.role === 'owner'
  useEffect(() => {
    if (!open || !ownerShared || !path || typeof api?.shareLinks !== 'function') {
      setLinks([])
      return
    }
    void api.shareLinks(path).then((r) => setLinks(Array.isArray(r) ? r : []))
  }, [open, ownerShared, path, api])

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmStop(false)
    setHandTo(null)
    setConfirmLeave(false)
    setMadeUrl(null)
    setCopied(false)
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

  const createLink = async () => {
    if (typeof api?.shareLinkCreate !== 'function' || !path) return
    setBusy(true)
    setError(null)
    setCopied(false)
    const r = await api.shareLinkCreate(path, linkRole, linkDays)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setMadeUrl(r.url)
    // creating the first link shares the file: show its people and links
    const [s, l] = await Promise.all([api.shareStatus(path), api.shareLinks?.(path)])
    setStatus(s)
    if (Array.isArray(l)) setLinks(l)
  }

  const revokeLink = async (id: string) => {
    if (typeof api?.shareLinkRevoke !== 'function' || !path) return
    const r = await api.shareLinkRevoke(path, id)
    if (!r.ok) return setError(r.error)
    setLinks((ls) => ls.filter((l) => l.id !== id))
  }

  const copyLink = async () => {
    if (!madeUrl) return
    try {
      await navigator.clipboard.writeText(madeUrl)
      setCopied(true)
    } catch {
      // the field is selectable; copying by hand still works
    }
  }

  const day = (at: string) => {
    const d = new Date(at)
    return Number.isNaN(d.getTime()) ? at : d.toLocaleDateString(undefined, { dateStyle: 'medium' })
  }
  const linkLine = (l: RemoteLink) => {
    const role = ROLE_LABEL[l.role]
    const until = day(l.expiresAt)
    if (Date.parse(l.expiresAt) <= Date.now()) return fill(SHARE_STRINGS.linkExpired, { role, until })
    return l.uses === 1 ? fill(SHARE_STRINGS.linkItemOne, { role, until }) : fill(SHARE_STRINGS.linkItem, { role, until, n: String(l.uses) })
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
          {isOwner && typeof api?.shareLinkCreate === 'function' && (
            <section className="doc-share__links" aria-label={SHARE_STRINGS.linkTitle}>
              <h3 className="doc-share__h">{SHARE_STRINGS.linkTitle}</h3>
              <p id={linkWhyId} className="doc-share__note">
                {SHARE_STRINGS.linkWhy}
              </p>
              <div className="doc-share__row">
                <select aria-label={SHARE_STRINGS.linkRole} value={linkRole} onChange={(e) => setLinkRole(e.target.value as Exclude<Role, 'owner'>)}>
                  <option value="view">{SHARE_STRINGS.roleView}</option>
                  <option value="comment">{SHARE_STRINGS.roleComment}</option>
                  <option value="edit">{SHARE_STRINGS.roleEdit}</option>
                </select>
                <select aria-label={SHARE_STRINGS.linkDays} value={linkDays} onChange={(e) => setLinkDays(Number(e.target.value))}>
                  <option value={1}>{SHARE_STRINGS.linkDay1}</option>
                  <option value={7}>{SHARE_STRINGS.linkDay7}</option>
                  <option value={30}>{SHARE_STRINGS.linkDay30}</option>
                </select>
                <Button size="sm" variant="secondary" aria-describedby={linkWhyId} disabled={busy} onClick={() => void createLink()}>
                  {SHARE_STRINGS.linkCreate}
                </Button>
              </div>
              {madeUrl && (
                <div className="doc-share__made">
                  <label htmlFor={linkUrlId}>{SHARE_STRINGS.linkUrl}</label>
                  <div className="doc-share__row">
                    <input id={linkUrlId} value={madeUrl} readOnly spellCheck={false} onFocus={(e) => e.target.select()} />
                    <Button size="sm" variant="primary" onClick={() => void copyLink()}>
                      {copied ? SHARE_STRINGS.linkCopied : SHARE_STRINGS.linkCopy}
                    </Button>
                  </div>
                  <p className="doc-share__note" role="status">
                    {SHARE_STRINGS.linkMade}
                  </p>
                </div>
              )}
              {links.length > 0 && (
                <ul className="doc-share__people doc-share__linklist">
                  {links.map((l) => (
                    <li key={l.id}>
                      <span className="doc-share__name">{linkLine(l)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={fill(SHARE_STRINGS.linkRevoke, { role: ROLE_LABEL[l.role], until: day(l.expiresAt) })}
                        onClick={() => void revokeLink(l.id)}
                      >
                        {SHARE_STRINGS.linkRevokeShort}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
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
