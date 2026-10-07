import type { OfficePrefs } from '@genoffice/electron-utils/office-prefs'
import type { FactsCommand, FactsState } from '@genoffice/facts'
import type { VersionsApi } from '@genoffice/versions'
import type { LiveApi, ShareApi } from '@genoffice/sync-client'

export interface OpenFileResult {
  path: string
  name: string
  /** raw docx bytes */
  data: ArrayBuffer
  /** sha256 of the original file; original archived under this hash */
  hash: string
  /** the on-disk file is password protected (opened via decrypt; saves re-encrypt) */
  encrypted?: boolean
  /** content came from a newer crash-recovery copy and still needs an explicit save */
  recovered?: boolean
}

/** Password-protected (ECMA-376 encrypted) docx: the renderer prompts for the
 *  open password and retries via openDocxDecrypt. */
export interface OpenFileNeedsPassword {
  needsPassword: true
  path: string
  name: string
}

export type OpenDocxResult = OpenFileResult | OpenFileNeedsPassword | null

/** result of an openDocxDecrypt attempt; wrong-password keeps the prompt open */
export type DecryptOpenResult =
  | { ok: true; result: OpenFileResult }
  | { ok: false; reason: 'wrong-password' | 'unsupported' | 'error'; error?: string }

export interface PickImageResult {
  /** raw image bytes, base64 encoded */
  base64: string
  mime: 'image/png' | 'image/jpeg' | 'image/gif'
  name: string
}

// ---- AI provider settings/config/streaming: canonical types live in @genoffice/ai-provider ----

import type {
  AiChatRequest,
  AiChatResponse,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  GenSparkAccountStatus,
} from '@genoffice/ai-provider'
import type { FaceVerticalMetrics } from '@genoffice/font-metrics'

export type { FaceVerticalMetrics }

export type {
  AiChatRequest,
  AiChatResponse,
  AiProviderConfig,
  AiProviderId,
  AiProviderMeta,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  GenSparkAccountStatus,
} from '@genoffice/ai-provider'
export { AI_PROVIDERS } from '@genoffice/ai-provider'

// ---- agent protocol: canonical types live in @genoffice/agent-core ----

export type {
  AgentMessage,
  AgentToolCall,
  AgentToolDef,
  AgentToolResult,
} from '@genoffice/agent-core'

// ---- chat attachments (local files fed to the agent via tools) ----

/** Image attachment extensions: no text extraction; read as base64 on send and passed to the model as a multimodal image with the user message */
export const ATTACHMENT_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

export interface AttachmentMeta {
  /** absolute local path; the file never leaves the machine */
  path: string
  name: string
  /** lowercased extension without the dot */
  ext: string
  sizeBytes: number
}

export interface AttachmentAddResult {
  accepted: AttachmentMeta[]
  /** per-file rejection messages (too large / unsupported type / unreadable) */
  rejected: string[]
}

export interface AttachmentReadResult {
  ok: boolean
  error?: string
  name?: string
  /** total characters of the extracted text */
  totalChars?: number
  /** requested slice */
  text?: string
  offset?: number
}

/** an image attachment read as raw bytes for multimodal input (files:read-image) */
export interface AttachmentImageResult {
  ok: boolean
  /** raw base64 (no data: URL prefix) */
  base64?: string
  mime?: string
  error?: string
}

/** an open docs tab, for View → Switch Tab */
export interface DocsTabInfo {
  id: string
  title: string
  focused: boolean
}

/** commands dispatched from the native application menu to the renderer */
export type MenuCommand =
  | 'new'
  | 'open'
  | 'open-path'
  | 'save'
  | 'save-as'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-100'
  | 'zoom-page-width'
  | 'zoom-whole-page'
  | 'toggle-ai'
  | 'toggle-dark'
  | 'insert-table'
  | 'insert-image'
  | 'insert-page-break'
  | 'insert-link'
  | 'insert-equation'
  | 'insert-comment'
  | 'font-dialog'
  | 'paragraph-dialog'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'align-justify'
  | 'page-setup'
  | 'find'
  | 'print'
  | 'export-pdf'
  | 'word-count'
  | 'ai-proofread'
  | 'shortcuts'

export type UiTheme = 'light' | 'dark' | 'system'

/** target file type of the AI create_document tool */
export type CreateDocumentType = 'docx' | 'pdf' | 'md'

export interface CreateDocumentRequest {
  type: CreateDocumentType
  /** file name stem (sanitized main-side) */
  title: string
  /** docx/pdf: restricted HTML; md: Markdown source */
  content: string
}

export interface CreateDocumentResult {
  ok: boolean
  /** the created file, when it is written directly (pdf/md); docx opens as a new tab that saves itself */
  path?: string
  error?: string
}

/** AI-authored content queued for a docs tab spawned by create_document */
export interface AiDocContent {
  title: string
  html: string
}

export interface DesktopApi {
  /** current UI language (persisted by the shell in app-settings.json) */
  getLanguage(): Promise<'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'th' | 'id' | 'ru' | 'ar'>
  /** language switched from the shell home page */
  onLanguageChanged(
    handler: (
      lang: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'th' | 'id' | 'ru' | 'ar',
    ) => void,
  ): () => void
  /** current UI theme preference (persisted by the shell in app-settings.json) */
  getTheme(): Promise<UiTheme>
  /** theme switched from the shell home page */
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  /** press on the shell chrome (tab strip is a sibling WebContentsView whose
   *  clicks produce no DOM event here) — dismiss open popovers */
  onChromePressed(handler: () => void): () => void
  openDocx(): Promise<OpenDocxResult>
  openDocxPath(path: string): Promise<OpenDocxResult>
  /** decrypt-and-open a password-protected docx (path from a needsPassword result) */
  openDocxDecrypt(path: string, password: string): Promise<DecryptOpenResult>
  /** Review > Protect: set (or clear with null) the desired next-save password;
   *  filePath null = document not saved yet, applied on its first successful save */
  setDocPassword(filePath: string | null, password: string | null): Promise<{ ok: boolean }>
  /** snapshot the current intent sequence before replacement cleanup is queued */
  docPasswordIntentRevision(): Promise<number>
  /** discard prior-document intents through a captured revision */
  discardDocPasswordIntents(throughRevision: number): Promise<{ ok: boolean }>
  /** mark the renderer ready and consume a file passed by Finder/Explorer at launch */
  consumePendingOpenDocx(): Promise<OpenDocxResult>
  /** returns true when this tab was created via "New Document" and should start blank */
  consumeNewBlankDoc(): Promise<boolean>
  /** AI-authored content queued for this tab by create_document; one-shot, null when none */
  /** a request typed into Home's composer, for the Redrob panel to answer (one-shot) */
  consumeAskPrompt(): Promise<string | null>
  /** Toolbar, Plan or Run and Cross-check defaults, owned by the shell (null outside it) */
  getOfficePrefs?(): Promise<OfficePrefs | null>
  setOfficePrefs?(patch: Partial<OfficePrefs>): Promise<OfficePrefs | null>
  onOfficePrefsChanged?(handler: (prefs: OfficePrefs) => void): () => void
  /** Version history and last visits, owned by the shell (empty / null outside it) */
  listVersions?: VersionsApi['listVersions']
  nameVersion?: VersionsApi['nameVersion']
  restoreVersion?: VersionsApi['restoreVersion']
  markVisit?: VersionsApi['markVisit']
  /** Sharing through the shell's sync client (absent outside the suite) */
  shareStatus?: ShareApi['shareStatus']
  shareInvite?: ShareApi['shareInvite']
  shareRemove?: ShareApi['shareRemove']
  shareStop?: ShareApi['shareStop']
  sharedWithMe?: ShareApi['sharedWithMe']
  sharedByMe?: ShareApi['sharedByMe']
  openShared?: ShareApi['openShared']
  shareCommentAdd?: ShareApi['shareCommentAdd']
  shareCommentUpdate?: ShareApi['shareCommentUpdate']
  shareVersions?: ShareApi['shareVersions']
  shareRestoreVersion?: ShareApi['shareRestoreVersion']
  shareTransfer?: ShareApi['shareTransfer']
  shareLeave?: ShareApi['shareLeave']
  shareActivity?: ShareApi['shareActivity']
  shareLinkCreate?: ShareApi['shareLinkCreate']
  shareLinks?: ShareApi['shareLinks']
  shareLinkRevoke?: ShareApi['shareLinkRevoke']
  shareLinkPeek?: ShareApi['shareLinkPeek']
  shareLinkJoin?: ShareApi['shareLinkJoin']
  onShareJoinRequest?: ShareApi['onShareJoinRequest']
  shareTakeJoinRequest?: ShareApi['shareTakeJoinRequest']
  /** Live documents through the shell (absent outside the suite) */
  liveJoin?: LiveApi['liveJoin']
  livePull?: LiveApi['livePull']
  liveUpdate?: LiveApi['liveUpdate']
  livePresence?: LiveApi['livePresence']
  liveLeave?: LiveApi['liveLeave']
  onLiveUpdate?: LiveApi['onLiveUpdate']
  onLivePeers?: LiveApi['onLivePeers']
  /** The shell's linked-figure index (null outside the suite or when it failed to read) */
  getFacts?(): Promise<FactsState | null>
  /** Rejects when the shell refused or could not save the command */
  factsCommand?(cmd: FactsCommand): Promise<FactsState>
  onFactsChanged?(handler: (state: FactsState) => void): () => void
  consumeAiDocContent(): Promise<AiDocContent | null>
  /** AI create_document: build a new standalone file and open it in a new tab */
  createDocument(request: CreateDocumentRequest): Promise<CreateDocumentResult>
  /** receive documents opened from Finder/Explorer while the app is running */
  onOpenDocx(handler: (result: Exclude<OpenDocxResult, null>) => void): () => void
  /** File was renamed externally (renamed in the shell Home list) — pushes old and new paths; renderer syncs its save path and title bar */
  onRenamedDocx(handler: (paths: { oldPath: string; newPath: string }) => void): () => void
  /** auto=true marks an autosave: an externally modified file then fails with
   *  reason 'external-modified' instead of prompting (manual saves get an
   *  Overwrite/Cancel dialog in the main process) */
  saveDocx(
    path: string,
    data: ArrayBuffer,
    auto?: boolean,
  ): Promise<{
    ok: boolean
    error?: string
    reason?: 'external-modified'
    /** a newer password choice arrived after this save's snapshot */
    passwordIntentPending?: boolean
  }>
  /** crash-recovery copy of a dirty document, stored under userData */
  writeRecoveryCopy(path: string, data: ArrayBuffer): Promise<{ ok: boolean }>
  /** tab closed but webContents kept alive (shell freeze workaround) — stop background timers */
  onTeardown(handler: () => void): () => void
  /** sourcePath: the document's current path — Save As uses its desired next-save
   *  password and commits that state to the chosen path only after success */
  saveDocxAs(
    defaultName: string,
    data: ArrayBuffer,
    sourcePath?: string | null,
  ): Promise<{ ok: boolean; path?: string; error?: string; passwordIntentPending?: boolean }>
  /** first save of a new document: silently writes into the default folder, no dialog */
  saveDocxNew(
    defaultName: string,
    data: ArrayBuffer,
  ): Promise<{ ok: boolean; path?: string; error?: string; passwordIntentPending?: boolean }>
  getRecentFiles(): Promise<string[]>
  pickImage(): Promise<PickImageResult | null>
  /** vertical metrics of an installed family (exact name match), null when missing */
  fontMetrics(family: string): Promise<FaceVerticalMetrics | null>
  getAiSettings(): Promise<AiSettings>
  setAiSettings(settings: AiSettings): Promise<void>
  /** system print dialog for the current window; ok=false without error = canceled */
  print(): Promise<{ ok: boolean; error?: string }>
  /** render the document to PDF and ask where to save; size in twips.
   *  outPath is only honored when a previous export dialog chose that exact path */
  exportPdf(
    defaultName: string,
    pageWidthTwips: number,
    pageHeightTwips: number,
    outPath?: string,
  ): Promise<{ ok: boolean; path?: string; error?: string }>
  /** Mixed paper-size export: produce a set of PDF bytes (base64) at given sizes per the current print layout */
  printPdfBuffer(
    pageWidthTwips: number,
    pageHeightTwips: number,
  ): Promise<{ ok: boolean; base64?: string; error?: string }>
  /** Merge grouped PDF fragments in order and write to disk (missing outPath opens
   *  the save dialog; a given outPath must come from a previous export dialog) */
  saveMergedPdf(
    defaultName: string,
    base64Parts: string[],
    outPath?: string,
  ): Promise<{ ok: boolean; path?: string; error?: string }>
  aiChat(request: AiChatRequest): Promise<AiChatResponse>
  /** start a streaming AI call; deltas arrive via onAiStream with the same requestId */
  aiStream(request: AiStreamRequest): Promise<void>
  aiStreamCancel(requestId: string): Promise<void>
  /** Genspark account status (gsk login state); withEmail also returns the email (needs a network request, slower) */
  aiGskStatus(withEmail?: boolean): Promise<GenSparkAccountStatus>
  /** Open the browser to log in to Genspark (fire-and-forget; aiGskStatus flips to logged-in when done) */
  aiGskLogin(): Promise<void>
  webSearch(
    query: string,
    maxResults?: number,
  ): Promise<{
    results: Array<{ title: string; url: string; snippet: string }>
    answer?: string
    method: string
    /** failure reason when method === 'error' */
    error?: string
  }>
  imageSearch(
    query: string,
    maxResults?: number,
  ): Promise<{
    images: Array<{
      title: string
      imageUrl: string
      sourceUrl: string
      source: string
      width?: number
      height?: number
    }>
    method: string
    /** failure reason when method === 'error' */
    error?: string
  }>
  fetchImage(url: string): Promise<{ base64: string; mime: string } | null>
  /** AI image generation via the Genspark cloud channel (requires login + cloud tools) */
  aiGenerateImage(op: {
    prompt: string
    aspectRatio?: string
  }): Promise<{ url?: string; error?: string }>
  /** file picker for chat attachments (multi-select) */
  pickAttachments(): Promise<AttachmentAddResult | null>
  /** validate dropped paths and return attachment metadata */
  addAttachmentPaths(paths: string[]): Promise<AttachmentAddResult>
  /** persist a pasted clipboard image (no local path) to a temp file and add it as an attachment */
  addPastedImage(data: ArrayBuffer, ext: string): Promise<AttachmentAddResult>
  /** copy an embedded picture to the OS clipboard as a real bitmap + <img>
   *  html (r136: copying an image exported only the protected placeholder) */
  copyImageToClipboard(dataUrl: string, metaJson?: string): Promise<boolean>
  /** read a slice of the extracted text of an attachment */
  readAttachment(path: string, offset: number, maxChars: number): Promise<AttachmentReadResult>
  /** read an image attachment as base64 for multimodal input (≤5MB) */
  readAttachmentImage(path: string): Promise<AttachmentImageResult>
  /** absolute path of a File dropped onto the window (Electron webUtils) */
  getPathForFile(file: File): string
  /** View → New Tab: open another docs tab, optionally loading the same document */
  openNewTab(openPath?: string | null): Promise<void>
  /** all open docs tabs, for View → Switch Tab */
  listDocsTabs(): Promise<DocsTabInfo[]>
  focusDocsTab(id: string): Promise<void>
  /** subscribe to AI stream chunks; returns unsubscribe */
  onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
  /** subscribe to native menu commands; returns unsubscribe */
  onMenuCommand(handler: (command: MenuCommand, payload?: string) => void): () => void
  /** Close guard: main process queries pre-close state (dirty flag + autosave switch; if autosave is on, save silently without a dialog) */
  onCloseCheck(handler: () => void): () => void
  reportCloseCheck(state: { dirty: boolean; autoSave: boolean; filePath?: string | null }): void
  /** Close guard chose "Save": main process asks the renderer to run the full save flow */
  onCloseSaveRequest(handler: () => void): () => void
  reportCloseSaveResult(ok: boolean): void
  /** keep the native View menu's checkbox items in sync with renderer state */
  reportViewMenuState(state: { aiSidebar: boolean; darkCanvas: boolean }): void
}

/**
 * Every IPC channel docs's preload and main process use, in one place: the
 * preload and main import names from here instead of spelling strings, so a
 * typo is a type error, and `pnpm check:ipc` checks each one has its other end.
 */
export const DOCS_CHANNELS = {
  aiCapabilities: 'ai:capabilities',
  aiChat: 'ai:chat',
  aiFetchImage: 'ai:fetch-image',
  aiGetSettings: 'ai:get-settings',
  aiGskLogin: 'ai:gsk-login',
  aiGskStatus: 'ai:gsk-status',
  aiImageSearch: 'ai:image-search',
  aiSetSettings: 'ai:set-settings',
  aiStream: 'ai:stream',
  aiStreamCancel: 'ai:stream-cancel',
  aiStreamChunk: 'ai:stream-chunk',
  aiWebSearch: 'ai:web-search',
  appChromePressed: 'app:chrome-pressed',
  appConsumeAskPrompt: 'app:consume-ask-prompt',
  appGetLanguage: 'app:get-language',
  appGetTheme: 'app:get-theme',
  appLanguageChanged: 'app:language-changed',
  appThemeChanged: 'app:theme-changed',
  aiGenerateImage: 'docs:ai-generate-image',
  closeCheck: 'docs:close-check',
  closeCheckResult: 'docs:close-check-result',
  closeSaveRequest: 'docs:close-save-request',
  closeSaveResult: 'docs:close-save-result',
  consumeAiDocContent: 'docs:consume-ai-doc-content',
  consumeNewBlank: 'docs:consume-new-blank',
  consumePendingOpen: 'docs:consume-pending-open',
  copyImageToClipboard: 'docs:copy-image-to-clipboard',
  createDocument: 'docs:create-document',
  discardPasswordIntents: 'docs:discard-password-intents',
  exportPdf: 'docs:export-pdf',
  fontMetrics: 'docs:font-metrics',
  open: 'docs:open',
  openDecrypt: 'docs:open-decrypt',
  openPath: 'docs:open-path',
  opened: 'docs:opened',
  passwordIntentRevision: 'docs:password-intent-revision',
  pickImage: 'docs:pick-image',
  print: 'docs:print',
  printPdfBuffer: 'docs:print-pdf-buffer',
  recent: 'docs:recent',
  renamed: 'docs:renamed',
  save: 'docs:save',
  saveAs: 'docs:save-as',
  saveMergedPdf: 'docs:save-merged-pdf',
  saveNew: 'docs:save-new',
  setPassword: 'docs:set-password',
  teardown: 'docs:teardown',
  viewMenuState: 'docs:view-menu-state',
  writeRecovery: 'docs:write-recovery',
  filesAdd: 'files:add',
  filesAddPastedImage: 'files:add-pasted-image',
  filesPick: 'files:pick',
  filesRead: 'files:read',
  filesReadImage: 'files:read-image',
  homeGetOfficePrefs: 'home:get-office-prefs',
  homeSetOfficePrefs: 'home:set-office-prefs',
  menuCommand: 'menu:command',
  projectAppendChat: 'project:appendChat',
  projectCreate: 'project:create',
  projectDelete: 'project:delete',
  projectFiles: 'project:files',
  projectList: 'project:list',
  projectLoadChat: 'project:loadChat',
  projectMoveFile: 'project:moveFile',
  projectRebindChat: 'project:rebindChat',
  projectRename: 'project:rename',
  projectResolveChat: 'project:resolveChat',
  projectTimeline: 'project:timeline',
  winFocus: 'win:focus',
  winList: 'win:list',
  winNew: 'win:new',
} as const
