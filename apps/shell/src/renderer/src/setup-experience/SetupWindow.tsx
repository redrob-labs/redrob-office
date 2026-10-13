/**
 * SetupWindow — the shared chrome for the installer/uninstaller PROTOTYPE: the
 * card "window", the header brand bar (the Office mark), a scrolling body, and
 * a pinned footer action row.
 *
 * Both flows rendered this scaffold by hand, including an identical BrandBar;
 * owning it here guarantees the install and uninstall windows stay visually
 * identical and removes the duplication. Purely structural — the step content
 * and the footer buttons are passed in by each flow.
 */
import type { ReactElement, ReactNode } from 'react'
import { OfficeMark } from './OfficeMark'

/** The header brand bar: the Office icon + "Redrob Office" text. Never the
 *  Redrob group logo, never just "Office". Shared by the splash frame 2 too. */
function BrandBar(): ReactElement {
  return (
    <div className="setup-window__brand">
      <OfficeMark size={30} />
    </div>
  )
}

export interface SetupWindowProps {
  /** The step body (headings, text, controls). */
  children: ReactNode
  /** The footer action row for the current step. */
  footer: ReactNode
}

export function SetupWindow({ children, footer }: SetupWindowProps): ReactElement {
  return (
    <div className="setup-window">
      <BrandBar />
      <div className="setup-window__body">{children}</div>
      {footer}
    </div>
  )
}
