import { contextBridge, ipcRenderer } from 'electron'
import type { Lang } from '@genoffice/i18n'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import { officePrefsBridge } from '@genoffice/electron-utils/office-prefs'
import { versionsBridge } from '@genoffice/versions'
import { liveBridge, shareBridge } from '@genoffice/sync-client'
import type { AiStreamChunk } from '@genoffice/ai-provider'
import { AI_CHANNELS, FILES_CHANNELS, HANGUL_CHANNELS } from '../shared/ipc'
import type { HangulApi, SaveMode, UiTheme } from '../shared/ipc'

const api: HangulApi = {
  ...officePrefsBridge(ipcRenderer),
  ...versionsBridge(ipcRenderer),
  ...shareBridge(ipcRenderer),
  ...liveBridge(ipcRenderer),
  studioOrigin: () => ipcRenderer.invoke(HANGUL_CHANNELS.studioOrigin),
  editorKind: () => ipcRenderer.invoke(HANGUL_CHANNELS.editorKind),
  consumePending: () => ipcRenderer.invoke(HANGUL_CHANNELS.consumePending),
  readBytes: (path) => ipcRenderer.invoke(HANGUL_CHANNELS.readBytes, path),
  save: (request) => ipcRenderer.invoke(HANGUL_CHANNELS.save, request),
  setDirty: (dirty) => ipcRenderer.send(HANGUL_CHANNELS.dirtyChanged, dirty),
  onSaveRequest: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, mode: SaveMode) => handler(mode)
    ipcRenderer.on(HANGUL_CHANNELS.saveRequest, listener)
    return () => ipcRenderer.removeListener(HANGUL_CHANNELS.saveRequest, listener)
  },
  sendSaveRequestAck: (ok) => ipcRenderer.send(HANGUL_CHANNELS.saveRequestAck, ok),
  onCloseSaveRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(HANGUL_CHANNELS.closeSaveRequest, listener)
    return () => ipcRenderer.removeListener(HANGUL_CHANNELS.closeSaveRequest, listener)
  },
  sendCloseSaveResult: (ok) => ipcRenderer.send(HANGUL_CHANNELS.closeSaveResult, ok),
  onFileRenamed: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, newPath: string) => handler(newPath)
    ipcRenderer.on(HANGUL_CHANNELS.fileRenamed, listener)
    return () => ipcRenderer.removeListener(HANGUL_CHANNELS.fileRenamed, listener)
  },
  getLanguage: () => ipcRenderer.invoke(HANGUL_CHANNELS.getLanguage),
  onLanguageChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, lang: Lang) => handler(lang)
    ipcRenderer.on(HANGUL_CHANNELS.languageChanged, listener)
    return () => ipcRenderer.removeListener(HANGUL_CHANNELS.languageChanged, listener)
  },
  getTheme: () => ipcRenderer.invoke(HANGUL_CHANNELS.getTheme),
  onThemeChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on(HANGUL_CHANNELS.themeChanged, listener)
    return () => ipcRenderer.removeListener(HANGUL_CHANNELS.themeChanged, listener)
  },
  onChromePressed: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('app:chrome-pressed', listener)
    return () => ipcRenderer.removeListener('app:chrome-pressed', listener)
  },
  getAiSettings: () => ipcRenderer.invoke(AI_CHANNELS.getSettings),
  aiStream: (request) => ipcRenderer.invoke(AI_CHANNELS.stream, request),
  aiStreamCancel: (requestId) => ipcRenderer.invoke(AI_CHANNELS.streamCancel, requestId),
  onAiStream: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk)
    ipcRenderer.on(AI_CHANNELS.streamChunk, listener)
    return () => ipcRenderer.removeListener(AI_CHANNELS.streamChunk, listener)
  },
  webSearch: (query, maxResults) => ipcRenderer.invoke(AI_CHANNELS.webSearch, query, maxResults),
  imageSearch: (query, maxResults) => ipcRenderer.invoke(AI_CHANNELS.imageSearch, query, maxResults),
  fetchImage: (url) => ipcRenderer.invoke(AI_CHANNELS.fetchImage, url),
  generateImage: (op) => ipcRenderer.invoke(HANGUL_CHANNELS.generateImage, op),
  printPages: (request) => ipcRenderer.invoke(HANGUL_CHANNELS.printPages, request),
  exportHtml: (request) => ipcRenderer.invoke(HANGUL_CHANNELS.exportHtml, request),
  fontSource: (face) => ipcRenderer.invoke(HANGUL_CHANNELS.fontSource, face),
  createDocument: (request) => ipcRenderer.invoke(HANGUL_CHANNELS.createDocument, request),
  authorName: () => ipcRenderer.invoke(HANGUL_CHANNELS.authorName),
  pickAttachments: () => ipcRenderer.invoke(FILES_CHANNELS.pick),
  addAttachments: (paths) => ipcRenderer.invoke(FILES_CHANNELS.add, paths),
  readAttachment: (path, offset, maxChars) => ipcRenderer.invoke(FILES_CHANNELS.read, path, offset, maxChars),
  readAttachmentImage: (path) => ipcRenderer.invoke(FILES_CHANNELS.readImage, path),
}

contextBridge.exposeInMainWorld('hangulApi', api)

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
