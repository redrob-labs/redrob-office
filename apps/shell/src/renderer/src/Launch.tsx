/**
 * Launch.tsx — the app launch splash.
 *
 * A brief brand reveal shown once per app session, above the shell, before any
 * editor tab exists. Two frames: the Redrob GROUP mark eases in, then it yields
 * to the Redrob OFFICE mark with the "Redrob Office" wordmark below it. The
 * timeline lives entirely here (SWAP_MS -> office frame, TOTAL_MS -> onDone);
 * it is deliberately NOT skippable (no click/key handler) and respects
 * prefers-reduced-motion by cross-fading with no movement.
 *
 * The once-per-session decision is the main process's (takeLaunch); AppFrame
 * only mounts this while `showLaunch && homeActive`, and calls back via onDone
 * when the splash hands off. The brand assets are the 2026 masked web icons,
 * light/dark aware.
 */
import { useEffect, useState, type ReactElement } from 'react'
import groupLogo from './assets/redrob-group-web.svg'
import groupLogoDark from './assets/redrob-group-web-dark.svg'
import officeLogo from './assets/redrob-office-web.svg'
import officeLogoDark from './assets/redrob-office-web-dark.svg'
import './launch.css'

/** Total splash budget (1.5s), then hand off. Not skippable by click/key. */
const TOTAL_MS = 1500
/** when the Group frame yields to the Office frame */
const SWAP_MS = 750

export interface LaunchProps {
  onDone: () => void
  /** for tests; otherwise read from the system */
  reducedMotion?: boolean
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function isDark(): boolean {
  try {
    return (
      document.documentElement.getAttribute('data-theme') === 'dark' ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    )
  } catch {
    return false
  }
}

/**
 * The launch screen, once a session: a subtle two-frame brand reveal —
 * Frame 1 the Redrob GROUP logo eases in, then Frame 2 the Redrob OFFICE logo
 * eases in with "Redrob Office" beside it. Tasteful and brief (1.5s), and NOT
 * skippable. Under reduced motion the frames simply cross-fade with no motion.
 */
export function Launch({ onDone, reducedMotion }: LaunchProps): ReactElement {
  const still = reducedMotion ?? prefersReducedMotion()
  const dark = isDark()
  const [phase, setPhase] = useState<'group' | 'office'>('group')

  useEffect(() => {
    const timers: number[] = []
    timers.push(window.setTimeout(() => setPhase('office'), SWAP_MS))
    timers.push(window.setTimeout(onDone, TOTAL_MS))
    return () => timers.forEach(window.clearTimeout)
    // onDone is stable; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`launch${still ? ' launch--still' : ''}`}
      data-phase={phase}
      data-testid="launch"
      aria-hidden="true"
    >
      {/* Frame 1: the Redrob group mark */}
      <div className="launch__frame launch__frame--group">
        <img className="launch__mark" src={dark ? groupLogoDark : groupLogo} alt="" draggable={false} />
      </div>
      {/* Frame 2: the Office mark + "Redrob Office" wordmark */}
      <div className="launch__frame launch__frame--office">
        <img className="launch__mark" src={dark ? officeLogoDark : officeLogo} alt="" draggable={false} />
        <span className="launch__word">Redrob Office</span>
      </div>
    </div>
  )
}
