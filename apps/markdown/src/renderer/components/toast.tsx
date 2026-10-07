/** Transient feedback for user-triggered actions: the kit Toast, fixed at top
 * centre, auto-dismissed. The kit renders one toast and leaves timing to the
 * app, so the timers live here. The status bar stays the durable log.
 * Trigger via showToast from './toast-bus' (kept component-only here so React
 * Fast Refresh works in dev). */
import { useEffect, useState } from 'react'
import { Toast } from '@genoffice/ui'
import { setToastEmitter, type ToastData } from './toast-bus'

export function ToastHost() {
  const [toast, setToast] = useState<ToastData | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let hideTimer: number | undefined
    let clearTimer: number | undefined
    let raf = 0
    setToastEmitter((next) => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(clearTimer)
      window.cancelAnimationFrame(raf)
      setToast(next)
      // Mount hidden first: CSS transitions don't run on initial mount, so
      // the show class lands a frame later for the fade/slide-in to play.
      setVisible(false)
      raf = window.requestAnimationFrame(() => {
        raf = window.requestAnimationFrame(() => setVisible(true))
      })
      const shownMs = next.kind === 'error' ? 4000 : 2000
      hideTimer = window.setTimeout(() => setVisible(false), shownMs)
      // keep the node mounted through the fade-out transition
      clearTimer = window.setTimeout(() => setToast(null), shownMs + 200)
    })
    return () => {
      setToastEmitter(null)
      window.clearTimeout(hideTimer)
      window.clearTimeout(clearTimer)
      window.cancelAnimationFrame(raf)
    }
  }, [])
  if (!toast) return null
  return (
    // The wrapper only positions and animates; the kit Toast carries role="status".
    <div className={`app-toast${visible ? ' show' : ''}`}>
      <Toast tone={toast.kind === 'success' ? 'success' : 'danger'} title={toast.text} />
    </div>
  )
}
