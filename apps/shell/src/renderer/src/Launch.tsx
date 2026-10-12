import { useEffect, useRef, type ReactElement } from 'react'
import { showRedrobSplash } from './assets/splash/redrob-splash.js'
import logoLight from './assets/splash/redrob-logo-primary.png'
import logoDark from './assets/splash/redrob-logo-primary-white.png'
import './assets/splash/redrob-splash.css'
import './launch.css'

/**
 * The longest the screen may stay, whatever the splash is doing. The splash's own
 * timeline is about 3.8 s with motion (lockup, hand-over, product) and 1.6 s still.
 */
const MAX_MS = 5000
const STILL_MAX_MS = 2400

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

/**
 * The launch screen, once a session (Redrob Design System 2026): the Redrob
 * lockup (Primary on light, Primary White on dark), then the Office icon with
 * "Redrob Office" in Pretendard SemiBold. It hands over on its own, and any key
 * or click skips it. Under reduced motion nothing moves.
 */
export function Launch({ onDone, reducedMotion }: LaunchProps): ReactElement {
  const still = reducedMotion ?? prefersReducedMotion()
  const host = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  const finish = useRef(() => {})
  finish.current = () => {
    if (done.current) return
    done.current = true
    onDone()
  }

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    let live = true
    // The shell already decides once-per-session (main/launch.ts), so the splash's own
    // sessionStorage gate is off. Office is painted underneath, so it is ready now.
    void showRedrobSplash({ logoLight, logoDark, parent, once: false, reducedMotion: still, ready: Promise.resolve() })
      .catch(() => {})
      .then(() => {
        if (live) finish.current()
      })
    const cap = window.setTimeout(() => finish.current(), still ? STILL_MAX_MS : MAX_MS)
    const skip = () => finish.current()
    window.addEventListener('keydown', skip)
    return () => {
      live = false
      window.clearTimeout(cap)
      window.removeEventListener('keydown', skip)
      parent.replaceChildren()
    }
  }, [still])

  return (
    <div
      ref={host}
      className={`launch${still ? ' launch--still' : ''}`}
      data-testid="launch"
      onClick={() => finish.current()}
    />
  )
}
