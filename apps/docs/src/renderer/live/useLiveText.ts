/**
 * Live typing for a shared file that is open live (useLive): binds the
 * editor and the comment list to the shared Y.Doc, and keeps this view's
 * original bytes (what a save patches) on the version the shared text is
 * based on.
 *
 * The base version is the "base" key of the shared "meta" map. The first
 * person into an empty room fetches the latest shared bytes, puts them in
 * the editor, seeds the shared text and records that version as the base.
 * Anyone joining later, or still here when someone saves, re-parses the
 * base version's bytes, so every docxIndex anchor in the shared text points
 * into the same bytes on every computer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type * as Y from 'yjs'
import type { CommentInfo } from '@genoffice/docx-engine'
import { LIVE_BASE_KEY, LIVE_META, type LiveApi, type LivePeer } from '@genoffice/sync-client'
import { setCommentIdSource } from '../editor/comments'
import { FRAGMENT, startCollab, type CollabHandle } from './collab'
import { bindComments, liveCommentId, type CommentsBinding } from './comments-sync'
import { LIVE_STRINGS, type LiveState } from './useLive'

export interface LiveTextDeps {
  editor: Editor | null
  live: LiveState
  peers: readonly LivePeer[]
  api: Partial<LiveApi> | undefined
  path: string | null
  /** put these bytes in the editor as the open document (in memory; the file on disk is not touched) */
  loadBytes: (bytes: Uint8Array) => Promise<boolean>
  /** re-parse these bytes as the original, leaving the editor's content alone */
  rebaseParsed: (bytes: Uint8Array) => Promise<boolean>
  comments: { get: () => CommentInfo[]; set: (list: CommentInfo[]) => void; markDirty: () => void }
  setStatus: (message: string) => void
}

export type LiveTextStatus = 'off' | 'starting' | 'on' | 'failed'

export function useLiveText(deps: LiveTextDeps): {
  status: LiveTextStatus
  /** write this view's comment list into the shared map */
  pushComments: (list: readonly CommentInfo[]) => void
} {
  const [status, setStatusState] = useState<LiveTextStatus>('off')
  const depsRef = useRef(deps)
  depsRef.current = deps
  const handleRef = useRef<CollabHandle | null>(null)
  const commentsRef = useRef<CommentsBinding | null>(null)

  const { editor, live } = deps
  const doc: Y.Doc | null = live.kind === 'live' ? live.doc : null

  useEffect(() => {
    if (!editor || !doc || live.kind !== 'live') {
      setStatusState('off')
      return
    }
    const { fileId, readOnly } = live
    let version = live.version
    let cancelled = false
    const offs: Array<() => void> = []
    setStatusState('starting')

    const pull = async () => {
      const d = depsRef.current
      if (!d.api?.livePull || !d.path) return null
      const r = await d.api.livePull(d.path)
      return r.ok ? r : null
    }

    void (async () => {
      const fragment = doc.getXmlFragment(FRAGMENT)
      const meta = doc.getMap<number>(LIVE_META)
      if (fragment.length === 0) {
        // nothing typed live yet: a viewer waits; a writer starts from the latest shared bytes
        if (readOnly) {
          setStatusState('off')
          return
        }
        const latest = await pull()
        if (cancelled) return
        if (latest && latest.version !== version) {
          if (!(await depsRef.current.loadBytes(latest.bytes))) {
            setStatusState('failed')
            depsRef.current.setStatus(LIVE_STRINGS.rebaseFailed)
            return
          }
          version = latest.version
        }
      } else {
        const base = meta.get(LIVE_BASE_KEY)
        if (typeof base === 'number' && base !== version) {
          const latest = await pull()
          if (cancelled) return
          if (latest && (await depsRef.current.rebaseParsed(latest.bytes))) version = latest.version
          else depsRef.current.setStatus(LIVE_STRINGS.rebaseFailed)
        }
      }
      if (cancelled) return

      const seed = fragment.length === 0 && !readOnly
      const handle = startCollab({
        editor,
        doc,
        seed,
        readOnly,
        onCursor: (cursor) => depsRef.current.api?.livePresence?.(fileId, { cursor }),
      })
      handleRef.current = handle
      if (seed) meta.set(LIVE_BASE_KEY, version)
      handle.setPeers(depsRef.current.peers)
      offs.push(() => handle.destroy())

      // comments: shared map, collision-safe ids
      setCommentIdSource(liveCommentId)
      offs.push(() => setCommentIdSource(null))
      const c = depsRef.current.comments
      const binding = bindComments(doc, {
        initial: c.get(),
        seed,
        onRemote: (list) => {
          depsRef.current.comments.set(list)
          depsRef.current.comments.markDirty()
        },
      })
      commentsRef.current = binding
      offs.push(() => binding.destroy())

      // someone saved: rebase onto the bytes they uploaded
      const onMeta = (e: Y.YMapEvent<number>) => {
        if (!e.keysChanged.has(LIVE_BASE_KEY)) return
        const base = meta.get(LIVE_BASE_KEY)
        if (typeof base !== 'number' || base === version) return
        void pull().then(async (latest) => {
          if (cancelled || !latest) return
          if (await depsRef.current.rebaseParsed(latest.bytes)) {
            version = latest.version
            depsRef.current.setStatus(LIVE_STRINGS.rebased)
          } else depsRef.current.setStatus(LIVE_STRINGS.rebaseFailed)
        })
      }
      meta.observe(onMeta)
      offs.push(() => meta.unobserve(onMeta))
      setStatusState('on')
    })()

    return () => {
      cancelled = true
      handleRef.current = null
      commentsRef.current = null
      for (const off of offs.reverse()) off()
    }
    // the effect restarts only when the room or the editor changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, doc])

  useEffect(() => {
    handleRef.current?.setPeers(deps.peers)
  }, [deps.peers])

  const pushComments = useCallback((list: readonly CommentInfo[]) => commentsRef.current?.push(list), [])
  return { status, pushComments }
}
