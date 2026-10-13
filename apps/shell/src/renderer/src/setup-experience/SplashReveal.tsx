/**
 * SplashReveal — the Splash A staged brand reveal for the installer/uninstaller
 * PROTOTYPE.
 *
 * WHAT IT SHOWS (three held frames, not a cartoon):
 *   1. the Redrob GROUP symbol, modest size, arriving once by a 40° uncover
 *   2. a clean cut to the Redrob OFFICE product lockup (symbol + the
 *      "Redrob Office" wordmark, already composed in the lockup artwork)
 *   3. the lockup rests — and `onDone` fires so the host can show the flow
 *
 * WHY IT LOOKS LIKE THIS (brand law, not taste — 10-logo.md / 40-surfaces-and
 * -motion.md):
 *   - The group mark animates ONLY by "uncovered along a 40° edge", at most
 *     once per session. We do exactly that and nothing else.
 *   - "Type never animates in" and "a second mark never animates beside the
 *     group mark" — so the Office wordmark does NOT slide in letter-by-letter;
 *     it arrives already composed inside the product lockup, as one held frame.
 *   - "The artwork is never altered or faded; the final frame is the logo file,
 *     pixel for pixel." We cross with a clip-path wipe, never an opacity fade of
 *     the mark itself.
 *   - Reduced motion: "no arrival, the lockup is present." We skip straight to
 *     frame 3.
 *
 * This is presentation only — no backend, no persistence. The host decides when
 * to mount it (the prototype shows it once before the flow).
 */
import { useEffect, useReducer, type ReactElement } from 'react'
import symbolLight from '../assets/splash/redrob-symbol-solid.png'
import symbolDark from '../assets/splash/redrob-symbol-mono-white.png'
import lockupLight from '../assets/splash/redrob-office-lockup.png'
import lockupDark from '../assets/splash/redrob-office-lockup-white.png'
import { PRODUCT } from './setup-copy'

/** The three held frames of the reveal. */
type Phase = 'symbol' | 'lockup' | 'done'

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
  const [phase, next] = useReducer((p: Phase): Phase => {
    if (p === 'symbol') return 'lockup'
    if (p === 'lockup') return 'done'
    return 'done'
  }, prefersReducedMotion() ? 'lockup' : 'symbol')

  const dark = isDark()

  useEffect(() => {
    const reduce = prefersReducedMotion()
    const timers: number[] = []
    if (reduce) {
      // No arrival. The lockup is present, then we hand off promptly.
      timers.push(window.setTimeout(onDone, 900))
      return () => timers.forEach(window.clearTimeout)
    }
    // Frame 1 (symbol uncover) holds, then cut to the lockup, then settle+done.
    // MarkReveal arrival is ~1.4s; keep the whole splash to ~2.8s.
    timers.push(window.setTimeout(next, 1250)) // symbol -> lockup
    timers.push(window.setTimeout(next, 2550)) // lockup -> done
    timers.push(window.setTimeout(onDone, 2850)) // hand off to the flow
    return () => timers.forEach(window.clearTimeout)
    // onDone/next are stable; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="setup-splash" data-phase={phase} aria-hidden="true">
      {/* Frame 1: the group symbol, modest, uncovered along the 40° edge. */}
      <div className="setup-splash__frame setup-splash__frame--symbol">
        <img
          className="setup-splash__symbol"
          src={dark ? symbolDark : symbolLight}
          alt=""
          draggable={false}
        />
      </div>
      {/* Frame 2/3: the composed Redrob Office product lockup, held. */}
      <div className="setup-splash__frame setup-splash__frame--lockup">
        <img
          className="setup-splash__lockup"
          src={dark ? lockupDark : lockupLight}
          alt={PRODUCT.displayName}
          draggable={false}
        />
      </div>
    </div>
  )
}
