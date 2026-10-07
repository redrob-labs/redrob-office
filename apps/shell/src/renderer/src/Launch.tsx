import { useEffect, useRef, type ReactElement } from 'react'
import { MarkReveal } from '@genoffice/ui'
import logoLockup from './assets/redrob-logo.svg'
import { useI18n } from './locale'
import './launch.css'

/** how long the line holds after the mark lands, and the longest the screen may stay */
const HOLD_MS = 700
const MAX_MS = 2600
/** with reduced motion the mark does not move: a short, still hold instead */
const STILL_MS = 900

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
 * The launch screen, once a session: the lockup arriving on the Office ground
 * and the one spoken line. It hands over on its own, and any key or click
 * skips it. Under reduced motion the mark is shown still.
 */
export function Launch({ onDone, reducedMotion }: LaunchProps): ReactElement {
  const { t } = useI18n()
  const still = reducedMotion ?? prefersReducedMotion()
  const done = useRef(false)
  const finish = useRef(() => {})
  finish.current = () => {
    if (done.current) return
    done.current = true
    onDone()
  }

  useEffect(() => {
    const cap = window.setTimeout(() => finish.current(), still ? STILL_MS : MAX_MS)
    const skip = () => finish.current()
    window.addEventListener('keydown', skip)
    return () => {
      window.clearTimeout(cap)
      window.removeEventListener('keydown', skip)
    }
  }, [still])

  return (
    <div
      className={`launch${still ? ' launch--still' : ''}`}
      role="status"
      aria-live="polite"
      data-testid="launch"
      onClick={() => finish.current()}
    >
      {still ? (
        <img className="launch__mark" src={logoLockup} alt="Redrob Office" />
      ) : (
        <MarkReveal
          className="launch__mark"
          src={logoLockup}
          alt="Redrob Office"
          size="lg"
          tone="light"
          ground={false}
          onDone={() => window.setTimeout(() => finish.current(), HOLD_MS)}
        />
      )}
      <p className="launch__line">{t('launchLine')}</p>
    </div>
  )
}
