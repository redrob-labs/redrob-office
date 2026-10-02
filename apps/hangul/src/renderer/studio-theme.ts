/**
 * Theme the embedded rhwp-studio with the Redrob design system.
 *
 * rhwp-studio draws its chrome from its own custom properties (--ui-*,
 * --accent-*, --ruler-*). The studio frame is served from the same loopback
 * origin as this renderer (studio-serve.ts), so its document is reachable:
 * this writes one style element into it that sets those properties to the
 * kit token values resolved in this document. No colour is copied by hand,
 * and the studio follows the app theme because the values are re-resolved
 * whenever this document's data-theme changes.
 *
 * The page itself is the user's document; only studio chrome is mapped.
 */

/** rhwp-studio property → the kit token whose resolved value it takes. */
export const STUDIO_TOKEN_MAP: Readonly<Record<string, string>> = {
  '--ui-bg': '--surface-raised',
  '--ui-bg-light': '--surface-raised',
  '--ui-surface': '--surface-base',
  '--ui-surface-raised': '--surface-raised',
  '--ui-surface-muted': '--surface-sunken',
  '--ui-border': '--border-subtle',
  '--ui-border-light': '--border-subtle',
  '--ui-border-subtle': '--border-subtle',
  '--ui-border-strong': '--border-strong',
  '--ui-text': '--ink-primary',
  '--ui-text-secondary': '--ink-secondary',
  '--ui-text-muted': '--ink-secondary',
  '--ui-text-hint': '--ink-muted',
  '--ui-text-disabled': '--ink-muted',
  '--ui-text-placeholder': '--ink-muted',
  '--ui-text-on-accent': '--ink-on-brand',
  '--ui-hover': '--surface-sunken',
  '--ui-hover-strong': '--surface-sunken',
  '--ui-active': '--surface-brand-subtle',
  '--ui-selected': '--surface-brand-subtle',
  '--ui-menu-open': '--action-primary',
  '--ui-menu-open-border': '--action-primary',
  '--ui-toolbar-bg-start': '--surface-base',
  '--ui-toolbar-bg-end': '--surface-base',
  '--ui-accent-bg': '--surface-brand-subtle',
  '--ui-accent-bg-light': '--surface-brand-subtle',
  '--ui-link': '--ink-brand',
  '--ui-danger': '--status-danger',
  '--ui-danger-strong': '--status-danger',
  '--focus-ring': '--focus-ring',
  '--accent-primary': '--action-primary',
  '--accent-strong': '--action-primary-hover',
  '--accent-light': '--ink-brand',
  '--resize-handle': '--action-primary',
  '--doc-workspace': '--surface-sunken',
  '--ruler-bg': '--surface-raised',
  '--ruler-marker': '--action-primary',
  '--radius-sm': '--radius-sm',
  '--radius-md': '--radius-md',
  '--radius-lg': '--radius-lg',
  '--shadow-light': '--shadow-sm',
  '--shadow-dropdown': '--shadow-md',
  '--shadow-dialog': '--shadow-lg',
  '--font-family-ui': '--font-sans',
}

const STYLE_ID = 'redrob-studio-theme'

/** The declaration block for the current theme, from the host document. */
export function studioThemeCss(host: Element): string {
  const style = getComputedStyle(host)
  const decls = Object.entries(STUDIO_TOKEN_MAP)
    .map(([prop, token]) => [prop, style.getPropertyValue(token).trim()] as const)
    .filter(([, value]) => value !== '')
    .map(([prop, value]) => `  ${prop}: ${value};`)
    .join('\n')
  // :root:root outranks every skin / dark-mode block the studio ships
  return `:root:root,\n:root:root[data-theme-effective],\n:root:root[data-theme-skin] {\n${decls}\n}\n`
}

/** Write (or refresh) the theme into a same-origin studio document. */
export function applyStudioTheme(studio: Document, host: Element): void {
  let el = studio.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = studio.createElement('style')
    el.id = STYLE_ID
    studio.head.appendChild(el)
  }
  el.textContent = studioThemeCss(host)
  // the studio's icons and canvas chrome switch with its own effective theme
  const theme = host.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  studio.documentElement.dataset.themeEffective = theme
  studio.documentElement.style.colorScheme = theme
}

/**
 * Keep the studio frame inside `container` on the kit theme: on every load of
 * the frame and on every app theme change. Returns a disposer.
 */
export function syncStudioTheme(
  container: HTMLElement,
  host: Element = document.documentElement,
): () => void {
  const apply = (): void => {
    const frame = container.querySelector('iframe')
    try {
      const doc = frame?.contentDocument
      if (doc?.head) applyStudioTheme(doc, host)
    } catch {
      // cross-origin (dev server on another port): leave the studio's own theme
    }
  }
  const onLoad = (e: Event): void => {
    if (e.target instanceof HTMLIFrameElement) apply()
  }
  container.addEventListener('load', onLoad, true)
  const themeObserver = new MutationObserver(apply)
  themeObserver.observe(host, { attributes: true, attributeFilter: ['data-theme'] })
  apply()
  return () => {
    container.removeEventListener('load', onLoad, true)
    themeObserver.disconnect()
  }
}
