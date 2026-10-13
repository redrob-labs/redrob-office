/**
 * InstallFlow — branded Windows-installer PROTOTYPE (NSIS assisted installer).
 *
 * Mirrors the page sequence the real NSIS installer shows, driven by
 * electron-builder.cjs (nsis.oneClick=false, allowToChangeInstallationDirectory=true):
 *   Welcome -> License -> Choose Location -> Installing -> Finish.
 *
 * This is a DESIGN PROTOTYPE: every "action" is local state only. "Install"
 * animates a fake progress bar; "Launch" / "Finish" just close the window.
 * No files are written, no process is spawned, nothing backend is touched.
 *
 * The copy and step list come from setup-copy.ts, keyed to the real NSIS fields
 * so this ports onto the installer later (see PORTING.md).
 */
import { useEffect, useState, type ReactElement } from 'react'
import { Button, Checkbox, Progress } from '@genoffice/ui'
import logoDark from '../assets/splash/redrob-office-lockup-white.png'
import logoLight from '../assets/splash/redrob-office-lockup.png'
import { LICENSE_EXCERPT } from './license-excerpt'
import { copy, PRODUCT, type Lang } from './setup-copy'

type Step = 'welcome' | 'license' | 'location' | 'progress' | 'finish'

/** True on macOS so the location hint shows the right default path. */
function isMac(): boolean {
  try {
    return navigator.platform.toLowerCase().includes('mac')
  } catch {
    return false
  }
}

function BrandBar(): ReactElement {
  // Primary lockup on light, Primary White on dark — matches Launch.tsx.
  const dark =
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return (
    <div className="setup-window__brand">
      <img src={dark ? logoDark : logoLight} alt={PRODUCT.displayName} />
    </div>
  )
}

export interface InstallFlowProps {
  lang: Lang
}

export function InstallFlow({ lang }: InstallFlowProps): ReactElement {
  const t = copy[lang]
  const [step, setStep] = useState<Step>('welcome')
  const [agreed, setAgreed] = useState(false)
  const [progress, setProgress] = useState(0)

  // Drive the fake install progress once we land on the progress step.
  useEffect(() => {
    if (step !== 'progress') return
    setProgress(0)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setProgress(100)
      const to = window.setTimeout(() => setStep('finish'), 400)
      return () => window.clearTimeout(to)
    }
    const id = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          window.clearInterval(id)
          window.setTimeout(() => setStep('finish'), 450)
          return 100
        }
        return Math.min(100, p + 4)
      })
    }, 90)
    return () => window.clearInterval(id)
  }, [step])

  const stepIndex = Math.min(t.progress.steps.length - 1, Math.floor((progress / 100) * t.progress.steps.length))

  return (
    <div className="setup-window">
      <BrandBar />
      <div className="setup-window__body">
        {step === 'welcome' && (
          <>
            <span className="setup-window__eyebrow">{t.welcome.eyebrow}</span>
            <h1 className="setup-window__title setup-window__title--lg">{t.welcome.title}</h1>
            <p className="setup-window__text">{t.welcome.body}</p>
          </>
        )}

        {step === 'license' && (
          <>
            <h1 className="setup-window__title">{t.license.title}</h1>
            <p className="setup-window__text">{t.license.intro}</p>
            <div className="setup-window__license">{LICENSE_EXCERPT}</div>
            <Checkbox
              checked={agreed}
              onChange={(e) => setAgreed(e.currentTarget.checked)}
              label={t.license.agree}
            />
          </>
        )}

        {step === 'location' && (
          <>
            <h1 className="setup-window__title">{t.location.title}</h1>
            <p className="setup-window__text">{t.location.body}</p>
            <div className="setup-window__path">
              {isMac() ? t.location.defaultHintMac : t.location.defaultHintWin}
            </div>
          </>
        )}

        {step === 'progress' && (
          <>
            <h1 className="setup-window__title">{t.progress.title}</h1>
            <Progress value={progress} max={100} />
            <div className="setup-window__steps">
              {t.progress.steps.map((label, i) => (
                <span key={label} className={i < stepIndex ? 'setup-window__step--done' : undefined}>
                  {label}
                </span>
              ))}
            </div>
          </>
        )}

        {step === 'finish' && (
          <div className="setup-window__center">
            <h1 className="setup-window__title setup-window__title--lg">{t.finish.title}</h1>
            <p className="setup-window__text">{t.finish.body}</p>
          </div>
        )}
      </div>

      {step === 'welcome' && (
        <div className="setup-window__footer">
          <Button variant="primary" onClick={() => setStep('license')}>
            {t.welcome.cta}
          </Button>
        </div>
      )}

      {step === 'license' && (
        <div className="setup-window__footer setup-window__footer--split">
          <Button variant="ghost" onClick={() => setStep('welcome')}>
            {t.license.back}
          </Button>
          <Button variant="primary" disabled={!agreed} onClick={() => setStep('location')}>
            {t.license.next}
          </Button>
        </div>
      )}

      {step === 'location' && (
        <div className="setup-window__footer setup-window__footer--split">
          <Button variant="ghost" onClick={() => setStep('license')}>
            {t.location.back}
          </Button>
          <div style={{ display: 'flex', gap: 10 }}>
            {/* Cosmetic: the real page opens a folder picker; here it is inert. */}
            <Button variant="secondary" disabled>
              {t.location.change}
            </Button>
            <Button variant="primary" onClick={() => setStep('progress')}>
              {t.location.install}
            </Button>
          </div>
        </div>
      )}

      {step === 'finish' && (
        <div className="setup-window__footer setup-window__footer--split">
          <Button variant="ghost" onClick={() => window.close()}>
            {t.finish.close}
          </Button>
          <Button variant="primary" onClick={() => window.close()}>
            {t.finish.runApp}
          </Button>
        </div>
      )}
    </div>
  )
}
