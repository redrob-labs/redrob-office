// UI-ONLY BUILD: the markdown renderer reached the Electron main process through
// window.markdownApi (file read/save, image pick, DOCX/PDF export, AI stream,
// web/image search) and the optional window.projectApi. Those bridges and the
// main process are removed; this installs inert, type-correct stand-ins so the
// editor runs in the browser against an in-memory document. File I/O, export,
// search and AI are no-ops or surface the unavailable path. Imported first in
// main.tsx.
import type { MarkdownApi } from '../shared/ipc'
import type { ProjectApi } from '@genoffice/project-store'
import { DEFAULT_OFFICE_PREFS, type OfficePrefs } from '@genoffice/electron-utils/office-prefs'
import { defaultAiSettings } from '@genoffice/ai-provider'

const unsub = (): (() => void) => () => {}
let prefs: OfficePrefs = { ...DEFAULT_OFFICE_PREFS }

const markdownApi: MarkdownApi = {
  // OfficePrefsApi
  getOfficePrefs: async () => ({ ...prefs }),
  setOfficePrefs: async (patch) => {
    prefs = { ...prefs, ...patch }
    return { ...prefs }
  },
  onOfficePrefsChanged: () => unsub(),
  // document
  consumePending: async () => null,
  readFile: async () => '',
  save: async () => ({ ok: true as const, canceled: true as const }),
  setDirty: () => {},
  onSaveRequest: () => unsub(),
  sendSaveRequestAck: () => {},
  onCloseSaveRequest: () => unsub(),
  sendCloseSaveResult: () => {},
  onFileRenamed: () => unsub(),
  pickImage: async () => null,
  saveImage: async () => null,
  readImage: async () => null,
  onExportRequest: () => unsub(),
  onPrintRequest: () => unsub(),
  exportDocx: async () => ({ ok: false as const, error: 'export unavailable in UI-only build' }),
  exportPdf: async () => ({ ok: false as const, error: 'export unavailable in UI-only build' }),
  getLanguage: async () => 'en',
  onLanguageChanged: () => unsub(),
  getTheme: async () => 'system',
  onThemeChanged: () => unsub(),
  onChromePressed: () => unsub(),
  // AI (transport removed)
  getAiSettings: async () => defaultAiSettings(),
  aiStream: async () => {},
  aiStreamCancel: async () => {},
  insightsFact: () => {},
  onAiStream: () => unsub(),
  webSearch: async () => ({ results: [], method: 'error', error: 'unavailable in UI-only build' }),
  imageSearch: async () => ({ images: [], method: 'error', error: 'unavailable in UI-only build' }),
  fetchImage: async () => null,
  aiGenerateImage: async () => ({ error: 'unavailable in UI-only build' }),
}

const projectApi: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'> = {
  resolveChat: async () => ({ projectId: 'ui-stub', chatId: 'ui-stub' }),
  appendChat: async () => {},
  loadChat: async () => [],
  rebindChat: async () => ({ projectId: 'ui-stub', chatId: 'ui-stub' }),
}

export function installUiStubs(): void {
  const w = window as unknown as Record<string, unknown>
  if (!w.markdownApi) w.markdownApi = markdownApi
  if (!w.projectApi) w.projectApi = projectApi
}

installUiStubs()
