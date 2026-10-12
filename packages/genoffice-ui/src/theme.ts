/**
 * The one way a renderer applies the UI theme.
 *
 * The shell persists the person's choice ('light' | 'dark' | 'system'), sets
 * nativeTheme.themeSource to it and broadcasts every change to all webContents.
 * Each renderer passes what it receives here.
 *
 * The kit's applyTheme writes two attributes on <html>: data-theme-mode is the
 * choice, data-theme is what renders. Unlike the GenOffice code this replaces,
 * 'system' still writes a concrete data-theme, because the kit's tokens only
 * switch on [data-theme="dark"] and have no prefers-color-scheme fallback. While
 * the mode is 'system', an OS appearance change re-applies it.
 */
import { applyTheme, type ThemeMode } from '@redrob-labs/ui'

export type UiThemeMode = ThemeMode

const SYSTEM_DARK = '(prefers-color-scheme: dark)'

let detachSystemListener: (() => void) | null = null

export function applyUiTheme(
  mode: UiThemeMode,
  el: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement,
): void {
  if (!el) return
  detachSystemListener?.()
  detachSystemListener = null
  applyTheme(el, mode)
  if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) return
  const query = window.matchMedia(SYSTEM_DARK)
  const follow = (): void => applyTheme(el, 'system')
  query.addEventListener('change', follow)
  detachSystemListener = () => query.removeEventListener('change', follow)
}
