import { contextBridge, ipcRenderer } from 'electron'
import type { Lang } from '@genoffice/i18n'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import { HANGUL_CHANNELS } from '../shared/ipc'
import type { HangulApi, SaveMode, UiTheme } from '../shared/ipc'

const api: HangulApi = {
  studioOrigin: () => ipcRenderer.invoke(HANGUL_CHANNELS.studioOrigin),
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
}

contextBridge.exposeInMainWorld('hangulApi', api)

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
