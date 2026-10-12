import { useEffect, type ReactElement, type ReactNode } from 'react'
import { Modal } from '@redrob-labs/ui'

export interface DialogProps {
  /** `false` renders nothing. Defaults to open, so a dialog can be mounted conditionally. */
  open?: boolean
  title: ReactNode
  /** Accessible name of the close button. Required: the kit's default is English. */
  closeLabel: string
  onClose: () => void
  /** The actions, right-aligned in the footer. */
  footer?: ReactNode
  /** Max width of the panel. */
  width?: number | string
  className?: string
  children?: ReactNode
}

/**
 * An Office dialog: the kit's Modal, made to work inside an Electron window.
 *
 * The kit leaves three things to the application, and every Office dialog
 * needs them, so they live here once:
 *   - the scrim is fixed to the viewport (the kit's is `position: absolute`,
 *     relative to whatever positioned ancestor the app has);
 *   - Escape closes it (the kit only closes on a scrim click);
 *   - the close button's label comes from the caller's i18n, never the kit's
 *     English default.
 */
export function Dialog({
  open = true,
  title,
  closeLabel,
  onClose,
  footer,
  width,
  className,
  children,
}: DialogProps): ReactElement | null {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // optional props are passed only when set: consumers compile with
  // exactOptionalPropertyTypes, under which an explicit undefined is not "absent"
  return (
    <Modal
      open={open}
      title={title}
      closeLabel={closeLabel}
      onClose={onClose}
      {...(footer !== undefined ? { footer } : {})}
      {...(width !== undefined ? { width } : {})}
      className={className ? `go-dialog ${className}` : 'go-dialog'}
    >
      {children}
    </Modal>
  )
}
