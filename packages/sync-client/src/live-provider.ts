/**
 * Rooms backed by the sync service's Hocuspocus server. Lives in the shell's
 * main process: the token is read there and never handed to a renderer.
 */
import { HocuspocusProvider } from '@hocuspocus/provider'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import type { LiveRoom, RoomFactory } from './live'

export interface HocuspocusRoomsOptions {
  /** ws:// or wss:// address of the live server */
  url: string
  token: () => Promise<string | null>
  /** how long the first sync may take before the join fails; default 10 s */
  timeoutMs?: number
}

/** The live server's address next to the HTTP service: same host, port 8788, ws or wss to match. */
export function liveUrlFor(syncUrl: string, override?: string | undefined): string | null {
  if (override) return /^wss?:\/\//.test(override) ? override : null
  try {
    const u = new URL(syncUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.port = '8788'
    u.pathname = '/'
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function hocuspocusRooms(opts: HocuspocusRoomsOptions): RoomFactory {
  return (fileId: string): LiveRoom => {
    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    let settle: { ok: (v: { readOnly: boolean }) => void; fail: (e: Error) => void } | null = null
    const ready = new Promise<{ readOnly: boolean }>((ok, fail) => (settle = { ok, fail }))
    const finish = (r: { readOnly: boolean } | Error) => {
      if (!settle) return
      const s = settle
      settle = null
      clearTimeout(timer)
      if (r instanceof Error) s.fail(r)
      else s.ok(r)
    }
    const provider = new HocuspocusProvider({
      url: opts.url,
      name: fileId,
      document: doc,
      awareness,
      token: async () => (await opts.token()) ?? '',
      onSynced: () => finish({ readOnly: provider.authorizedScope === 'readonly' }),
      onAuthenticationFailed: ({ reason }) => finish(new Error(reason || 'refused')),
    })
    const timer = setTimeout(() => finish(new Error('timeout')), opts.timeoutMs ?? 10_000)
    // a failed first sync never resolves; keep the rejection from going unhandled before join awaits it
    ready.catch(() => undefined)
    return {
      doc,
      awareness,
      ready,
      destroy: () => {
        finish(new Error('closed'))
        provider.destroy()
        doc.destroy()
      },
    }
  }
}
