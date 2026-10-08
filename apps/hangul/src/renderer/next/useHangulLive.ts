// A shared Hangul file's live room in this view (spec tasks 5.4 and 5.5).
// The shell holds the connection (and the token); this hook mirrors the room's
// Y.Doc over IPC, binds the editor session to it (LiveBinding), tells the room
// where this person is, and lists who else is here.
//
// Every live view must type on the same bytes, so the room records the shared
// version its text is based on (`meta.base`):
//   - the first writer into an empty room seeds the text and records its
//     version;
//   - a view whose file is behind the room's base reloads the latest shared
//     bytes before binding;
//   - when someone saves (the base moves on), a view with no unsaved changes
//     of its own reloads that version, which brings formatting and objects
//     the live text does not carry.
// Comments travel through the room's `hwp:comments` map as they are written
// (LiveComments), so others see a memo without waiting for a save.
// View and comment roles are read-only.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { LIVE_BASE_KEY, LIVE_META, type LiveApi, type LivePeer, type Role } from '@genoffice/sync-client'
import { LiveBinding, LiveComments, type Comments, type EditorView } from '@genoffice/hwp-editor'
import { seatOf, type PresencePerson } from '@genoffice/ui'

const FROM_ROOM = Symbol('from-room')
const PRESENCE_MS = 400

export type HangulLiveState =
  | { kind: 'off' }
  | { kind: 'joining' }
  | { kind: 'unavailable'; reason: 'signed-out' | 'unreachable' }
  | { kind: 'live'; fileId: string; role: Role; readOnly: boolean }

export interface HangulLiveDeps {
  api: Partial<LiveApi> | undefined
  path: string | null
  view: EditorView | null
  /** This view's comments, shared with the room while live. */
  comments?: Comments | null
  /** Replace the open document with these bytes (in memory; the file on disk is not touched). */
  reload(bytes: Uint8Array): void
  /** Called when the binding changes the document view (remote text, carets). */
  onChange(): void
}

/** One face per person, at their latest place. */
export function facesFor(peers: readonly LivePeer[], me: number | null): PresencePerson[] {
  const byId = new Map<string, PresencePerson>()
  for (const p of peers) {
    if (p.clientId === me) continue
    byId.set(p.id, { key: p.id, name: p.name, where: p.at?.text || byId.get(p.id)?.where })
  }
  return [...byId.values()]
}

export function useHangulLive({ api, path, view, comments, reload, onChange }: HangulLiveDeps): { state: HangulLiveState; faces: PresencePerson[]; binding: LiveBinding | null } {
  const [state, setState] = useState<HangulLiveState>({ kind: 'off' })
  const [peers, setPeers] = useState<LivePeer[]>([])
  const [binding, setBinding] = useState<LiveBinding | null>(null)
  const depsRef = useRef({ reload, onChange, comments })
  depsRef.current = { reload, onChange, comments }
  const clientRef = useRef<number | null>(null)

  useEffect(() => {
    setPeers([])
    if (!api?.liveJoin || !api.liveUpdate || !api.liveLeave || !path || !view) {
      setState({ kind: 'off' })
      return
    }
    let cancelled = false
    let cleanup: (() => void) | null = null
    setState({ kind: 'joining' })
    void (async () => {
      const r = await api.liveJoin!(path)
      if (cancelled) {
        if (r.ok) api.liveLeave!(r.fileId)
        return
      }
      if (!r.ok) {
        setState(r.reason === 'signed-out' || r.reason === 'unreachable' ? { kind: 'unavailable', reason: r.reason } : { kind: 'off' })
        return
      }
      const doc = new Y.Doc()
      Y.applyUpdate(doc, r.state, FROM_ROOM)
      clientRef.current = doc.clientID
      const meta = doc.getMap<number>(LIVE_META)
      const empty = doc.getText('hwp:section0').length === 0
      const base = meta.get(LIVE_BASE_KEY)
      // Behind the room: load the bytes the shared text is based on, then join again.
      if (!empty && typeof base === 'number' && base !== r.version) {
        const latest = await api.livePull?.(path)
        api.liveLeave!(r.fileId)
        doc.destroy()
        if (!cancelled && latest?.ok) depsRef.current.reload(latest.bytes)
        return
      }
      const seed = empty && !r.readOnly
      const send = (update: Uint8Array, origin: unknown) => {
        if (origin !== FROM_ROOM) api.liveUpdate!(r.fileId, update)
      }
      doc.on('update', send)
      const live = new LiveBinding(view.session, doc, view.bus, { seed, readOnly: r.readOnly })
      if (seed) meta.set(LIVE_BASE_KEY, r.version)
      const c = depsRef.current.comments
      const liveComments = c && c.session === view.session ? new LiveComments(c, doc, live, { readOnly: r.readOnly }) : null
      view.readOnly = view.readOnly || r.readOnly
      const offUpdate = api.onLiveUpdate?.((fileId, update) => {
        if (fileId !== r.fileId) return
        Y.applyUpdate(doc, update, FROM_ROOM)
        depsRef.current.onChange()
      })
      const offPeers = api.onLivePeers?.((fileId, list) => {
        if (fileId === r.fileId) setPeers(list)
      })
      // Someone saved: the base moved on. A clean view reloads that version.
      const onMeta = () => {
        const b = meta.get(LIVE_BASE_KEY)
        if (typeof b !== 'number' || b === r.version || view.session.dirty) return
        void api.livePull?.(path).then((latest) => {
          if (latest?.ok && !cancelled) depsRef.current.reload(latest.bytes)
        })
      }
      meta.observe(onMeta)
      setPeers(r.peers)
      setBinding(live)
      setState({ kind: 'live', fileId: r.fileId, role: r.role, readOnly: r.readOnly })
      // Where this person is, a few times a second at most.
      let timer: ReturnType<typeof setTimeout> | null = null
      let last = ''
      const tell = () => {
        timer = null
        const s = view.session
        const h = s.selection.head
        const text = h.cell ? '' : s.doc.text(h.section, h.para).replace(/\s+/g, ' ').trim().slice(0, 40)
        const presence = { at: { block: h.para, text }, cursor: live.cursor() }
        const key = JSON.stringify(presence)
        if (key === last) return
        last = key
        api.livePresence?.(r.fileId, presence)
      }
      const offRender = view.session.onChange(() => {
        if (!timer) timer = setTimeout(tell, PRESENCE_MS)
      })
      tell()
      cleanup = () => {
        if (timer) clearTimeout(timer)
        offRender()
        meta.unobserve(onMeta)
        offUpdate?.()
        offPeers?.()
        doc.off('update', send)
        liveComments?.destroy()
        live.destroy()
        api.liveLeave!(r.fileId)
        doc.destroy()
        setBinding(null)
      }
    })()
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [api, path, view])

  // Other people's carets and selections, as overlay decorations in their seat colour.
  useEffect(() => {
    if (!view || !binding) return
    for (const k of view.overlay.decorationKeys()) if (k.startsWith('peer:')) view.overlay.clearDecoration(k)
    for (const p of peers) {
      if (p.clientId === clientRef.current) continue
      const sel = binding.resolveCursor(p.cursor)
      if (!sel) continue
      const seat = seatOf(p.id)
      const color = `var(--hangul-peer-${seat})`
      try {
        const caret = view.session.text.cursorRect(sel.head)
        view.overlay.setDecoration({ key: `peer:${p.clientId}:caret`, kind: 'remote-caret', rects: [{ pageIndex: caret.pageIndex, x: caret.x, y: caret.y, width: 2, height: caret.height }], color, label: p.name })
        const rects = view.session.text.selectionRects(sel.anchor, sel.head)
        if (rects.length) view.overlay.setDecoration({ key: `peer:${p.clientId}:sel`, kind: 'remote-selection', rects, color, label: p.name })
      } catch {
        /* off-page or mid-relayout */
      }
    }
  })

  const faces = useMemo(() => facesFor(peers, clientRef.current), [peers])
  return { state, faces, binding }
}
