/**
 * useFakeProgress — drives the cosmetic 0→100 progress bar shown on the install
 * "Installing" step and the uninstall "Removing" step.
 *
 * This is PROTOTYPE flavour only: there is no real work behind it. The two
 * flows had an identical effect inline, differing only in tick cadence and the
 * step they advance to; this hook is that effect, once.
 *
 * Behaviour (unchanged from the inline versions):
 *  - resets to 0 whenever `active` becomes true;
 *  - under reduced motion, jumps to 100 and calls `onDone` after a short beat;
 *  - otherwise advances by `step`% every `intervalMs`, then `onDone` ~450ms
 *    after reaching 100 so the full bar is seen;
 *  - cleans up its timers on unmount or when `active` goes false.
 */
import { useEffect, useState } from 'react'
import { prefersReducedMotion } from './setup-env'

export interface FakeProgressOptions {
  /** Percent added each tick (install used 4, uninstall used 5). */
  step?: number
  /** Milliseconds between ticks (install used 90, uninstall used 80). */
  intervalMs?: number
  /** Called once the bar has filled (and been shown briefly). */
  onDone: () => void
}

export function useFakeProgress(active: boolean, { step = 4, intervalMs = 90, onDone }: FakeProgressOptions): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!active) return
    setProgress(0)

    if (prefersReducedMotion()) {
      setProgress(100)
      const to = window.setTimeout(onDone, 400)
      return () => window.clearTimeout(to)
    }

    const id = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          window.clearInterval(id)
          window.setTimeout(onDone, 450)
          return 100
        }
        return Math.min(100, p + step)
      })
    }, intervalMs)
    return () => window.clearInterval(id)
    // onDone is stable per step; re-run only when activation flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return progress
}
