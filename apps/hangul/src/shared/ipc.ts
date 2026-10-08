import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@genoffice/ai-provider'
import type { OfficePrefsApi } from '@genoffice/electron-utils/office-prefs'
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
  /** which editor this view runs: the embedded rhwp-studio, or the owned editor on hwp-core */
  editorKind: 'hangul:editor-kind',
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
  /** AI create_document: write a new .hwpx (or hand docx/pdf/md to Docs) and open it in a tab */
  createDocument: 'hangul:create-document',
  /** the name comments are signed with: this computer's user name */
  authorName: 'hangul:author-name',
  /** AI generate_image, gated on the Redrob login and the cloud-tools setting */
  generateImage: 'hangul:ai-generate-image',
} as const

/** AI channels are app-wide ipcMain handlers the shell registers once (docs-main registerAiIpc); pass-through only. */
export const AI_CHANNELS = {
  getSettings: 'ai:get-settings',
  stream: 'ai:stream',
  streamChunk: 'ai:stream-chunk',
  streamCancel: 'ai:stream-cancel',
  webSearch: 'ai:web-search',
  imageSearch: 'ai:image-search',
  fetchImage: 'ai:fetch-image',
} as const

/** Chat attachments: the shell-wide files:* handlers (docs-main registerDocsIpc). */
export const FILES_CHANNELS = {
  pick: 'files:pick',
  add: 'files:add',
  read: 'files:read',
  readImage: 'files:read-image',
} as const

export interface AttachmentMeta {
  path: string
  name: string
  /** lowercased extension without the dot */
  ext: string
  sizeBytes: number
}

export interface AttachmentAddResult {
  accepted: AttachmentMeta[]
  rejected: string[]
}

export interface AttachmentReadResult {
  ok: boolean
  error?: string
  name?: string
  totalChars?: number
  offset?: number
  text?: string
}

export type AttachmentImageResult = { ok: true; base64: string; mime: string } | { ok: false; error: string }

export const ATTACHMENT_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

export interface ImageSearchResult {
  images: Array<{ imageUrl: string; title?: string; thumbnailUrl?: string; width?: number; height?: number; source?: string }>
  method?: string
  error?: string
}

export type CreateHangulDocumentRequest =
  | { type: 'hwpx'; title: string; base64: string }
  | { type: 'docx' | 'pdf' | 'md'; title: string; content: string }

export interface CreateHangulDocumentResult {
  ok: boolean
  path?: string
  error?: string
}

export interface WebSearchResult {
  answer?: string
  results: Array<{ title: string; url: string; snippet: string }>
  /** 'error' = the search backend failed (not an empty result) */
  method?: string
  error?: string
}

export type UiTheme = 'light' | 'dark' | 'system'

/**
 * 'next' is the owned editor (packages/hwp-editor over packages/hwp-core), spec
 * .kiro/specs/hangul-editor. Until cutover it is selected only by
 * REDROB_HANGUL_EDITOR=next in an unpackaged build; packaged builds always get 'studio'.
 */
export type HangulEditorKind = 'studio' | 'next'

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
export interface HangulApi extends Partial<OfficePrefsApi> {
  /**
   * The local, offline rhwp-studio origin the SDK embeds (http://127.0.0.1:<port>),
   * or null when the bundled studio is unavailable. Never a public CDN.
   */
  studioOrigin(): Promise<string | null>
  /** Which editor to mount (see HangulEditorKind). */
  editorKind(): Promise<HangulEditorKind>
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
  getAiSettings(): Promise<AiSettings>
  aiStream(request: AiStreamRequest): Promise<void>
  aiStreamCancel(requestId: string): Promise<void>
  onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
  /** Main-process web search (the shared ai:web-search handler) */
  webSearch(query: string, maxResults?: number): Promise<WebSearchResult>
  imageSearch(query: string, maxResults?: number): Promise<ImageSearchResult>
  /** Download an image URL in main (scheme and target validated there) */
  fetchImage(url: string): Promise<{ base64: string; mime: string } | null>
  generateImage(op: { prompt: string; aspectRatio?: string }): Promise<{ url?: string; error?: string }>
  createDocument(request: CreateHangulDocumentRequest): Promise<CreateHangulDocumentResult>
  /** The name new comments are signed with. */
  authorName(): Promise<string>
  pickAttachments(): Promise<AttachmentAddResult | null>
  addAttachments(paths: string[]): Promise<AttachmentAddResult>
  readAttachment(path: string, offset: number, maxChars: number): Promise<AttachmentReadResult>
  readAttachmentImage(path: string): Promise<AttachmentImageResult>
}
