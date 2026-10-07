import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { DOCS_CHANNELS } from '../shared/ipc'
import type { IpcRendererEvent } from 'electron'
import { OFFICE_PREFS_CHANGED, normalizeOfficePrefs } from '@genoffice/electron-utils/office-prefs'
import type {
  AiChatRequest,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  DesktopApi,
  MenuCommand,
  UiTheme,
} from '../shared/ipc'
import type { ProjectApi } from '@genoffice/project-store'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import { FACTS_CHANNELS, normalizeFactsState } from '@genoffice/facts'
import { versionsBridge } from '@genoffice/versions'
import { liveBridge, shareBridge } from '@genoffice/sync-client'

const api: DesktopApi = {
  getLanguage: () => ipcRenderer.invoke(DOCS_CHANNELS.appGetLanguage),
  onLanguageChanged: (handler) => {
    const listener = (
      _event: IpcRendererEvent,
      lang: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'th' | 'id' | 'ru' | 'ar',
    ) => handler(lang)
    ipcRenderer.on(DOCS_CHANNELS.appLanguageChanged, listener)
    return () => ipcRenderer.removeListener(DOCS_CHANNELS.appLanguageChanged, listener)
  },
  getTheme: () => ipcRenderer.invoke(DOCS_CHANNELS.appGetTheme),
  onThemeChanged: (handler) => {
    const listener = (_event: IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on(DOCS_CHANNELS.appThemeChanged, listener)
    return () => ipcRenderer.removeListener(DOCS_CHANNELS.appThemeChanged, listener)
  },
  onChromePressed: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(DOCS_CHANNELS.appChromePressed, listener)
    return () => ipcRenderer.removeListener(DOCS_CHANNELS.appChromePressed, listener)
  },
  openDocx: () => ipcRenderer.invoke(DOCS_CHANNELS.open),
  openDocxPath: (path: string) => ipcRenderer.invoke(DOCS_CHANNELS.openPath, path),
  openDocxDecrypt: (path: string, password: string) =>
    ipcRenderer.invoke(DOCS_CHANNELS.openDecrypt, path, password),
  setDocPassword: (filePath: string | null, password: string | null) =>
    ipcRenderer.invoke(DOCS_CHANNELS.setPassword, filePath, password),
  docPasswordIntentRevision: async () => {
    const revision: unknown = await ipcRenderer.invoke(DOCS_CHANNELS.passwordIntentRevision)
    return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0
      ? revision
      : 0
  },
  discardDocPasswordIntents: (throughRevision: number) =>
    ipcRenderer.invoke(DOCS_CHANNELS.discardPasswordIntents, throughRevision),
  consumePendingOpenDocx: () => ipcRenderer.invoke(DOCS_CHANNELS.consumePendingOpen),
  consumeNewBlankDoc: () => ipcRenderer.invoke(DOCS_CHANNELS.consumeNewBlank),
  // owned by the shell (apps/shell/src/main/ask-prompt.ts); null outside the suite
  consumeAskPrompt: () => ipcRenderer.invoke(DOCS_CHANNELS.appConsumeAskPrompt).catch(() => null),
  // shell-owned prefs (apps/shell/src/main/index.ts); outside the suite there is no handler
  getOfficePrefs: () =>
    ipcRenderer
      .invoke(DOCS_CHANNELS.homeGetOfficePrefs)
      .then((p: unknown) => normalizeOfficePrefs(p))
      .catch(() => null),
  setOfficePrefs: (patch: unknown) =>
    ipcRenderer
      .invoke(DOCS_CHANNELS.homeSetOfficePrefs, patch)
      .then((p: unknown) => normalizeOfficePrefs(p))
      .catch(() => null),
  onOfficePrefsChanged: (handler: (prefs: ReturnType<typeof normalizeOfficePrefs>) => void) => {
    const listener = (_e: unknown, p: unknown) => handler(normalizeOfficePrefs(p))
    ipcRenderer.on(OFFICE_PREFS_CHANGED, listener)
    return () => ipcRenderer.removeListener(OFFICE_PREFS_CHANGED, listener)
  },
  // shell-owned version history and last visits (apps/shell/src/main/versions-service.ts)
  ...versionsBridge(ipcRenderer),
  // shell-owned sharing (apps/shell/src/main/share-service.ts)
  ...shareBridge(ipcRenderer),
  // shell-owned live documents (apps/shell/src/main/live-service.ts)
  ...liveBridge(ipcRenderer),
  // shell-owned linked figures (apps/shell/src/main/facts-service.ts)
  getFacts: () =>
    ipcRenderer
      .invoke(FACTS_CHANNELS.get)
      .then((s: unknown) => normalizeFactsState(s))
      .catch(() => null),
  factsCommand: (cmd) =>
    ipcRenderer.invoke(FACTS_CHANNELS.command, cmd).then((s: unknown) => normalizeFactsState(s)),
  onFactsChanged: (handler) => {
    const listener = (_e: unknown, s: unknown) => handler(normalizeFactsState(s))
    ipcRenderer.on(FACTS_CHANNELS.changed, listener)
    return () => ipcRenderer.removeListener(FACTS_CHANNELS.changed, listener)
  },
  consumeAiDocContent: () => ipcRenderer.invoke(DOCS_CHANNELS.consumeAiDocContent),
  createDocument: (request) => ipcRenderer.invoke(DOCS_CHANNELS.createDocument, request),
  onOpenDocx: (handler) => {
    const listener = (_event: IpcRendererEvent, result: Parameters<typeof handler>[0]) =>
      handler(result)
    ipcRenderer.on(DOCS_CHANNELS.opened, listener)
    return () => ipcRenderer.removeListener(DOCS_CHANNELS.opened, listener)
  },
  onRenamedDocx: (handler) => {
    const listener = (_event: IpcRendererEvent, paths: Parameters<typeof handler>[0]) =>
      handler(paths)
    ipcRenderer.on(DOCS_CHANNELS.renamed, listener)
    return () => ipcRenderer.removeListener(DOCS_CHANNELS.renamed, listener)
  },
  saveDocx: (path: string, data: ArrayBuffer, auto?: boolean) =>
    ipcRenderer.invoke(DOCS_CHANNELS.save, path, data, auto === true),
  writeRecoveryCopy: (path: string, data: ArrayBuffer) =>
    ipcRenderer.invoke(DOCS_CHANNELS.writeRecovery, path, data),
  onTeardown: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(DOCS_CHANNELS.teardown, listener)
    return () => ipcRenderer.removeListener(DOCS_CHANNELS.teardown, listener)
  },
  saveDocxAs: (defaultName: string, data: ArrayBuffer, sourcePath?: string | null) =>
    ipcRenderer.invoke(DOCS_CHANNELS.saveAs, defaultName, data, sourcePath ?? null),
  saveDocxNew: (defaultName: string, data: ArrayBuffer) =>
    ipcRenderer.invoke(DOCS_CHANNELS.saveNew, defaultName, data),
  getRecentFiles: () => ipcRenderer.invoke(DOCS_CHANNELS.recent),
  pickImage: () => ipcRenderer.invoke(DOCS_CHANNELS.pickImage),
  fontMetrics: (family: string) => ipcRenderer.invoke(DOCS_CHANNELS.fontMetrics, family),
  print: () => ipcRenderer.invoke(DOCS_CHANNELS.print),
  exportPdf: (
    defaultName: string,
    pageWidthTwips: number,
    pageHeightTwips: number,
    outPath?: string,
  ) => ipcRenderer.invoke(DOCS_CHANNELS.exportPdf, defaultName, pageWidthTwips, pageHeightTwips, outPath),
  printPdfBuffer: (pageWidthTwips: number, pageHeightTwips: number) =>
    ipcRenderer.invoke(DOCS_CHANNELS.printPdfBuffer, pageWidthTwips, pageHeightTwips),
  saveMergedPdf: (defaultName: string, base64Parts: string[], outPath?: string) =>
    ipcRenderer.invoke(DOCS_CHANNELS.saveMergedPdf, defaultName, base64Parts, outPath),
  getAiSettings: () => ipcRenderer.invoke(DOCS_CHANNELS.aiGetSettings),
  setAiSettings: (settings: AiSettings) => ipcRenderer.invoke(DOCS_CHANNELS.aiSetSettings, settings),
  aiChat: (request: AiChatRequest) => ipcRenderer.invoke(DOCS_CHANNELS.aiChat, request),
  aiStream: (request: AiStreamRequest) => ipcRenderer.invoke(DOCS_CHANNELS.aiStream, request),
  aiStreamCancel: (requestId: string) => ipcRenderer.invoke(DOCS_CHANNELS.aiStreamCancel, requestId),
  aiGskStatus: (withEmail?: boolean) => ipcRenderer.invoke(DOCS_CHANNELS.aiGskStatus, withEmail),
  aiGskLogin: () => ipcRenderer.invoke(DOCS_CHANNELS.aiGskLogin),
  webSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke(DOCS_CHANNELS.aiWebSearch, query, maxResults),
  imageSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke(DOCS_CHANNELS.aiImageSearch, query, maxResults),
  fetchImage: (url: string) => ipcRenderer.invoke(DOCS_CHANNELS.aiFetchImage, url),
  aiGenerateImage: (op: { prompt: string; aspectRatio?: string }) =>
    ipcRenderer.invoke(DOCS_CHANNELS.aiGenerateImage, op),
  pickAttachments: () => ipcRenderer.invoke(DOCS_CHANNELS.filesPick),
  addAttachmentPaths: (paths: string[]) => ipcRenderer.invoke(DOCS_CHANNELS.filesAdd, paths),
  addPastedImage: (data: ArrayBuffer, ext: string) =>
    ipcRenderer.invoke(DOCS_CHANNELS.filesAddPastedImage, data, ext),
  copyImageToClipboard: (dataUrl: string, metaJson?: string) =>
    ipcRenderer.invoke(DOCS_CHANNELS.copyImageToClipboard, dataUrl, metaJson),
  readAttachment: (path: string, offset: number, maxChars: number) =>
    ipcRenderer.invoke(DOCS_CHANNELS.filesRead, path, offset, maxChars),
  readAttachmentImage: (path: string) => ipcRenderer.invoke(DOCS_CHANNELS.filesReadImage, path),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openNewTab: (openPath?: string | null) => ipcRenderer.invoke(DOCS_CHANNELS.winNew, openPath ?? null),
  listDocsTabs: () => ipcRenderer.invoke(DOCS_CHANNELS.winList),
  focusDocsTab: (id: string) => ipcRenderer.invoke(DOCS_CHANNELS.winFocus, id),
  onAiStream: (handler: (chunk: AiStreamChunk) => void) => {
    const listener = (_event: IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk)
    ipcRenderer.on(DOCS_CHANNELS.aiStreamChunk, listener)
    return () => ipcRenderer.removeListener(DOCS_CHANNELS.aiStreamChunk, listener)
  },
  onMenuCommand: (handler: (command: MenuCommand, payload?: string) => void) => {
    const listener = (_event: IpcRendererEvent, command: MenuCommand, payload?: string) =>
      handler(command, payload)
    ipcRenderer.on(DOCS_CHANNELS.menuCommand, listener)
    return () => ipcRenderer.removeListener(DOCS_CHANNELS.menuCommand, listener)
  },
  onCloseCheck: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on(DOCS_CHANNELS.closeCheck, listener)
    return () => ipcRenderer.removeListener(DOCS_CHANNELS.closeCheck, listener)
  },
  reportViewMenuState: (state: { aiSidebar: boolean; darkCanvas: boolean }) =>
    ipcRenderer.send(DOCS_CHANNELS.viewMenuState, {
      aiSidebar: state?.aiSidebar === true,
      darkCanvas: state?.darkCanvas === true,
    }),
  reportCloseCheck: (state: { dirty: boolean; autoSave: boolean; filePath?: string | null }) =>
    ipcRenderer.send(DOCS_CHANNELS.closeCheckResult, {
      dirty: state?.dirty === true,
      autoSave: state?.autoSave === true,
      filePath: typeof state?.filePath === 'string' ? state.filePath : null,
    }),
  onCloseSaveRequest: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on(DOCS_CHANNELS.closeSaveRequest, listener)
    return () => ipcRenderer.removeListener(DOCS_CHANNELS.closeSaveRequest, listener)
  },
  reportCloseSaveResult: (ok: boolean) => ipcRenderer.send(DOCS_CHANNELS.closeSaveResult, ok === true),
}

const projectApi: ProjectApi = {
  resolveChat: (args) => ipcRenderer.invoke(DOCS_CHANNELS.projectResolveChat, args),
  appendChat: (args) => ipcRenderer.invoke(DOCS_CHANNELS.projectAppendChat, args),
  loadChat: (args) => ipcRenderer.invoke(DOCS_CHANNELS.projectLoadChat, args),
  rebindChat: (args) => ipcRenderer.invoke(DOCS_CHANNELS.projectRebindChat, args),
  // P1 extensions
  listProjects: () => ipcRenderer.invoke(DOCS_CHANNELS.projectList),
  createProject: (args) => ipcRenderer.invoke(DOCS_CHANNELS.projectCreate, args),
  renameProject: (args) => ipcRenderer.invoke(DOCS_CHANNELS.projectRename, args),
  deleteProject: (args) => ipcRenderer.invoke(DOCS_CHANNELS.projectDelete, args),
  moveFile: (args) => ipcRenderer.invoke(DOCS_CHANNELS.projectMoveFile, args),
  getTimeline: (args) => ipcRenderer.invoke(DOCS_CHANNELS.projectTimeline, args),
}

contextBridge.exposeInMainWorld('desktop', api)
contextBridge.exposeInMainWorld('projectApi', projectApi)

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
