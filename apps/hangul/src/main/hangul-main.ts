import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { BrowserWindow, WebContentsView, app, dialog, ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import {
  configuredDefaultSaveDir,
  contextMenuLabels,
  installContextMenu,
  installNavigationGuard,
  safeExternalUrl,
  showSaveDialogWithMemory,
} from '@genoffice/electron-utils'
import { createI18n, getUiLang } from '@genoffice/i18n'
import { atomicWriteFile } from './atomic-write'
import { serveHangulStudio, stopHangulStudio } from './studio-serve'
import { HANGUL_CHANNELS } from '../shared/ipc'
import type {
  HangulDocumentBytes,
  HangulFormat,
  SaveHangulRequest,
  SaveHangulResult,
  SaveMode,
} from '../shared/ipc'

const tDlg = createI18n({
  zh: {
    dlgSaveTitle: '保存 Hangul 文档',
    filterHangul: 'Hangul 文档',
    untitledFile: '未命名文档',
    closeUnsavedMsg: '此文档有未保存的更改。',
    closeUnsavedDetail: '关闭前是否保存？',
    btnSave: '保存',
    btnDontSave: '不保存',
    btnCancel: '取消',
  },
  en: {
    dlgSaveTitle: 'Save Hangul Document',
    filterHangul: 'Hangul Documents',
    untitledFile: 'Untitled',
    closeUnsavedMsg: 'This document has unsaved changes.',
    closeUnsavedDetail: 'Do you want to save them before closing?',
    btnSave: 'Save',
    btnDontSave: "Don't Save",
    btnCancel: 'Cancel',
  },
  ja: {
    dlgSaveTitle: 'Hangul ドキュメントを保存',
    filterHangul: 'Hangul ドキュメント',
    untitledFile: '無題',
    closeUnsavedMsg: 'このドキュメントに未保存の変更があります。',
    closeUnsavedDetail: '閉じる前に保存しますか？',
    btnSave: '保存',
    btnDontSave: '保存しない',
    btnCancel: 'キャンセル',
  },
  ko: {
    dlgSaveTitle: '한글 문서 저장',
    filterHangul: '한글 문서',
    untitledFile: '제목 없음',
    closeUnsavedMsg: '이 문서에 저장하지 않은 변경 사항이 있습니다.',
    closeUnsavedDetail: '닫기 전에 저장하시겠습니까?',
    btnSave: '저장',
    btnDontSave: '저장 안 함',
    btnCancel: '취소',
  },
  fr: {
    dlgSaveTitle: 'Enregistrer le document Hangul',
    filterHangul: 'Documents Hangul',
    untitledFile: 'Sans titre',
    closeUnsavedMsg: 'Ce document contient des modifications non enregistrées.',
    closeUnsavedDetail: 'Voulez-vous les enregistrer avant de fermer ?',
    btnSave: 'Enregistrer',
    btnDontSave: 'Ne pas enregistrer',
    btnCancel: 'Annuler',
  },
  de: {
    dlgSaveTitle: 'Hangul-Dokument speichern',
    filterHangul: 'Hangul-Dokumente',
    untitledFile: 'Unbenannt',
    closeUnsavedMsg: 'Dieses Dokument enthält ungespeicherte Änderungen.',
    closeUnsavedDetail: 'Vor dem Schließen speichern?',
    btnSave: 'Speichern',
    btnDontSave: 'Nicht speichern',
    btnCancel: 'Abbrechen',
  },
  es: {
    dlgSaveTitle: 'Guardar documento Hangul',
    filterHangul: 'Documentos Hangul',
    untitledFile: 'Sin título',
    closeUnsavedMsg: 'Este documento tiene cambios sin guardar.',
    closeUnsavedDetail: '¿Quieres guardarlos antes de cerrar?',
    btnSave: 'Guardar',
    btnDontSave: 'No guardar',
    btnCancel: 'Cancelar',
  },
  th: {
    dlgSaveTitle: 'บันทึกเอกสาร Hangul',
    filterHangul: 'เอกสาร Hangul',
    untitledFile: 'ไม่มีชื่อ',
    closeUnsavedMsg: 'เอกสารนี้มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก',
    closeUnsavedDetail: 'ต้องการบันทึกก่อนปิดหรือไม่?',
    btnSave: 'บันทึก',
    btnDontSave: 'ไม่บันทึก',
    btnCancel: 'ยกเลิก',
  },
  id: {
    dlgSaveTitle: 'Simpan dokumen Hangul',
    filterHangul: 'Dokumen Hangul',
    untitledFile: 'Tanpa judul',
    closeUnsavedMsg: 'Dokumen ini memiliki perubahan yang belum disimpan.',
    closeUnsavedDetail: 'Simpan sebelum menutup?',
    btnSave: 'Simpan',
    btnDontSave: 'Jangan Simpan',
    btnCancel: 'Batal',
  },
  ru: {
    dlgSaveTitle: 'Сохранить документ Hangul',
    filterHangul: 'Документы Hangul',
    untitledFile: 'Без названия',
    closeUnsavedMsg: 'В этом документе есть несохранённые изменения.',
    closeUnsavedDetail: 'Сохранить их перед закрытием?',
    btnSave: 'Сохранить',
    btnDontSave: 'Не сохранять',
    btnCancel: 'Отмена',
  },
  ar: {
    dlgSaveTitle: 'حفظ مستند Hangul',
    filterHangul: 'مستندات Hangul',
    untitledFile: 'بدون عنوان',
    closeUnsavedMsg: 'يحتوي هذا المستند على تغييرات غير محفوظة.',
    closeUnsavedDetail: 'هل تريد حفظها قبل الإغلاق؟',
    btnSave: 'حفظ',
    btnDontSave: 'عدم الحفظ',
    btnCancel: 'إلغاء',
  },
  pt: {
    dlgSaveTitle: 'Salvar documento Hangul',
    filterHangul: 'Documentos Hangul',
    untitledFile: 'Sem título',
    closeUnsavedMsg: 'Este documento tem alterações não salvas.',
    closeUnsavedDetail: 'Deseja salvá-las antes de fechar?',
    btnSave: 'Salvar',
    btnDontSave: 'Não Salvar',
    btnCancel: 'Cancelar',
  },
  it: {
    dlgSaveTitle: 'Salva documento Hangul',
    filterHangul: 'Documenti Hangul',
    untitledFile: 'Senza titolo',
    closeUnsavedMsg: 'Questo documento contiene modifiche non salvate.',
    closeUnsavedDetail: 'Vuoi salvarle prima di chiudere?',
    btnSave: 'Salva',
    btnDontSave: 'Non salvare',
    btnCancel: 'Annulla',
  },
  pl: {
    dlgSaveTitle: 'Zapisz dokument Hangul',
    filterHangul: 'Dokumenty Hangul',
    untitledFile: 'Bez tytułu',
    closeUnsavedMsg: 'Ten dokument ma niezapisane zmiany.',
    closeUnsavedDetail: 'Czy zapisać je przed zamknięciem?',
    btnSave: 'Zapisz',
    btnDontSave: 'Nie zapisuj',
    btnCancel: 'Anuluj',
  },
  nl: {
    dlgSaveTitle: 'Hangul-document opslaan',
    filterHangul: 'Hangul-documenten',
    untitledFile: 'Naamloos',
    closeUnsavedMsg: 'Dit document bevat niet-opgeslagen wijzigingen.',
    closeUnsavedDetail: 'Wilt u ze opslaan voordat u sluit?',
    btnSave: 'Opslaan',
    btnDontSave: 'Niet opslaan',
    btnCancel: 'Annuleren',
  },
  ms: {
    dlgSaveTitle: 'Simpan dokumen Hangul',
    filterHangul: 'Dokumen Hangul',
    untitledFile: 'Tanpa tajuk',
    closeUnsavedMsg: 'Dokumen ini mempunyai perubahan yang belum disimpan.',
    closeUnsavedDetail: 'Simpan sebelum menutup?',
    btnSave: 'Simpan',
    btnDontSave: 'Jangan Simpan',
    btnCancel: 'Batal',
  },
  he: {
    dlgSaveTitle: 'שמירת מסמך Hangul',
    filterHangul: 'מסמכי Hangul',
    untitledFile: 'ללא שם',
    closeUnsavedMsg: 'במסמך הזה יש שינויים שלא נשמרו.',
    closeUnsavedDetail: 'האם לשמור אותם לפני הסגירה?',
    btnSave: 'שמירה',
    btnDontSave: 'אל תשמור',
    btnCancel: 'ביטול',
  },
  hi: {
    dlgSaveTitle: 'Hangul दस्तावेज़ सहेजें',
    filterHangul: 'Hangul दस्तावेज़',
    untitledFile: 'शीर्षकहीन',
    closeUnsavedMsg: 'इस दस्तावेज़ में सहेजे नहीं गए परिवर्तन हैं।',
    closeUnsavedDetail: 'क्या बंद करने से पहले उन्हें सहेजना चाहते हैं?',
    btnSave: 'सहेजें',
    btnDontSave: 'न सहेजें',
    btnCancel: 'रद्द करें',
  },
  'zh-TW': {
    dlgSaveTitle: '儲存 Hangul 文件',
    filterHangul: 'Hangul 文件',
    untitledFile: '未命名文件',
    closeUnsavedMsg: '此文件有未儲存的變更。',
    closeUnsavedDetail: '關閉前是否儲存？',
    btnSave: '儲存',
    btnDontSave: '不儲存',
    btnCancel: '取消',
  },
})
type DlgKey =
  | 'dlgSaveTitle'
  | 'filterHangul'
  | 'untitledFile'
  | 'closeUnsavedMsg'
  | 'closeUnsavedDetail'
  | 'btnSave'
  | 'btnDontSave'
  | 'btnCancel'
const tm = (key: DlgKey) => tDlg(getUiLang(), key)

interface RuntimePaths {
  preloadPath: string
  rendererUrl?: string
  rendererFile?: string
  /**
   * Absolute path to the bundled, offline rhwp-studio build directory
   * (index.html + assets). Served over an app-local loopback origin; never a CDN.
   */
  studioDir: string
}

let runtime: RuntimePaths = { preloadPath: '', studioDir: '' }

export function configureHangulRuntime(paths: RuntimePaths): void {
  runtime = paths
}

/** Open path per view, queued at tab creation; the renderer consumes it after mount. */
const openPathByWc = new Map<number, string>()
/** File paths granted to each view — readBytes/save only allow these */
const allowedByWc = new Map<number, Set<string>>()
/** Current save target per view; absent = untitled document */
const savePathByWc = new Map<number, string>()
/** Unsaved-changes flags mirrored from the renderer; drives the save prompt */
const dirtyByWc = new Set<number>()
const closeSaveWaiters = new Map<number, (ok: boolean) => void>()
/** Resolvers for menu-triggered saves, resolved when the renderer's save invoke completes */
const saveWaiters = new Map<number, (ok: boolean) => void>()

/** Fired after a save lands on a NEW path (untitled first save / Save As) — the shell syncs tab title, recents, projects */
let fileSavedHook: ((wc: WebContents, path: string) => void) | null = null

export function setHangulFileSavedHook(hook: (wc: WebContents, path: string) => void): void {
  fileSavedHook = hook
}

/**
 * Start (idempotently) serving the bundled offline studio and return its
 * loopback origin, or null when the bundle is unavailable. Never a CDN.
 */
async function ensureStudioOrigin(): Promise<string | null> {
  if (!runtime.studioDir) return null
  try {
    return await serveHangulStudio(runtime.studioDir)
  } catch (err) {
    console.warn('[hangul] offline studio unavailable:', err)
    return null
  }
}

export function hangulIsDirty(webContentsId: number): boolean {
  return dirtyByWc.has(webContentsId)
}

export function hangulFilePath(webContentsId: number): string | undefined {
  return savePathByWc.get(webContentsId)
}

/** The file was renamed on disk — re-grant the new path and tell the renderer */
export function hangulFileRenamed(contents: WebContents, oldPath: string, newPath: string): void {
  const wcId = contents.id
  if (savePathByWc.get(wcId) === oldPath) savePathByWc.set(wcId, newPath)
  if (openPathByWc.get(wcId) === oldPath) openPathByWc.set(wcId, newPath)
  const allowed = allowedByWc.get(wcId)
  if (allowed?.has(oldPath)) allowed.add(newPath)
  if (!contents.isDestroyed()) contents.send(HANGUL_CHANNELS.fileRenamed, newPath)
}

/**
 * Close guard: true means proceed with closing. Clean → true; dirty →
 * Save / Don't Save / Cancel. On Save, ask the renderer to export via rhwp and
 * write, then await the result; a canceled untitled-save keeps the tab open.
 */
export async function requestHangulClose(
  contents: WebContents,
  parent?: BrowserWindow | null,
): Promise<boolean> {
  if (!dirtyByWc.has(contents.id) || contents.isDestroyed()) return true
  const options = {
    type: 'warning' as const,
    message: tm('closeUnsavedMsg'),
    detail: tm('closeUnsavedDetail'),
    buttons: [tm('btnSave'), tm('btnDontSave'), tm('btnCancel')],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  }
  const { response } =
    parent && !parent.isDestroyed()
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)
  if (response === 2) return false
  if (response === 1) return true
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      closeSaveWaiters.delete(contents.id)
      resolve(false)
    }, 120_000)
    closeSaveWaiters.set(contents.id, (ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
    contents.send(HANGUL_CHANNELS.closeSaveRequest)
  })
}

/** Menu Save / Save As: ask the renderer to export via rhwp and save; clean views resolve true immediately on plain save */
export function requestHangulSave(contents: WebContents, mode: SaveMode): Promise<boolean> {
  if (contents.isDestroyed()) return Promise.resolve(false)
  if (mode === 'save' && !dirtyByWc.has(contents.id) && savePathByWc.has(contents.id)) {
    return Promise.resolve(true)
  }
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      saveWaiters.delete(contents.id)
      resolve(false)
    }, 120_000)
    saveWaiters.set(contents.id, (ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
    contents.send(HANGUL_CHANNELS.saveRequest, mode)
  })
}

const HANGUL_EXT_BY_FORMAT: Record<HangulFormat, string> = { hwp: 'hwp', hwpx: 'hwpx' }

async function resolveSaveTarget(
  e: Electron.IpcMainInvokeEvent,
  mode: SaveMode,
  format: HangulFormat,
): Promise<string | null | 'canceled'> {
  const current = savePathByWc.get(e.sender.id)
  if (mode === 'save' && current) return current
  const win =
    BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
  const ext = HANGUL_EXT_BY_FORMAT[format]
  const defaultPath = current
    ? join(dirname(current), basename(current))
    : join(configuredDefaultSaveDir(app), `${tm('untitledFile')}.${ext}`)
  const picked = await showSaveDialogWithMemory(dialog, win, {
    title: tm('dlgSaveTitle'),
    defaultPath,
    filters: [{ name: tm('filterHangul'), extensions: ['hwp', 'hwpx'] }],
  })
  if (picked.canceled || !picked.filePath) return 'canceled'
  return picked.filePath
}

let ipcRegistered = false

function registerHangulIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle(HANGUL_CHANNELS.studioOrigin, () => ensureStudioOrigin())

  ipcMain.handle(HANGUL_CHANNELS.consumePending, (e) => openPathByWc.get(e.sender.id) ?? null)

  ipcMain.handle(
    HANGUL_CHANNELS.readBytes,
    async (e, path: unknown): Promise<HangulDocumentBytes> => {
      if (typeof path !== 'string' || !allowedByWc.get(e.sender.id)?.has(path)) {
        throw new Error('hangul: path not granted to this view')
      }
      const bytes = await readFile(path)
      return { base64: bytes.toString('base64'), fileName: basename(path) }
    },
  )

  ipcMain.handle(
    HANGUL_CHANNELS.save,
    async (e, request: SaveHangulRequest): Promise<SaveHangulResult> => {
      const waiter = saveWaiters.get(e.sender.id)
      saveWaiters.delete(e.sender.id)
      const done = (result: SaveHangulResult): SaveHangulResult => {
        waiter?.(result.ok && !('canceled' in result))
        return result
      }
      if (typeof request?.base64 !== 'string' || !request.base64) {
        return done({ ok: false, error: 'hangul: bad save request' })
      }
      const format: HangulFormat = request.format === 'hwpx' ? 'hwpx' : 'hwp'
      const mode: SaveMode = request.mode === 'saveAs' ? 'saveAs' : 'save'
      try {
        const target = await resolveSaveTarget(e, mode, format)
        if (target === 'canceled') return done({ ok: true, canceled: true })
        if (!target) return done({ ok: false, error: 'hangul: no save target' })
        const currentPath = savePathByWc.get(e.sender.id)
        const isNewPath = currentPath !== target
        await atomicWriteFile(target, Buffer.from(request.base64, 'base64'))
        savePathByWc.set(e.sender.id, target)
        openPathByWc.set(e.sender.id, target)
        const allowed = allowedByWc.get(e.sender.id) ?? new Set<string>()
        allowed.add(target)
        allowedByWc.set(e.sender.id, allowed)
        dirtyByWc.delete(e.sender.id)
        if (isNewPath) fileSavedHook?.(e.sender, target)
        return done({ ok: true, path: target })
      } catch (err) {
        return done({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  ipcMain.on(HANGUL_CHANNELS.dirtyChanged, (e, dirty: unknown) => {
    if (dirty === true) dirtyByWc.add(e.sender.id)
    else dirtyByWc.delete(e.sender.id)
  })

  ipcMain.on(HANGUL_CHANNELS.closeSaveResult, (e, ok: unknown) => {
    const waiter = closeSaveWaiters.get(e.sender.id)
    closeSaveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  // safety net for menu saves the renderer declined without invoking save()
  ipcMain.on(HANGUL_CHANNELS.saveRequestAck, (e, ok: unknown) => {
    const waiter = saveWaiters.get(e.sender.id)
    saveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  // Language channel shared with other modules; removeHandler tolerates duplicate registration
  ipcMain.removeHandler(HANGUL_CHANNELS.getLanguage)
  ipcMain.handle(HANGUL_CHANNELS.getLanguage, () => getUiLang())
}

function grantAndTrack(wc: WebContents, openPath?: string | null): void {
  const wcId = wc.id
  if (openPath && existsSync(openPath)) {
    openPathByWc.set(wcId, openPath)
    savePathByWc.set(wcId, openPath)
    allowedByWc.set(wcId, new Set([openPath]))
  }
  wc.setWindowOpenHandler(({ url }) => {
    const target = safeExternalUrl(url, { allowedProtocols: ['http:', 'https:', 'mailto:'] })
    if (target) void shell.openExternal(target)
    return { action: 'deny' }
  })
  wc.once('destroyed', () => {
    openPathByWc.delete(wcId)
    allowedByWc.delete(wcId)
    savePathByWc.delete(wcId)
    dirtyByWc.delete(wcId)
    closeSaveWaiters.get(wcId)?.(false)
    closeSaveWaiters.delete(wcId)
    saveWaiters.get(wcId)?.(false)
    saveWaiters.delete(wcId)
  })
}

export function createHangulView(openPath?: string | null): WebContentsView {
  registerHangulIpc()
  // Warm the offline studio origin so the renderer's first studioOrigin() is instant.
  void ensureStudioOrigin()
  const view = new WebContentsView({
    webPreferences: {
      preload: runtime.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  grantAndTrack(view.webContents, openPath)
  if (runtime.rendererUrl) void view.webContents.loadURL(runtime.rendererUrl)
  else if (runtime.rendererFile) void view.webContents.loadFile(runtime.rendererFile)
  return view
}

/** Stop the offline studio server (shell quit hook). */
export async function teardownHangul(): Promise<void> {
  await stopHangulStudio()
}

/** Standalone window mode: `npm run dev -w @genoffice/hangul`, hwp path passed via argv */
export function startHangulStandalone(): void {
  installNavigationGuard(app)
  installContextMenu(app, () => contextMenuLabels(getUiLang()))
  configureHangulRuntime({
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(__dirname, '../renderer/index.html'),
    studioDir: join(__dirname, '../../resources/rhwp-studio'),
  })
  void app.whenReady().then(() => {
    registerHangulIpc()
    const win = new BrowserWindow({
      width: 1200,
      height: 850,
      webPreferences: {
        preload: runtime.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    const argPath = process.argv.slice(1).find((a) => /\.(hwp|hwpx)$/i.test(a) && existsSync(a))
    grantAndTrack(win.webContents, argPath)
    if (runtime.rendererUrl) void win.loadURL(runtime.rendererUrl)
    else if (runtime.rendererFile) void win.loadFile(runtime.rendererFile)
  })
  app.on('window-all-closed', () => {
    void stopHangulStudio().finally(() => app.quit())
  })
}

/** Which format a document path names, defaulting to hwp. */
export function hangulFormatOf(fileName: string): HangulFormat {
  return extname(fileName).toLowerCase() === '.hwpx' ? 'hwpx' : 'hwp'
}
