import type { CSSProperties, ReactElement } from 'react'
import { icons, type IconName } from '@redrob-labs/ui'

export interface GlyphProps {
  /** A Redrob icon name (see the kit's iconNames). */
  name: IconName
  /** Square size in px. */
  size?: number
  className?: string
  style?: CSSProperties
}

/**
 * One of the Redrob design system's icons at a fixed pixel size.
 *
 * The kit's glyphs size themselves to `1em`; Office chrome is laid out in
 * pixels, so this pins width and height. Always decorative (aria-hidden): the
 * control that holds it carries the accessible name.
 */
export function Icon({ name, size = 16, className, style }: GlyphProps): ReactElement {
  return icons[name]({ width: size, height: size, className, style })
}
