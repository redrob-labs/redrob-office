/**
 * UninstallFlow — branded uninstaller PROTOTYPE.
 *
 * Mirrors the pages the real NSIS uninstaller shows (confirm removal ->
 * removing -> done), plus an OPTIONAL feedback step that is a MOCK ONLY: the
 * real installer has no telemetry here and all transport is stubbed on this
 * branch, so the feedback control collects text locally and discards it. It is
 * kept to try the look of a goodbye flow; see PORTING.md -> uninstall.feedback.
 *
 * Pure local state. Nothing is removed, nothing backend is touched.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { Alert, Button, Progress, Textarea } from '@genoffice/ui'
import logoDark from '../assets/splash/redrob-office-lockup-white.png'
import logoLight from '../assets/splash/redrob-office-lockup.png'
import { copy, PRODUCT, type Lang } from './setup-copy'

type Step = 'confirm' | 'feedback' | 'removing' | 'done'

function BrandBar(): ReactElement {
  const dark =
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return (
    <div className="setup-window__brand">
      <img src={dark ? logoDark : logoLight} alt={PRODUCT.displayName} />
    </div>
  )
}

export interface UninstallFlowProps {
  lang: Lang
}

export function UninstallFlow({ lang }: UninstallFlowProps): ReactElement {
  const t = copy[lang]
  const [step, setStep] = useState<Step>('confirm')
  const [feedback, setFeedback] = useState('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (step !== 'removing') return
    setProgress(0)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setProgress(100)
      const to = window.setTimeout(() => setStep('done'), 400)
      return () => window.clearTimeout(to)
    }
    const id = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          window.clearInterval(id)
          window.setTimeout(() => setStep('done'), 450)
          return 100
        }
        return Math.min(100, p + 5)
      })
    }, 80)
    return () => window.clearInterval(id)
  }, [step])

  // MOCK: feedback is intentionally discarded (no transport on this branch).
  const dropFeedback = () => void feedback

  return (
    <div className="setup-window">
      <BrandBar />
      <div className="setup-window__body">
        {step === 'confirm' && (
          <>
            <h1 className="setup-window__title">{t.uninstall.confirmTitle}</h1>
            <p className="setup-window__text">{t.uninstall.confirmBody}</p>
            <Alert tone="info">{t.uninstall.keepDataNote}</Alert>
          </>
        )}

        {step === 'feedback' && (
          <>
            <h1 className="setup-window__title">{t.uninstall.feedbackTitle}</h1>
            <p className="setup-window__text">{t.uninstall.feedbackBody}</p>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.currentTarget.value)}
              placeholder={t.uninstall.feedbackPlaceholder}
              rows={4}
            />
          </>
        )}

        {step === 'removing' && (
          <>
            <h1 className="setup-window__title">{t.uninstall.removingTitle}</h1>
            <Progress value={progress} max={100} />
          </>
        )}

        {step === 'done' && (
          <div className="setup-window__center">
            <h1 className="setup-window__title setup-window__title--lg">{t.uninstall.doneTitle}</h1>
            <p className="setup-window__text">{t.uninstall.doneBody}</p>
          </div>
        )}
      </div>

      {step === 'confirm' && (
        <div className="setup-window__footer setup-window__footer--split">
          <Button variant="ghost" onClick={() => window.close()}>
            {t.uninstall.cancel}
          </Button>
          <Button variant="danger" onClick={() => setStep('feedback')}>
            {t.uninstall.confirm}
          </Button>
        </div>
      )}

      {step === 'feedback' && (
        <div className="setup-window__footer setup-window__footer--split">
          <Button
            variant="ghost"
            onClick={() => {
              setStep('removing')
            }}
          >
            {t.uninstall.feedbackSkip}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              dropFeedback()
              setStep('removing')
            }}
          >
            {t.uninstall.feedbackSend}
          </Button>
        </div>
      )}

      {step === 'done' && (
        <div className="setup-window__footer">
          <Button variant="primary" onClick={() => window.close()}>
            {t.uninstall.doneClose}
          </Button>
        </div>
      )}
    </div>
  )
}
