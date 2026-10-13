/**
 * setup-env.ts — tiny environment helpers shared across the setup prototype.
 *
 * These were duplicated inline in SplashReveal / InstallFlow / UninstallFlow;
 * centralising them keeps the reduced-motion and theme reads identical
 * everywhere and in one place. Pure reads of the DOM / matchMedia, no state.
 */

/** True when the user has asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * True when the app is in dark mode: the explicit `data-theme="dark"` attribute
 * wins; absent that, fall back to the OS `prefers-color-scheme`.
 */
export function isDark(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr) return attr === 'dark'
  try {
    return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}
