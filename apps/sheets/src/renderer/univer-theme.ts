import { defaultTheme } from '@univerjs/themes'

/** Univer's primary scale step → the Redrob blue it takes. */
const PRIMARY_FROM_KIT: Record<string, string> = {
  '50': '--blue-1',
  '100': '--blue-2',
  '200': '--blue-3',
  '300': '--blue-4',
  '400': '--blue-4',
  '500': '--blue-5',
  '600': '--blue-6',
  '700': '--blue-7',
  '800': '--blue-8',
  '900': '--blue-9',
}

/**
 * Univer's theme with its primary scale (selection frames, the active sheet
 * tab, focus outlines inside the grid) taken from the design system's blue.
 *
 * Univer paints its canvas from literal colours, so the kit tokens are read
 * once from the document; the kit stylesheet is loaded before the workbook
 * mounts. A token that is missing keeps Univer's own value.
 */
export function redrobUniverTheme(root: Element = document.documentElement): typeof defaultTheme {
  const style = getComputedStyle(root)
  const primary: Record<string, string> = { ...defaultTheme.primary }
  for (const [step, token] of Object.entries(PRIMARY_FROM_KIT)) {
    const value = style.getPropertyValue(token).trim()
    if (value) primary[step] = value
  }
  return { ...defaultTheme, primary: primary as typeof defaultTheme.primary }
}
