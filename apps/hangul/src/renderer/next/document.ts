/**
 * Open and save for the owned Hangul editor (spec task 1.10). Pure: no React,
 * no window, so it is unit tested with the real engine in Node.
 *
 * Save order matches the old studio contract: serialize, write through the
 * host (atomic in main), and only after a confirmed write mark the session
 * saved, at the change sequence that was exported. Typing that lands while the
 * write is in flight keeps the document dirty.
 *
 * A document carrying tracked changes is refused an in-place save: the engine
 * drops revision marks today (docs/decisions/2026-10-hangul-format-research.md,
 * finding 3), so writing over the original would silently keep every deletion.
 * Save As to a new file is allowed and leaves the original untouched. The
 * guard goes when engine extension E5a preserves revisions.
 */
import JSZip from 'jszip'
import { HwpCoreDocument, HwpPasswordError, type HwpFormat } from '@genoffice/hwp-core'
import { Session } from '@genoffice/hwp-editor'
import type { HangulFormat, SaveHangulResult, SaveMode } from '../../shared/ipc'

export { HwpPasswordError }

export function formatOfName(fileName: string): HangulFormat {
  return fileName.toLowerCase().endsWith('.hwpx') ? 'hwpx' : 'hwp'
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/**
 * Whether the original file carries tracked changes the engine would drop.
 * HWPX: revision marks in a section, or a revision table in the header.
 * HWP 5.0: not detectable yet. Its revision records are undocumented and every
 * document 한글 writes has a TRACKCHANGE settings record, so presence means
 * nothing. Returns 'unknown' and the caller warns instead of blocking.
 */
export async function trackedChanges(bytes: Uint8Array, format: HwpFormat): Promise<boolean | 'unknown'> {
  if (format === 'hwp') return 'unknown'
  try {
    const zip = await JSZip.loadAsync(bytes)
    const header = (await zip.file('Contents/header.xml')?.async('string')) ?? ''
    if (/<hh:trackChange\b/.test(header)) return true
    for (const name of Object.keys(zip.files)) {
      if (!/^Contents\/section\d+\.xml$/.test(name)) continue
      const xml = await zip.file(name)!.async('string')
      if (/<hp:(insertBegin|deleteBegin)\b/.test(xml)) return true
    }
    return false
  } catch {
    return 'unknown'
  }
}

export interface OpenedDocument {
  session: Session
  format: HangulFormat
  fileName: string
  password?: string
  trackedChanges: boolean | 'unknown'
}

/** Open document bytes. Throws HwpPasswordError when a password is needed or wrong. */
export async function openDocument(bytes: Uint8Array, fileName: string, password?: string): Promise<OpenedDocument> {
  const doc = HwpCoreDocument.open(bytes, password)
  const source = doc.sourceFormat()
  const format: HangulFormat = source === 'hwpx' || source === 'hwp' ? source : formatOfName(fileName)
  const session = new Session(doc, format)
  return { session, format, fileName, password, trackedChanges: await trackedChanges(bytes, format) }
}

export function newDocument(): OpenedDocument {
  return { session: new Session(HwpCoreDocument.blank(), 'hwpx'), format: 'hwpx', fileName: '', trackedChanges: false }
}

export interface HostWriter {
  save(request: { base64: string; format: HangulFormat; mode: SaveMode }): Promise<SaveHangulResult>
}

export type SaveOutcome =
  | { saved: true; path: string; format: HangulFormat }
  | { saved: false; reason: 'canceled' | 'tracked-changes' }

export class TrackedChangesSaveBlocked extends Error {
  constructor() {
    super('This file has tracked changes that saving would lose. Use Save As to keep the original.')
    this.name = 'TrackedChangesSaveBlocked'
  }
}

export async function saveDocument(opened: OpenedDocument, host: HostWriter, mode: SaveMode, format: HangulFormat = opened.format): Promise<SaveOutcome> {
  if (mode === 'save' && opened.trackedChanges === true && opened.fileName) return { saved: false, reason: 'tracked-changes' }
  const seq = opened.session.changeSeq
  const bytes = opened.session.export(format, opened.password)
  const result = await host.save({ base64: bytesToBase64(bytes), format, mode })
  if (!result.ok) throw new Error(result.error)
  if ('canceled' in result) return { saved: false, reason: 'canceled' }
  opened.session.markSaved(seq)
  if (mode === 'saveAs') {
    // The new file was written from the engine, without the marks; it is the
    // one now open, and the guard no longer applies to it.
    opened.trackedChanges = false
    opened.format = format
    opened.fileName = result.path.split(/[\\/]/).pop() ?? opened.fileName
  }
  return { saved: true, path: result.path, format }
}
