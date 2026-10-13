/**
 * OfficeMark — the Redrob Office identity used consistently across the setup
 * prototype: the Office product ICON next to "Redrob Office" as plain text.
 *
 * WHY A RASTER ICON: the design-system `redrob-office-icon.svg` paints its
 * symbol through an SVG <mask> + gradient with an internal prefers-color-scheme
 * switch. Loaded via <img src>, that mask renders faint/incorrect at small
 * sizes and does not reliably follow the app's own theme attribute. The
 * 1024×1024 raster (`redrob-office-icon-1024.png`, the flat tile + white
 * symbol) renders crisply and correctly at any size, so the prototype uses it.
 *
 * Used by SplashReveal (frame 2) and by both flows' header brand bar, so the
 * whole experience shows ONE Office identity — never the Redrob group logo,
 * never just "Office".
 */
import type { ReactElement } from 'react'
import officeIcon from '../assets/splash/redrob-office-icon-1024.png'
import { PRODUCT } from './setup-copy'

export interface OfficeMarkProps {
  /** Icon edge length in px. Text scales relative to it. */
  size?: number
  /** Extra class on the root (for layout tweaks per surface). */
  className?: string
}

export function OfficeMark({ size = 28, className }: OfficeMarkProps): ReactElement {
  return (
    <span className={className ? `office-mark ${className}` : 'office-mark'}>
      <img
        className="office-mark__icon"
        src={officeIcon}
        alt=""
        width={size}
        height={size}
        draggable={false}
      />
      <span className="office-mark__text" style={{ fontSize: Math.round(size * 0.52) }}>
        {PRODUCT.displayName}
      </span>
    </span>
  )
}
