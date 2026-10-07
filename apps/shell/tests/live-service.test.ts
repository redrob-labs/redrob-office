import { describe, expect, it, vi } from 'vitest'
import { LIVE_CHANNELS } from '@genoffice/sync-client'
import type { SharedLink } from '@genoffice/sync-client/node'
import { LiveService, type LiveSender } from '../src/main/live-service'

const FILE = process.platform === 'win32' ? 'C:\\work\\Plan.docx' : '/work/Plan.docx'
const ID = '11111111-2222-4333-8444-555555555555'

function sender(id = 7) {
  let onDestroyed: (() => void) | null = null
  const s: LiveSender & { sent: unknown[][]; destroy(): void } = {
    id,
    sent: [],
    send: (...a: unknown[]) => void s.sent.push(a),
    isDestroyed: () => false,
    once: (_e, l) => void (onDestroyed = l),
    destroy: () => onDestroyed?.(),
  }
  return s
}

function hub(opts: { fail?: boolean; readOnly?: boolean } = {}) {
  return {
    join: vi.fn(async (_view: number, _file: string, sink: { update(f: string, u: Uint8Array): void }) => {
      if (opts.fail) throw new Error('timeout')
      sink.update(ID, new Uint8Array([5]))
      return { state: new Uint8Array([1, 2]), peers: [], readOnly: opts.readOnly ?? false }
    }),
    update: vi.fn(),
    presence: vi.fn(),
    leave: vi.fn(),
    has: vi.fn((_view: number, _file: string) => true),
  }
}

const index = (link: SharedLink | null) => ({ get: async () => link })

describe('LiveService', () => {
  it('says why a file cannot go live', async () => {
    const s = sender()
    expect(await new LiveService({ hub: null, index: index(null), signedIn: async () => true }).join(s, FILE)).toEqual({ ok: false, reason: 'no-service' })
    expect(await new LiveService({ hub: hub(), index: index(null), signedIn: async () => false }).join(s, FILE)).toEqual({ ok: false, reason: 'signed-out' })
    expect(await new LiveService({ hub: hub(), index: index(null), signedIn: async () => true }).join(s, FILE)).toEqual({ ok: false, reason: 'not-shared' })
    expect(await new LiveService({ hub: hub({ fail: true }), index: index({ fileId: ID, role: 'edit', version: 1 }), signedIn: async () => true }).join(s, FILE)).toEqual({
      ok: false,
      reason: 'unreachable',
    })
  })

  it('joins a shared file, relays room updates to the view, and keeps view and comment roles read-only', async () => {
    const h = hub()
    const s = sender()
    const svc = new LiveService({ hub: h, index: index({ fileId: ID, role: 'edit', version: 1 }), signedIn: async () => true })
    const r = await svc.join(s, FILE)
    expect(r).toEqual({ ok: true, fileId: ID, role: 'edit', readOnly: false, version: 1, state: new Uint8Array([1, 2]), peers: [] })
    expect(s.sent).toEqual([[LIVE_CHANNELS.remote, ID, new Uint8Array([5])]])

    const viewer = new LiveService({ hub: hub(), index: index({ fileId: ID, role: 'comment', version: 1 }), signedIn: async () => true })
    expect(await viewer.join(sender(8), FILE)).toMatchObject({ ok: true, readOnly: true })
  })

  it('checks updates and presence before they reach the room, and leaves every room when the view closes', async () => {
    const h = hub()
    const s = sender()
    const svc = new LiveService({ hub: h, index: index({ fileId: ID, role: 'owner', version: 1 }), signedIn: async () => true })
    await svc.join(s, FILE)
    svc.update(s, 'not-an-id', new Uint8Array([1]))
    svc.update(s, ID, 'not bytes')
    svc.update(s, ID, new Uint8Array(0))
    expect(h.update).not.toHaveBeenCalled()
    svc.update(s, ID, new Uint8Array([3]))
    expect(h.update).toHaveBeenCalledWith(7, ID, new Uint8Array([3]))
    svc.presence(s, ID, { at: { block: 1, text: 'x' } })
    expect(h.presence).toHaveBeenCalledWith(7, ID, { at: { block: 1, text: 'x' } })
    s.destroy()
    expect(h.leave).toHaveBeenCalledWith(7)
  })

  it('pulls the latest shared bytes only for a file this view joined', async () => {
    const h = hub()
    const pull = vi.fn(async () => ({ bytes: new Uint8Array([7]), version: 3 }))
    const svc = new LiveService({ hub: h, index: index({ fileId: ID, role: 'edit', version: 1 }), signedIn: async () => true, pull })
    h.has.mockReturnValueOnce(false)
    expect(await svc.pull(sender(), FILE)).toEqual({ ok: false })
    expect(pull).not.toHaveBeenCalled()
    expect(await svc.pull(sender(), FILE)).toEqual({ ok: true, bytes: new Uint8Array([7]), version: 3 })
    expect(await svc.pull(sender(), 'relative.docx')).toEqual({ ok: false })
  })

  it('registers every live channel', () => {
    const handled: string[] = []
    new LiveService({ hub: null, index: index(null), signedIn: async () => true }).register({
      handle: (c) => void handled.push(c),
      on: (c) => void handled.push(c),
    })
    expect(handled.sort()).toEqual(
      [LIVE_CHANNELS.join, LIVE_CHANNELS.pull, LIVE_CHANNELS.leave, LIVE_CHANNELS.presence, LIVE_CHANNELS.update].sort(),
    )
  })
})
