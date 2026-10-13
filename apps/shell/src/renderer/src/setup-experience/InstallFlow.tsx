/**
 * InstallFlow — branded Windows-installer PROTOTYPE (NSIS assisted installer).
 *
 * Mirrors the page sequence the real NSIS installer shows, driven by
 * electron-builder.cjs (nsis.oneClick=false, allowToChangeInstallationDirectory=true):
 *   Welcome -> License -> Choose Location -> Installing -> Finish.
 *
 * This is a DESIGN PROTOTYPE: every "action" is local state only. "Install"
 * fills a cosmetic progress bar (useFakeProgress); "Launch" / "Finish" just
 * close the window. No files are written, no process is spawned, nothing
 * backend is touched.
 *
 * Chrome (card, Office brand bar, body, footer) comes from <SetupWindow>; the
 * copy and step list come from setup-copy.ts, keyed to the real NSIS fields so
 * this ports onto the installer later (see PORTING.md).
 */
import { useState, type ReactElement } from 'react'
import { Button, Checkbox, Progress } from '@genoffice/ui'
import { LICENSE_EXCERPT } from './license-excerpt'
import { SetupWindow } from './SetupWindow'
import { useFakeProgress } from './useFakeProgress'
import { copy, type Lang } from './setup-copy'

type Step = 'welcome' | 'license' | 'location' | 'progress' | 'finish'

/** True on macOS so the location hint shows the right default path. */
function isMac(): boolean {
  try {
    return navigator.platform.toLowerCase().includes('mac')
  } catch {
    return false
  }
}

export interface InstallFlowProps {
  lang: Lang
}

export function InstallFlow({ lang }: InstallFlowProps): ReactElement {
  const t = copy[lang]
  const [step, setStep] = useState<Step>('welcome')
  const [agreed, setAgreed] = useState(false)
  // Cosmetic install bar; fills on the "progress" step, then advances to finish.
  const progress = useFakeProgress(step === 'progress', {
    step: 4,
    intervalMs: 90,
    onDone: () => setStep('finish'),
  })

  const stepIndex = Math.min(t.progress.steps.length - 1, Math.floor((progress / 100) * t.progress.steps.length))

  const footer: ReactElement | null =
    step === 'welcome' ? (
      <div className="setup-window__footer">
        <Button variant="primary" onClick={() => setStep('license')}>
          {t.welcome.cta}
        </Button>
      </div>
    ) : step === 'license' ? (
      <div className="setup-window__footer setup-window__footer--split">
        <Button variant="ghost" onClick={() => setStep('welcome')}>
          {t.license.back}
        </Button>
        <Button variant="primary" disabled={!agreed} onClick={() => setStep('location')}>
          {t.license.next}
        </Button>
      </div>
    ) : step === 'location' ? (
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
    ) : step === 'finish' ? (
      <div className="setup-window__footer setup-window__footer--split">
        <Button variant="ghost" onClick={() => window.close()}>
          {t.finish.close}
        </Button>
        <Button variant="primary" onClick={() => window.close()}>
          {t.finish.runApp}
        </Button>
      </div>
    ) : null // progress step has no footer

  return (
    <SetupWindow footer={footer}>
      {step === 'welcome' && (
        <>
          <span className="setup-window__eyebrow">{t.welcome.eyebrow}</span>
          <h1 className="setup-window__title setup-window__title--lg">{t.welcome.title}</h1>
          <p className="setup-window__text">{t.welcome.body}</p>
          <ul className="setup-window__features">
            {t.welcome.features.map((f) => (
              <li key={f.title} className="setup-window__feature">
                <span className="setup-window__feature-title">{f.title}</span>
                <span className="setup-window__feature-body">{f.body}</span>
              </li>
            ))}
          </ul>
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
          {/* One line that changes in place as the bar advances. */}
          <p className="setup-window__line" key={stepIndex}>
            {t.progress.steps[stepIndex]}
          </p>
        </>
      )}

      {step === 'finish' && (
        <div className="setup-window__center">
          <h1 className="setup-window__title setup-window__title--lg">{t.finish.title}</h1>
          <p className="setup-window__text">{t.finish.body}</p>
        </div>
      )}
    </SetupWindow>
  )
}
