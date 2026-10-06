import { useEffect, useState, type ReactElement } from 'react'
import type { ShareApi } from '@genoffice/sync-client'
import { Button } from '../kit'
import { SHARE_STRINGS, ShareDialog } from './ShareDialog'

export interface ShareButtonProps {
  /** the document on disk; null before its first save */
  path: string | null
  fileName: string
  /** the editor's preload, when it spreads shareBridge */
  api: Partial<ShareApi> | undefined
  /** e.g. PDF and Hangul: shared as a file, without live editing */
  note?: string | undefined
}

const isShareApi = (api: Partial<ShareApi> | undefined): api is ShareApi =>
  !!api && typeof api.shareStatus === 'function' && typeof api.shareInvite === 'function'

/**
 * Share for any editor. Hidden when this build has no sync service (a packaged build
 * before one is deployed), instead of a button that can only say so.
 */
export function ShareButton({ path, fileName, api, note }: ShareButtonProps): ReactElement | null {
  const [open, setOpen] = useState(false)
  const [noService, setNoService] = useState(false)
  const shareApi = isShareApi(api) ? api : undefined
  useEffect(() => {
    let alive = true
    if (!shareApi) return
    void shareApi.shareStatus(path ?? '').then((s) => {
      if (alive) setNoService(!s.available && s.reason === 'no-service')
    })
    return () => {
      alive = false
    }
  }, [shareApi, path])
  if (!shareApi || noService) return null
  return (
    <>
      <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {SHARE_STRINGS.button}
      </Button>
      <ShareDialog open={open} onClose={() => setOpen(false)} path={path} fileName={fileName} api={shareApi} note={note} />
    </>
  )
}
