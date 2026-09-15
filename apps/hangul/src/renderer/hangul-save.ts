/**
 * The renderer-side save contract for the rhwp Hangul editor, kept as a pure
 * module so it can be unit tested without a browser or the studio iframe.
 *
 * The @rhwp/editor SDK draws a hard line between exporting bytes and marking the
 * document saved: exportHwp()/exportHwpx() only serialize, and the studio keeps
 * its auto-recovery draft until the host confirms a durable write with
 * notifySaved(). If the host write fails we must NOT call notifySaved, so the
 * recovery draft survives and the user can retry. This module encodes exactly
 * that ordering: export -> host.save -> notifySaved, and never the last step
 * when the write throws or is canceled.
 *
 * Portions of the save contract described here follow @rhwp/editor (MIT,
 * Copyright 2025-2026 Edward Kim). See the repository NOTICE file for attribution.
 */
import type { HangulFormat, SaveHangulResult, SaveMode } from '../shared/ipc'

/** The slice of the rhwp editor this save path touches, mocked in tests. */
export interface HangulExporter {
  exportHwp(): Promise<Uint8Array>
  exportHwpx(): Promise<Uint8Array>
  /**
   * Tell the studio the bytes were persisted so it clears its dirty flag and
   * deletes the recovery draft. Only call after a successful host write.
   */
  notifySaved(fileName?: string): Promise<{ ok: true; wasDirty: boolean }>
}

/** The slice of the host seam (window.hangulApi) this save path touches. */
export interface HangulHostWriter {
  save(request: {
    base64: string
    format: HangulFormat
    mode: SaveMode
  }): Promise<SaveHangulResult>
}

export interface SaveHangulDocumentOptions {
  /** Which format to export and file the document as. */
  format: HangulFormat
  /** save (overwrite the current path) or saveAs (always prompt). */
  mode: SaveMode
  /** File name handed to notifySaved so the studio can update its label. */
  fileName?: string | undefined
}

export interface SaveHangulDocumentResult {
  /** false when the user canceled the save dialog (untitled / Save As). */
  saved: boolean
  /** The path the bytes landed on, when saved. */
  path?: string
  /** Whether the studio reported it was dirty when notified (observational). */
  wasDirty?: boolean
}

/** Base64-encode bytes in the browser without a Node Buffer. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Export the current document through rhwp, persist it through the host seam,
 * and only then notify the studio that the save is durable.
 *
 * Throws if the export or the host write fails; a canceled dialog resolves with
 * saved:false. notifySaved is reached only after a confirmed on-disk write, so
 * a failure or cancel keeps the studio's recovery draft for a retry.
 */
export async function saveHangulDocument(
  editor: HangulExporter,
  host: HangulHostWriter,
  options: SaveHangulDocumentOptions,
): Promise<SaveHangulDocumentResult> {
  const { format, mode, fileName } = options

  // 1. Serialize. This does not mark the document saved on its own.
  const bytes = format === 'hwpx' ? await editor.exportHwpx() : await editor.exportHwp()

  // 2. Durable host write. A thrown error falls out before notifySaved; a
  //    canceled dialog returns ok+canceled and likewise skips notifySaved.
  const result = await host.save({ base64: bytesToBase64(bytes), format, mode })
  if (!result.ok) throw new Error(result.error)
  if ('canceled' in result) return { saved: false }

  // 3. Only now, after a confirmed write, clear the studio's dirty/recovery
  //    state. A failure here does not lose data; the bytes are already on disk.
  const ack = await editor.notifySaved(fileName)

  return { saved: true, path: result.path, wasDirty: ack.wasDirty }
}
