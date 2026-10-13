/**
 * SetupExperience — the opt-in host for the installer/uninstaller PROTOTYPE.
 *
 * This is a DESIGN PROTOTYPE, not the real installer. The real installer is the
 * NSIS/DMG config in office-src/apps/shell/electron-builder.cjs and is NOT part
 * of this UI-only branch. See PORTING.md for how this maps across.
 *
 * Activation is OPT-IN and side-effect-free for the normal app: it only renders
 * when the renderer URL carries `?screen=setup` or `?screen=uninstall`. With no
 * such param, `pickSetupScreen()` returns null and main.tsx boots Home exactly
 * as before — nothing about the shipped experience changes.
 */
import { useState, type ReactElement } from 'react'
import { InstallFlow } from './InstallFlow'
import { UninstallFlow } from './UninstallFlow'
import { SplashReveal } from './SplashReveal'
import type { Lang } from './setup-copy'
import './setup-experience.css'

export type SetupScreen = 'setup' | 'uninstall'

/**
 * Read the opt-in query param. Returns the screen to show, or null when the app
 * should boot normally. Kept pure so main.tsx can branch before first paint.
 */
export function pickSetupScreen(search: string = window.location.search): SetupScreen | null {
  try {
    const screen = new URLSearchParams(search).get('screen')
    return screen === 'setup' || screen === 'uninstall' ? screen : null
  } catch {
    return null
  }
}

export interface SetupExperienceProps {
  screen: SetupScreen
  lang: Lang
}

export function SetupExperience({ screen, lang }: SetupExperienceProps): ReactElement {
  // The Splash A staged reveal plays once, then hands off to the flow. Allow
  // skipping it with ?nosplash for quick copy review of a specific step.
  const skipSplash = (() => {
    try {
      return new URLSearchParams(window.location.search).get('nosplash') != null
    } catch {
      return false
    }
  })()
  const [revealed, setRevealed] = useState(skipSplash)

  return (
    <div className="setup-root" data-testid="setup-experience" data-screen={screen}>
      {!revealed && <SplashReveal onDone={() => setRevealed(true)} />}
      {revealed && (screen === 'setup' ? <InstallFlow lang={lang} /> : <UninstallFlow lang={lang} />)}
    </div>
  )
}
