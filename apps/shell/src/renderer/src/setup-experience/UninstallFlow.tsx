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
import { OfficeMark } from './OfficeMark'
import { copy, type Lang } from './setup-copy'

type Step = 'confirm' | 'feedback' | 'removing' | 'done'

function BrandBar(): ReactElement {
  // Same Office identity as the splash frame 2 (icon + "Redrob Office" text).
  return (
    <div className="setup-window__brand">
      <OfficeMark size={22} />
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
  const [reason, setReason] = useState<string | null>(null)
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

  // MOCK: feedback + reason are intentionally discarded (no transport on this
  // branch). Referenced so the lint/types see them as read, never sent.
  const dropFeedback = () => void `${reason ?? ''}:${feedback}`

  const removeIndex = Math.min(
    t.uninstall.removingSteps.length - 1,
    Math.floor((progress / 100) * t.uninstall.removingSteps.length),
  )

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
            <div className="setup-window__reasons">
              {t.uninstall.feedbackReasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={
                    reason === r
                      ? 'setup-window__reason setup-window__reason--on'
                      : 'setup-window__reason'
                  }
                  aria-pressed={reason === r}
                  onClick={() => setReason((cur) => (cur === r ? null : r))}
                >
                  {r}
                </button>
              ))}
            </div>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.currentTarget.value)}
              placeholder={t.uninstall.feedbackPlaceholder}
              rows={3}
            />
          </>
        )}

        {step === 'removing' && (
          <>
            <h1 className="setup-window__title">{t.uninstall.removingTitle}</h1>
            <Progress value={progress} max={100} />
            {/* One line that changes in place as the bar advances. */}
            <p className="setup-window__line" key={removeIndex}>
              {t.uninstall.removingSteps[removeIndex]}
            </p>
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
