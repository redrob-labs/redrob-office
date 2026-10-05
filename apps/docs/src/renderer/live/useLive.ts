/**
 * A shared file's live room, mirrored in this view. The shell holds the
 * connection; this hook keeps a Y.Doc in step over IPC, tells the room where
 * this person is, and lists who else is in the file.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import * as Y from 'yjs'
import type { PresencePerson } from '@genoffice/ui'
import type { LiveApi, LiveAt, LivePeer, Role } from '@genoffice/sync-client'

/** Live copy; English is the master and the only selectable language. */
export const LIVE_STRINGS = {
  facesLabel: 'People in this file',
  person: '{name}, near "{where}"',
  personHere: '{name} is here',
  more: '+{n}',
  readOnly: 'You can view this shared file. Other people\'s changes show as they type.',
  liveOn: 'Editing together',
  rebased: 'Updated to the latest shared version.',
  rebaseFailed: 'The latest shared version could not be fetched. Your view may be behind until the next save.',
} as const

export type LiveState =
  | { kind: 'off' }
  | { kind: 'joining' }
  | { kind: 'unavailable'; reason: 'signed-out' | 'unreachable' }
  | { kind: 'live'; fileId: string; role: Role; readOnly: boolean; version: number; doc: Y.Doc }

/** marks updates that came from the room, so they are not sent back */
export const FROM_ROOM = Symbol('from-room')

const PRESENCE_MS = 400

/** Where a position is: the top-level block and its opening words. */
export function presenceAt(doc: PmNode, pos: number): LiveAt | null {
  if (doc.childCount === 0) return null
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const block = Math.min(doc.resolve(clamped).index(0), doc.childCount - 1)
  const text = doc.child(block).textContent.replace(/\s+/g, ' ').trim().slice(0, 40)
  return { block, text }
}

/** One face per person: the same account in two windows shows once, at its latest place. */
export function facesFor(peers: readonly LivePeer[]): PresencePerson[] {
  const byId = new Map<string, PresencePerson>()
  for (const p of peers) {
    const where = p.at?.text || undefined
    byId.set(p.id, { key: p.id, name: p.name, where: where ?? byId.get(p.id)?.where })
  }
  return [...byId.values()]
}

export function useLive({ api, path, editor }: { api: Partial<LiveApi> | undefined; path: string | null; editor: Editor | null }): {
  state: LiveState
  peers: LivePeer[]
  faces: PresencePerson[]
} {
  const [state, setState] = useState<LiveState>({ kind: 'off' })
  const [peers, setPeers] = useState<LivePeer[]>([])
  const fileIdRef = useRef<string | null>(null)

  useEffect(() => {
    setPeers([])
    fileIdRef.current = null
    if (!api?.liveJoin || !api.liveUpdate || !api.liveLeave || !path) {
      setState({ kind: 'off' })
      return
    }
    let cancelled = false
    let cleanup: (() => void) | null = null
    setState({ kind: 'joining' })
    void api.liveJoin(path).then((r) => {
      if (!r.ok) {
        if (!cancelled) setState(r.reason === 'signed-out' || r.reason === 'unreachable' ? { kind: 'unavailable', reason: r.reason } : { kind: 'off' })
        return
      }
      if (cancelled) {
        api.liveLeave!(r.fileId)
        return
      }
      const doc = new Y.Doc()
      Y.applyUpdate(doc, r.state, FROM_ROOM)
      const send = (update: Uint8Array, origin: unknown) => {
        if (origin !== FROM_ROOM) api.liveUpdate!(r.fileId, update)
      }
      doc.on('update', send)
      const offUpdate = api.onLiveUpdate?.((fileId, update) => {
        if (fileId === r.fileId) Y.applyUpdate(doc, update, FROM_ROOM)
      })
      const offPeers = api.onLivePeers?.((fileId, list) => {
        if (fileId === r.fileId) setPeers(list)
      })
      fileIdRef.current = r.fileId
      setPeers(r.peers)
      setState({ kind: 'live', fileId: r.fileId, role: r.role, readOnly: r.readOnly, version: r.version, doc })
      cleanup = () => {
        doc.off('update', send)
        offUpdate?.()
        offPeers?.()
        api.liveLeave!(r.fileId)
        doc.destroy()
      }
    })
    return () => {
      cancelled = true
      fileIdRef.current = null
      cleanup?.()
    }
  }, [api, path])

  // where this person is, a few times a second at most
  const live = state.kind === 'live'
  useEffect(() => {
    if (!live || !editor || !api?.livePresence) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let last = ''
    const tell = () => {
      timer = null
      const fileId = fileIdRef.current
      if (!fileId) return
      const at = presenceAt(editor.state.doc, editor.state.selection.from)
      const key = JSON.stringify(at)
      if (key === last) return
      last = key
      api.livePresence!(fileId, { at })
    }
    const schedule = () => {
      if (!timer) timer = setTimeout(tell, PRESENCE_MS)
    }
    tell()
    editor.on('selectionUpdate', schedule)
    return () => {
      editor.off('selectionUpdate', schedule)
      if (timer) clearTimeout(timer)
    }
  }, [live, editor, api])

  const faces = useMemo(() => facesFor(peers), [peers])
  return { state, peers, faces }
}
