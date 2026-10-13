/**
 * SplashReveal — the staged brand reveal for the installer/uninstaller
 * PROTOTYPE.
 *
 * WHAT IT SHOWS — two frames (Felix's spec):
 *   Frame 1: the full official Redrob logo (symbol + "Redrob" wordmark lockup),
 *            animated — a 40° uncover.
 *   Frame 2: the Redrob OFFICE icon (the product mark), animated in, with
 *            "Redrob Office" beside it as PLAIN TYPED TEXT that is NOT animated
 *            — it is simply present. Then the host hands off to the flow.
 *
 * NOTE — DOCUMENTED DEPARTURE from the design system's motion law
 * (10-logo.md / 40-surfaces-and-motion.md): the system says one logo animation
 * per splash, type never animates in, and the lockup never swaps for another
 * mark. This splash deliberately animates the Office mark and swaps the Redrob
 * logo for it, by Felix's explicit direction. The "Redrob Office" text is kept
 * STATIC (not animated) to stay as close to the law as the brief allows. The
 * departure is recorded in PORTING.md so whoever ports it to the real installer
 * knows it bends the rules on purpose.
 *
 * Presentation only — no backend, no persistence.
 */
import { useEffect, useState, type ReactElement } from 'react'
import logoLight from '../assets/splash/redrob-logo-primary.png'
import logoDark from '../assets/splash/redrob-logo-primary-white.png'
import { OfficeMark } from './OfficeMark'
import { isDark, prefersReducedMotion } from './setup-env'

/** The two held frames of the reveal. */
type Phase = 'redrob' | 'office'

export interface SplashRevealProps {
  /** Fired when the reveal has settled; the host then shows the flow. */
  onDone: () => void
}

export function SplashReveal({ onDone }: SplashRevealProps): ReactElement {
  // Reduced motion: start on the Office frame (no arrival), present it, then
  // hand off. Otherwise start on Frame 1 (Redrob) and advance to Frame 2.
  const [phase, setPhase] = useState<Phase>(prefersReducedMotion() ? 'office' : 'redrob')
  const dark = isDark()

  useEffect(() => {
    const timers: number[] = []
    if (prefersReducedMotion()) {
      timers.push(window.setTimeout(onDone, 900))
      return () => timers.forEach(window.clearTimeout)
    }
    timers.push(window.setTimeout(() => setPhase('office'), 1250)) // Redrob -> Office
    timers.push(window.setTimeout(onDone, 2850)) // hand off to the flow
    return () => timers.forEach(window.clearTimeout)
    // onDone is stable; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="setup-splash" data-phase={phase} aria-hidden="true">
      {/* Frame 1: the full official Redrob logo, uncovered along the 40° edge. */}
      <div className="setup-splash__frame setup-splash__frame--redrob">
        <img
          className="setup-splash__logo"
          src={dark ? logoDark : logoLight}
          alt=""
          draggable={false}
        />
      </div>

      {/* Frame 2: the Office icon (animated) + "Redrob Office" as plain, static
          typed text to its right — the shared OfficeMark, so this matches the
          header brand bar exactly. */}
      <div className="setup-splash__frame setup-splash__frame--office">
        <OfficeMark size={64} className="setup-splash__office" />
      </div>
    </div>
  )
}
