import { useState, type ReactElement, type ReactNode } from 'react'
import type { VersionsApi } from '@genoffice/versions'
import { VersionHistory } from './VersionHistory'
import { verT } from './strings'

export interface VersionsButtonProps {
  /** the document's path; null before its first save */
  path: string | null
  fileName: string
  api: Partial<VersionsApi> | undefined
  /** the editor's own save status, shown as the button's label */
  children: ReactNode
}

/**
 * The save status, made into the way into version history: every editor puts its
 * status in this, so every editor has the same history (kept on this computer, newest
 * first, Restore opens a copy beside the file).
 */
export function VersionsButton({ path, fileName, api, children }: VersionsButtonProps): ReactElement {
  const [open, setOpen] = useState(false)
  if (!api?.listVersions) return <>{children}</>
  return (
    <>
      <button
        type="button"
        className="go-versions-btn"
        data-tip={verT('verOpen')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <VersionHistory open={open} onClose={() => setOpen(false)} path={path} fileName={fileName} api={api} />
    </>
  )
}
