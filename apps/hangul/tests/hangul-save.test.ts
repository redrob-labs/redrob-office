import { describe, expect, it, vi } from 'vitest'
import {
  bytesToBase64,
  saveHangulDocument,
  type HangulExporter,
  type HangulHostWriter,
} from '../src/renderer/hangul-save'
import type { SaveHangulResult } from '../src/shared/ipc'

/** A stub rhwp editor exporter recording which export path and notify ran. */
function makeExporter(overrides: Partial<HangulExporter> = {}): HangulExporter & {
  calls: string[]
} {
  const calls: string[] = []
  const exporter: HangulExporter & { calls: string[] } = {
    calls,
    exportHwp: vi.fn(async () => {
      calls.push('exportHwp')
      return new Uint8Array([1, 2, 3])
    }),
    exportHwpx: vi.fn(async () => {
      calls.push('exportHwpx')
      return new Uint8Array([4, 5, 6, 7])
    }),
    notifySaved: vi.fn(async () => {
      calls.push('notifySaved')
      return { ok: true as const, wasDirty: true }
    }),
    ...overrides,
  }
  return exporter
}

function makeHost(result: SaveHangulResult, calls: string[] = []): HangulHostWriter & {
  lastRequest?: { base64: string; format: string; mode: string }
} {
  const host: HangulHostWriter & { lastRequest?: { base64: string; format: string; mode: string } } =
    {
      save: vi.fn(async (request) => {
        calls.push('save')
        host.lastRequest = request
        return result
      }),
    }
  return host
}

describe('saveHangulDocument', () => {
  it('exports hwpx, writes through the host, then notifies the studio in that order', async () => {
    const exporter = makeExporter()
    const host = makeHost({ ok: true, path: '/docs/a.hwpx' }, exporter.calls)
    const result = await saveHangulDocument(exporter, host, {
      format: 'hwpx',
      mode: 'save',
      fileName: 'a.hwpx',
    })
    expect(result).toEqual({ saved: true, path: '/docs/a.hwpx', wasDirty: true })
    // The ordering contract: export -> save -> notifySaved, never reordered.
    expect(exporter.calls).toEqual(['exportHwpx', 'save', 'notifySaved'])
    expect(host.lastRequest?.format).toBe('hwpx')
    expect(host.lastRequest?.mode).toBe('save')
    // Bytes reach the host as base64 of exactly what rhwp exported.
    expect(host.lastRequest?.base64).toBe(bytesToBase64(new Uint8Array([4, 5, 6, 7])))
  })

  it('exports hwp for the hwp format', async () => {
    const exporter = makeExporter()
    const host = makeHost({ ok: true, path: '/docs/a.hwp' }, exporter.calls)
    await saveHangulDocument(exporter, host, { format: 'hwp', mode: 'save' })
    expect(exporter.calls).toEqual(['exportHwp', 'save', 'notifySaved'])
  })

  it('never notifies the studio when the host write is canceled (keeps the recovery draft)', async () => {
    const exporter = makeExporter()
    const host = makeHost({ ok: true, canceled: true }, exporter.calls)
    const result = await saveHangulDocument(exporter, host, { format: 'hwpx', mode: 'saveAs' })
    expect(result).toEqual({ saved: false })
    expect(exporter.notifySaved).not.toHaveBeenCalled()
    expect(exporter.calls).toEqual(['exportHwpx', 'save'])
  })

  it('never notifies the studio when the host write fails (keeps the recovery draft)', async () => {
    const exporter = makeExporter()
    const host = makeHost({ ok: false, error: 'disk full' }, exporter.calls)
    await expect(
      saveHangulDocument(exporter, host, { format: 'hwp', mode: 'save' }),
    ).rejects.toThrow('disk full')
    expect(exporter.notifySaved).not.toHaveBeenCalled()
    expect(exporter.calls).toEqual(['exportHwp', 'save'])
  })
})

describe('bytesToBase64', () => {
  it('round-trips arbitrary bytes through base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 128, 64])
    const decoded = Uint8Array.from(atob(bytesToBase64(bytes)), (c) => c.charCodeAt(0))
    expect(Array.from(decoded)).toEqual(Array.from(bytes))
  })
})
