import { useCallback, useEffect, useId, useState, type FormEvent, type ReactElement } from 'react'
import { Alert, Button, Dialog } from '@genoffice/ui'
import type { LinkPreview, Role, ShareApi } from '@genoffice/sync-client'
import { useI18n, type TFunc } from '../locale'

export type JoinApi = Partial<Pick<ShareApi, 'shareLinkPeek' | 'shareLinkJoin' | 'onShareJoinRequest' | 'shareTakeJoinRequest'>>

function roleWords(r: Role, t: TFunc): string {
  return r === 'owner' ? t('joinRoleOwner') : r === 'edit' ? t('activityRoleEdit') : r === 'comment' ? t('activityRoleComment') : t('activityRoleView')
}

/**
 * Joining a shared file from an invite link. A link clicked outside the app
 * (or pasted in Shared) only opens this dialog: it says who shares what and
 * with which role, and nothing is joined until the person presses Join.
 */
export function useJoinLink(api: JoinApi | undefined = window.aiOfficeShare): { dialog: ReactElement | null; openBlank: () => void } {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const check = useCallback(
    async (link: string) => {
      if (typeof api?.shareLinkPeek !== 'function') return
      setBusy(true)
      setError(null)
      setPreview(null)
      const r = await api.shareLinkPeek(link)
      setBusy(false)
      if (r.ok) setPreview(r.preview)
      else setError(r.error)
    },
    [api],
  )

  const show = useCallback(
    (link: string) => {
      setText(link)
      setOpen(true)
      void check(link)
    },
    [check],
  )

  useEffect(() => {
    void api?.shareTakeJoinRequest?.().then((l) => {
      if (l) show(l)
    })
    return api?.onShareJoinRequest?.(show)
  }, [api, show])

  const close = () => {
    setOpen(false)
    setPreview(null)
    setError(null)
    setText('')
  }

  const join = async () => {
    if (typeof api?.shareLinkJoin !== 'function') return
    setBusy(true)
    setError(null)
    const r = await api.shareLinkJoin(text)
    setBusy(false)
    if (r.ok) close()
    else setError(r.error)
  }

  const openBlank = useCallback(() => {
    setText('')
    setPreview(null)
    setError(null)
    setOpen(true)
  }, [])

  return { dialog: open ? <JoinDialog {...{ text, setText, preview, error, busy, check, join, close }} /> : null, openBlank }
}

interface JoinDialogProps {
  text: string
  setText: (v: string) => void
  preview: LinkPreview | null
  error: string | null
  busy: boolean
  check: (link: string) => Promise<void>
  join: () => Promise<void>
  close: () => void
}

function JoinDialog({ text, setText, preview, error, busy, check, join, close }: JoinDialogProps): ReactElement {
  const { t, dateLocale } = useI18n()
  const inputId = useId()
  const hintId = useId()
  const until = (at: string) =>
    Number.isNaN(Date.parse(at)) ? at : new Date(at).toLocaleString(dateLocale, { dateStyle: 'medium', timeStyle: 'short' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) void check(text.trim())
  }

  return (
    <Dialog
      title={t('joinTitle')}
      closeLabel={t('joinCancel')}
      onClose={close}
      width={460}
      className="join-link"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={close}>
            {t('joinCancel')}
          </Button>
          {preview && (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void join()}>
              {preview.alreadyHave ? t('joinOpen') : t('joinYes')}
            </Button>
          )}
        </>
      }
    >
      <form className="join-link__form" onSubmit={submit}>
        <label htmlFor={inputId}>{t('joinPaste')}</label>
        <div className="join-link__row">
          <input
            id={inputId}
            value={text}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hintId}
            onChange={(e) => setText(e.target.value)}
          />
          <Button size="sm" variant="secondary" type="submit" disabled={busy || !text.trim()}>
            {t('joinCheck')}
          </Button>
        </div>
        <p id={hintId} className="updates-sub">
          {t('joinPasteHint')}
        </p>
      </form>
      {error && <Alert tone="danger" title={error} />}
      {preview && (
        <div className="join-link__what" role="status">
          <p>
            <b>{t('joinWhat', { owner: preview.ownerName || '—', file: preview.fileName })}</b>
          </p>
          <p>
            {preview.alreadyHave
              ? t('joinAlready', { role: roleWords(preview.alreadyHave, t) })
              : t('joinRole', { role: roleWords(preview.role, t), until: until(preview.expiresAt) })}
          </p>
        </div>
      )}
    </Dialog>
  )
}
