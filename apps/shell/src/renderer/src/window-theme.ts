/**
 * Theme for the shell's small standalone windows (update, PDF password).
 *
 * These pages are plain DOM with no IPC theme channel of their own. They do
 * not need one: the main process sets nativeTheme.themeSource to the person's
 * choice, so the page's prefers-color-scheme already reports it ('system'
 * included). This writes that to <html data-theme>, which the design system's
 * tokens switch on, and follows it while the window is open.
 */
import '@genoffice/ui/theme.css'

export function followWindowTheme(): void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    document.documentElement.dataset.theme = query.matches ? 'dark' : 'light'
  }
  apply()
  query.addEventListener('change', apply)
}
