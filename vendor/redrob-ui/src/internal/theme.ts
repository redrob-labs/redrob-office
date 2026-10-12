export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_OPTS: Array<{ id: ThemeMode; icon: string; label: string }> = [
  { id: 'system', icon: 'monitor', label: 'System' },
  { id: 'light', icon: 'sun', label: 'Light' },
  { id: 'dark', icon: 'moon', label: 'Dark' },
];

export function systemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/** The element the theme attributes live on. Defaults to `<html>`. */
export function themeTarget(t?: HTMLElement | null): HTMLElement | null {
  if (t) return t;
  return typeof document !== 'undefined' ? document.documentElement : null;
}

/**
 * Writes both attributes: `data-theme-mode` is what the person chose, `data-theme` is what is rendered.
 *
 * Two attributes rather than one, because `system` is a choice and not a colour. Collapsing them would lose
 * the difference between "follow the OS" and "I picked light, which happens to match the OS today".
 */
export function applyTheme(el: HTMLElement | null, mode: ThemeMode): void {
  if (!el) return;
  el.setAttribute('data-theme-mode', mode);
  el.setAttribute('data-theme', mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode);
}
