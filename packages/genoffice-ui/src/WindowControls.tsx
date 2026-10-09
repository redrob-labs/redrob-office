import type { ReactElement } from 'react'
import { IconButton, icons } from '@redrob-labs/ui'

export interface WindowControlsStrings {
  minimize: string
  maximize: string
  restore: string
  close: string
}

export interface WindowControlsProps {
  /** Shows Restore instead of Maximise. */
  maximized: boolean
  strings: WindowControlsStrings
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}

const glyph = (draw: (typeof icons)[keyof typeof icons]): ReactElement =>
  draw({ width: 16, height: 16, 'aria-hidden': true })

/**
 * Minimise, maximise or restore, and close, for a frameless window: the
 * design system's IconButton and glyphs in a row, sized for the 40px tab
 * strip. For Linux, where Electron has no caption-button overlay. On Windows
 * use the OS's own buttons through `titleBarOverlay` instead, which keeps
 * Snap Layouts.
 */
export function WindowControls(props: WindowControlsProps): ReactElement {
  const { strings } = props
  return (
    <div className="go-window-controls">
      <IconButton label={strings.minimize} size="sm" onClick={props.onMinimize}>
        {glyph(icons.minimize)}
      </IconButton>
      <IconButton
        label={props.maximized ? strings.restore : strings.maximize}
        size="sm"
        onClick={props.onToggleMaximize}
      >
        {glyph(props.maximized ? icons.restore : icons.maximize)}
      </IconButton>
      <IconButton label={strings.close} size="sm" className="go-window-controls__close" onClick={props.onClose}>
        {glyph(icons.close)}
      </IconButton>
    </div>
  )
}
