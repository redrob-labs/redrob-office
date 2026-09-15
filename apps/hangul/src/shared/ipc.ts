import type { Lang } from '@genoffice/i18n'

/**
 * IPC channels for the Hangul (.hwp/.hwpx) editor module.
 *
 * The editing surface itself comes from rhwp-studio (MIT, Copyright 2025-2026
 * Edward Kim), embedded in the renderer through the @rhwp/editor iframe SDK.
 * The main process only owns the offline studio origin (a loopback server over
 * the bundled studio build), file grants, and the byte read/write round-trip.
 * All HWP/HWPX parsing and serialization happens inside rhwp, never here.
 */
export const HANGUL_CHANNELS = {
  /** studio origin the renderer hands the SDK's studioUrl (local loopback, never a CDN) */
  studioOrigin: 'hangul:studio-origin',
  /** take the .hwp/.hwpx path pending for this view (queued at tab creation); null = nothing to open */
  consumePending: 'hangul:consume-pending',
  /** read a granted document's bytes for rhwp to load */
  readBytes: 'hangul:read-bytes',
  /** write rhwp's exported bytes back to disk (atomic); resolves the save target */
  save: 'hangul:save',
  /** shell menu Save / Save As → renderer asks rhwp to export and calls save() */
  saveRequest: 'hangul:save-request',
  /** resolves a menu-save waiter when the renderer declines without invoking save() */
  saveRequestAck: 'hangul:save-request-ack',
  /** mirror unsaved-changes state to the main process; drives the close prompt */
  dirtyChanged: 'hangul:dirty-changed',
  /** main picked "Save" in the close prompt → renderer saves and replies */
  closeSaveRequest: 'hangul:close-save-request',
  closeSaveResult: 'hangul:close-save-result',
  /** the file was renamed on disk (Home list rename) — renderer syncs its display path */
  fileRenamed: 'hangul:file-renamed',
  getLanguage: 'app:get-language',
  languageChanged: 'app:language-changed',
  getTheme: 'app:get-theme',
  themeChanged: 'app:theme-changed',
} as const

export type UiTheme = 'light' | 'dark' | 'system'

export type HangulFormat = 'hwp' | 'hwpx'

export type SaveMode = 'save' | 'saveAs'

/** The bytes rhwp exported plus the format the renderer serialized to. */
export interface SaveHangulRequest {
  /** exported document bytes, base64 (rhwp's exportHwp/exportHwpx output) */
  base64: string
  /** the format the bytes are in — decides the default extension and dialog filter */
  format: HangulFormat
  mode: SaveMode
}

export type SaveHangulResult =
  | { ok: true; path: string }
  | { ok: true; canceled: true }
  | { ok: false; error: string }

/** rhwp needs the raw bytes and the file name to pick the format on load. */
export interface HangulDocumentBytes {
  /** document bytes, base64 */
  base64: string
  /** basename the document was opened as, so rhwp keys the format from the extension */
  fileName: string
}

/** API exposed by preload to the renderer (window.hangulApi). */
export interface HangulApi {
  /**
   * The local, offline rhwp-studio origin the SDK embeds (http://127.0.0.1:<port>),
   * or null when the bundled studio is unavailable. Never a public CDN.
   */
  studioOrigin(): Promise<string | null>
  /** Take the .hwp/.hwpx path pending for this view; null = nothing to open. */
  consumePending(): Promise<string | null>
  /** Read a granted document's bytes for rhwp to load. Only granted paths are allowed. */
  readBytes(path: string): Promise<HangulDocumentBytes>
  /**
   * Persist rhwp's exported bytes. With a granted path the write is atomic
   * (tmp + rename); untitled documents and 'saveAs' go through a save dialog
   * first. The resolved path is granted to the view and returned.
   */
  save(request: SaveHangulRequest): Promise<SaveHangulResult>
  /** Mirror unsaved-changes state to the main process; drives the close prompt. */
  setDirty(dirty: boolean): void
  /** Shell menu Save / Save As → renderer serializes via rhwp and calls save(). */
  onSaveRequest(handler: (mode: SaveMode) => void): () => void
  /** Resolves a menu-save waiter when doSave exits without invoking save(). */
  sendSaveRequestAck(ok: boolean): void
  /** Main picked "Save" in the close prompt → renderer saves and replies. */
  onCloseSaveRequest(handler: () => void): () => void
  sendCloseSaveResult(ok: boolean): void
  /** The file was renamed on disk — renderer syncs its display path. */
  onFileRenamed(handler: (newPath: string) => void): () => void
  getLanguage(): Promise<Lang>
  onLanguageChanged(handler: (lang: Lang) => void): () => void
  getTheme(): Promise<UiTheme>
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  /** the shell relays chrome presses (the tab strip is a sibling view) */
  onChromePressed(handler: () => void): () => void
}
