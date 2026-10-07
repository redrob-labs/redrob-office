import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Alert, Button } from '@genoffice/ui'
import type { IdentityApi, PublicIdentity, SignInResult } from '@genoffice/identity'
import type { TFunc } from '../locale'

type Status = Awaited<ReturnType<IdentityApi['identityStatus']>>

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'waiting'; id: string; userCode: string | null; verificationUri: string | null }

function outcomeText(t: TFunc, r: SignInResult | { status: 'unavailable' }): string | null {
  switch (r.status) {
    case 'signed-in':
    case 'cancelled':
      return null
    case 'denied':
      return t('idDenied')
    case 'expired':
      return t('idExpired')
    case 'unreachable':
      return t('idUnreachable')
    case 'unavailable':
      return t('idUnavailable')
    case 'failed':
      return t('idFailed', { code: r.code })
  }
}

/**
 * Settings, Redrob account: who is signed in on this computer. The sign-in is
 * Console's device flow: Office shows a code, the browser approves it, and the
 * token stays in the main process.
 */
export function IdentityPane({ t, api = window.aiOfficeIdentity }: { t: TFunc; api?: IdentityApi | undefined }): ReactElement {
  const [status, setStatus] = useState<Status | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const live = useRef(true)

  const reload = () => {
    if (!api) return
    void api.identityStatus().then((s) => live.current && setStatus(s))
  }

  useEffect(() => {
    live.current = true
    reload()
    const off = api?.onIdentityChanged((_i: PublicIdentity) => reload())
    return () => {
      live.current = false
      off?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  const signIn = async () => {
    if (!api) return
    setError(null)
    setPhase({ kind: 'starting' })
    const attempt = await api.startSignIn()
    if ('status' in attempt) {
      setPhase({ kind: 'idle' })
      setError(outcomeText(t, attempt))
      return
    }
    setPhase({ kind: 'waiting', id: attempt.id, userCode: attempt.userCode, verificationUri: attempt.verificationUri })
    const result = await api.awaitSignIn(attempt.id)
    if (!live.current) return
    setPhase({ kind: 'idle' })
    setError(outcomeText(t, result))
    reload()
  }

  if (!api) return <p className="set-pane-note">{t('idUnavailable')}</p>

  return (
    <div className="id-pane">
      <h3 className="set-pane-title">{t('idTitle')}</h3>
      {error && <Alert tone="danger" title={error} />}
      {status?.signedIn ? (
        <div className="id-signed-in">
          <p className="id-who">
            <b>{t('idSignedInAs', { name: status.name ?? '' })}</b>
            {status.email && <span className="id-email">{status.email}</span>}
          </p>
          {status.provider === 'dev' && <p className="set-pane-note">{t('idDev')}</p>}
          {!status.persistent && <p className="set-pane-note">{t('idNotKept')}</p>}
          <Button size="sm" variant="secondary" onClick={() => void api.signOut().then(reload)}>
            {t('idSignOut')}
          </Button>
        </div>
      ) : phase.kind === 'waiting' ? (
        <div className="id-waiting" aria-live="polite">
          {phase.userCode && (
            <>
              <p>{t('idCodeLead')}</p>
              <p className="id-code" aria-label={phase.userCode.split('').join(' ')}>
                {phase.userCode}
              </p>
            </>
          )}
          <p className="set-pane-note">{t('idWaiting')}</p>
          {phase.verificationUri && <p className="id-uri">{phase.verificationUri}</p>}
          <div className="id-actions">
            <Button size="sm" variant="secondary" onClick={() => void api.cancelSignIn(phase.id)}>
              {t('idCancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="id-signed-out">
          <p className="set-pane-note">{t('idSignedOutBody')}</p>
          <Button size="sm" variant="primary" disabled={phase.kind === 'starting'} onClick={() => void signIn()}>
            {t('idSignIn')}
          </Button>
        </div>
      )}
    </div>
  )
}
