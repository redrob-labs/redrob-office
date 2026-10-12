import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react'
import { Alert, Button } from '../kit'
import { Dialog } from '../Dialog'
import type { Role, ShareApi, ShareStatus } from '@genoffice/sync-client'
import { pageLang } from './strings'

/** Share copy. English is the master; Korean below; others fall back to English. */
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
  privateNote: "Redrob's proposals that nobody has kept are never shared.",
} as const

const SHARE_KO: Partial<Record<keyof typeof SHARE_STRINGS, string>> = {
  button: '공유',
  title: '{name} 공유',
  close: '닫기',
  account: 'Redrob 계정',
  accountHint: '상대가 Redrob에 로그인할 때 쓰는 계정 ID 또는 이메일입니다.',
  role: '권한',
  roleEdit: '편집',
  roleComment: '메모',
  roleView: '보기',
  roleOwner: '소유자',
  invite: '공유',
  people: '접근할 수 있는 사람',
  remove: '{name} 제거',
  removeShort: '제거',
  notShared: '나만 이 파일을 가지고 있습니다. 공유하면 Redrob 동기화로 복사되고, 저장할 때마다 최신 상태로 유지됩니다.',
  noService: '이 빌드에서는 아직 공유를 쓸 수 없습니다. 파일은 이 컴퓨터에 남습니다.',
  signedOut: '파일을 공유하려면 설정의 공유에서 Redrob에 로그인하세요.',
  unreachable: '동기화 서비스에 연결할 수 없습니다. 아무것도 바뀌지 않았습니다.',
  unsaved: '먼저 파일을 저장하면 공유할 수 있습니다.',
  privateNote: '아무도 받아들이지 않은 Redrob의 제안은 공유되지 않습니다.',
}

/** One share string in the page's interface language (the Share button, for one). */
export function shareText(key: keyof typeof SHARE_STRINGS): string {
  return shareCopy()[key]
}

/** Share copy in the page's interface language. */
function shareCopy(): Record<keyof typeof SHARE_STRINGS, string> {
  return pageLang() === 'ko' ? { ...SHARE_STRINGS, ...SHARE_KO } : SHARE_STRINGS
}

const fill = (s: string, v: Record<string, string>) => Object.entries(v).reduce((o, [k, x]) => o.split(`{${k}}`).join(x), s)

export interface ShareDialogProps {
  open: boolean
  onClose: () => void
  path: string | null
  fileName: string
  api: ShareApi | undefined
}

/** Share: people and what each may do. The owner gives edit, comment or view. */
export function ShareDialog({ open, onClose, path, fileName, api }: ShareDialogProps): ReactElement | null {
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
  const S = shareCopy()
  const ROLE_LABEL: Record<Role, string> = { owner: S.roleOwner, edit: S.roleEdit, comment: S.roleComment, view: S.roleView }

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
    !path ? S.unsaved
    : status && !status.available
      ? status.reason === 'signed-out'
        ? S.signedOut
        : status.reason === 'unreachable'
          ? S.unreachable
          : S.noService
      : null
  const isOwner = !!status && status.available && (!status.shared || status.role === 'owner')

  return (
    <Dialog title={fill(S.title, { name: fileName })} closeLabel={S.close} onClose={onClose} width={480} className="doc-share">
      {error && <Alert tone="danger" title={error} />}
      {unavailable ? (
        <p className="doc-share__note">{unavailable}</p>
      ) : status ? (
        <>
          {isOwner && (
            <form className="doc-share__form" onSubmit={invite}>
              <label htmlFor={accountId}>{S.account}</label>
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
                  aria-label={S.role}
                  value={role}
                  onChange={(e) => setRole(e.target.value as Exclude<Role, 'owner'>)}
                >
                  <option value="edit">{S.roleEdit}</option>
                  <option value="comment">{S.roleComment}</option>
                  <option value="view">{S.roleView}</option>
                </select>
                <Button size="sm" variant="primary" type="submit" disabled={busy || !account.trim()}>
                  {S.invite}
                </Button>
              </div>
              <p id={hintId} className="doc-share__note">
                {S.accountHint}
              </p>
            </form>
          )}
          {status.available && status.shared ? (
            <section aria-label={S.people}>
              <h3 className="doc-share__h">{S.people}</h3>
              <ul className="doc-share__people">
                {status.members.map((m) => (
                  <li key={m.sub}>
                    <span className="doc-share__name">{m.name}</span>
                    <span className="doc-share__role">{ROLE_LABEL[m.role]}</span>
                    {status.role === 'owner' && m.role !== 'owner' && (
                      <Button size="sm" variant="ghost" aria-label={fill(S.remove, { name: m.name })} onClick={() => void remove(m.sub)}>
                        {S.removeShort}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="doc-share__note">{S.notShared}</p>
          )}
          <p className="doc-share__note">{S.privateNote}</p>
        </>
      ) : null}
    </Dialog>
  )
}
