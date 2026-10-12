// Hangul-owned AI channels (spec task 3.4). The shared ai:* and files:*
// handlers are registered once by the shell; these two are Hangul's own:
//
// - create_document: a .hwpx the renderer built with the engine is written to
//   the default folder and opened in a new tab; docx, pdf and md go to the
//   Docs-owned creation flow, which the shell wires in as a hook.
// - generate_image: gated per app on the Redrob login and the cloud-tools
//   setting, re-read on every call, exactly as Docs and Markdown do.
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cloudToolsEnabled, type AiSettings } from '@genoffice/ai-provider'
import type { CreateHangulDocumentRequest, CreateHangulDocumentResult } from '../shared/ipc'

export interface HangulAiHooks {
  /** open a generated file in a new shell tab; false when nothing could open it */
  openGeneratedPath?(path: string): boolean
  /** the Docs-owned create_document for docx, pdf and md */
  createDocument?(request: { type: 'docx' | 'pdf' | 'md'; title: string; content: string }): Promise<{ ok: boolean; path?: string; error?: string }>
}

/** A safe file-name stem (same rule as Docs' sanitizeAiDocFileBase). */
export function sanitizeFileBase(title: unknown): string {
  const cleaned = String(title ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 80)
    .trim()
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'Untitled'
}

/** First free path for fileName in dir: name.ext, name-2.ext, … */
export function uniquePathIn(dir: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  let candidate = join(dir, fileName)
  for (let i = 2; existsSync(candidate); i++) candidate = join(dir, `${base}-${i}${ext}`)
  return candidate
}

/** HWPX is a ZIP whose first entry is the stored `mimetype` file. */
function looksLikeHwpx(bytes: Buffer): boolean {
  return bytes.length > 60 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes.subarray(30, 38).toString('latin1') === 'mimetype'
}

export async function createHangulDocument(request: CreateHangulDocumentRequest, saveDir: string, hooks: HangulAiHooks): Promise<CreateHangulDocumentResult> {
  const title = sanitizeFileBase(request?.title)
  try {
    if (request?.type === 'hwpx') {
      const bytes = Buffer.from(String(request.base64 ?? ''), 'base64')
      if (!looksLikeHwpx(bytes)) return { ok: false, error: 'the generated document is not a valid .hwpx' }
      await mkdir(saveDir, { recursive: true })
      const path = uniquePathIn(saveDir, `${title}.hwpx`)
      await writeFile(path, bytes)
      hooks.openGeneratedPath?.(path)
      return { ok: true, path }
    }
    if (request?.type === 'docx' || request?.type === 'pdf' || request?.type === 'md') {
      if (!hooks.createDocument) return { ok: false, error: `creating .${request.type} files is not available here` }
      return await hooks.createDocument({ type: request.type, title, content: String(request.content ?? '') })
    }
    return { ok: false, error: `unsupported document type: ${String(request?.type)}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Cloud tools setting, read live from the file the shell's settings pane writes. */
export function cloudToolsOn(userData: string): boolean {
  try {
    return cloudToolsEnabled(JSON.parse(readFileSync(join(userData, 'ai-settings.json'), 'utf8')) as Partial<AiSettings>)
  } catch {
    return false
  }
}
