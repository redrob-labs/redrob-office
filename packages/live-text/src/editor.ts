/**
 * Live typing for a tiptap editor whose file is open live (useLiveRoom):
 * binds the editor to the shared Y.Doc, and keeps this view on the version
 * the shared text is based on.
 *
 * The base version is the "base" key of the shared "meta" map. The first
 * writer into an empty room fetches the latest shared bytes, puts them in
 * the editor, seeds the shared text and records that version as the base.
 * Anyone joining later takes the shared text as it is. When someone saves,
 * the base moves and every view calls `rebase` with those bytes; an editor
 * whose save writes the whole file from its content (Markdown) needs no
 * rebase and leaves it out.
 *
 * Docs keeps its own hook on top of startCollab (its comments live in the
 * shared document too, and its save patches the bytes it opened).
 */
import { useEffect, useRef, useState } from 'react'
import type { LiveEditor as Editor } from './editor-like'
import type * as Y from 'yjs'
import { LIVE_BASE_KEY, LIVE_META, type LiveApi, type LivePeer } from '@genoffice/sync-client'
import { FRAGMENT, startCollab, type CollabHandle } from './collab'
import { LIVE_STRINGS, type LiveState } from './room'

export interface LiveEditorDeps {
  editor: Editor | null
  live: LiveState
  peers: readonly LivePeer[]
  api: Partial<LiveApi> | undefined
  path: string | null
  /** put these bytes in the editor as the open document (in memory; the file on disk is not touched) */
  loadBytes: (bytes: Uint8Array) => Promise<boolean>
  /** re-read these bytes as what a save builds on, leaving the editor's content alone; absent when a save writes everything */
  rebase?: ((bytes: Uint8Array) => Promise<boolean>) | undefined
  setStatus: (message: string) => void
  /** the schema's text blocks (see startCollab) */
  protectedBlocks: readonly string[]
  classPrefix?: string
  /** runs once the binding is on (bind a side map, e.g. Markdown's properties); returns its cleanup */
  onBound?: ((doc: Y.Doc, ctx: { seed: boolean; readOnly: boolean }) => (() => void) | void) | undefined
}

export type LiveEditorStatus = 'off' | 'starting' | 'on' | 'failed'

export function useLiveEditor(deps: LiveEditorDeps): { status: LiveEditorStatus } {
  const [status, setStatus] = useState<LiveEditorStatus>('off')
  const depsRef = useRef(deps)
  depsRef.current = deps
  const handleRef = useRef<CollabHandle | null>(null)
  const { editor, live } = deps
  const doc: Y.Doc | null = live.kind === 'live' ? live.doc : null

  useEffect(() => {
    if (!editor || !doc || live.kind !== 'live') {
      setStatus('off')
      return
    }
    const { fileId, readOnly } = live
    let version = live.version
    let cancelled = false
    const offs: Array<() => void> = []
    setStatus('starting')

    const pull = async () => {
      const d = depsRef.current
      if (!d.api?.livePull || !d.path) return null
      const r = await d.api.livePull(d.path)
      return r.ok ? r : null
    }
    const rebaseTo = async (latest: { bytes: Uint8Array; version: number }) => {
      const rebase = depsRef.current.rebase
      if (rebase && !(await rebase(latest.bytes))) return false
      version = latest.version
      return true
    }

    void (async () => {
      const fragment = doc.getXmlFragment(FRAGMENT)
      const meta = doc.getMap<number>(LIVE_META)
      if (fragment.length === 0) {
        // nothing typed live yet: a viewer waits; a writer starts from the latest shared bytes
        if (readOnly) {
          setStatus('off')
          return
        }
        const latest = await pull()
        if (cancelled) return
        if (latest && latest.version !== version) {
          if (!(await depsRef.current.loadBytes(latest.bytes))) {
            setStatus('failed')
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
          if (!latest || !(await rebaseTo(latest))) depsRef.current.setStatus(LIVE_STRINGS.rebaseFailed)
        }
      }
      if (cancelled) return

      const seed = fragment.length === 0 && !readOnly
      const d = depsRef.current
      const handle = startCollab({
        editor,
        doc,
        seed,
        readOnly,
        protectedBlocks: d.protectedBlocks,
        classPrefix: d.classPrefix,
        onCursor: (cursor) => depsRef.current.api?.livePresence?.(fileId, { cursor }),
      })
      handleRef.current = handle
      if (seed) meta.set(LIVE_BASE_KEY, version)
      handle.setPeers(d.peers)
      offs.push(() => handle.destroy())
      const unbind = d.onBound?.(doc, { seed, readOnly })
      if (unbind) offs.push(unbind)

      // someone saved: move onto the version they uploaded
      const onMeta = (e: Y.YMapEvent<number>) => {
        if (!e.keysChanged.has(LIVE_BASE_KEY)) return
        const base = meta.get(LIVE_BASE_KEY)
        if (typeof base !== 'number' || base === version) return
        void pull().then(async (latest) => {
          if (cancelled || !latest) return
          if (await rebaseTo(latest)) depsRef.current.setStatus(LIVE_STRINGS.rebased)
          else depsRef.current.setStatus(LIVE_STRINGS.rebaseFailed)
        })
      }
      meta.observe(onMeta)
      offs.push(() => meta.unobserve(onMeta))
      setStatus('on')
    })()

    return () => {
      cancelled = true
      handleRef.current = null
      for (const off of offs.reverse()) off()
    }
    // the effect restarts only when the room or the editor changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, doc])

  useEffect(() => {
    handleRef.current?.setPeers(deps.peers)
  }, [deps.peers])

  return { status }
}
