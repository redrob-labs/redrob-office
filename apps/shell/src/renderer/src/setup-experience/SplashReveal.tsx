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
import { useEffect, useReducer, type ReactElement } from 'react'
import logoLight from '../assets/splash/redrob-logo-primary.png'
import logoDark from '../assets/splash/redrob-logo-primary-white.png'
import officeIcon from '../assets/redrob-office-icon.svg'
import officeIconDark from '../assets/redrob-office-icon-dark.svg'
import { PRODUCT } from './setup-copy'

/** The two held frames of the reveal. */
type Phase = 'redrob' | 'office'

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function isDark(): boolean {
  return (
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') &&
      !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  )
}

export interface SplashRevealProps {
  /** Fired when the reveal has settled; the host then shows the flow. */
  onDone: () => void
}

export function SplashReveal({ onDone }: SplashRevealProps): ReactElement {
  // Reduced motion: skip straight to the Office frame (no arrival), present it,
  // then hand off. Otherwise play Frame 1 (Redrob) then cut to Frame 2 (Office).
  const [phase, next] = useReducer(
    (p: Phase): Phase => (p === 'redrob' ? 'office' : 'office'),
    prefersReducedMotion() ? 'office' : 'redrob',
  )

  const dark = isDark()

  useEffect(() => {
    const reduce = prefersReducedMotion()
    const timers: number[] = []
    if (reduce) {
      timers.push(window.setTimeout(onDone, 900))
      return () => timers.forEach(window.clearTimeout)
    }
    timers.push(window.setTimeout(next, 1250)) // Redrob -> Office
    timers.push(window.setTimeout(onDone, 2850)) // hand off to the flow
    return () => timers.forEach(window.clearTimeout)
    // onDone/next are stable; run once on mount.
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
          typed text to its right. */}
      <div className="setup-splash__frame setup-splash__frame--office">
        <img
          className="setup-splash__office-icon"
          src={dark ? officeIconDark : officeIcon}
          alt=""
          draggable={false}
        />
        <span className="setup-splash__office-text">{PRODUCT.displayName}</span>
      </div>
    </div>
  )
}
