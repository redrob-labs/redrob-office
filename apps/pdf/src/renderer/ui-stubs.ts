// UI-ONLY BUILD: the pdf renderer reached the Electron main process through
// window.pdfApi (read/save bytes, page ops, OCR, font checks, signatures, AI).
// PDF.js renders pages client-side, so the VIEWER works standalone; only the
// backend operations (save, page edits, OCR, export, convert, AI) are stubbed
// to inert "unavailable" results here. Imported first in main.tsx.
import type { PdfApi } from '../shared/ipc'
import { defaultAiSettings } from '@genoffice/ai-provider'

const unsub = (): (() => void) => () => {}
const err = (error: string) => ({ ok: false as const, error })

const pdfApi: PdfApi = {
  consumePending: async () => null,
  readFile: async () => new ArrayBuffer(0),
  save: async () => err('save unavailable in UI-only build'),
  autoRename: async () => ({ renamed: false }),
  isUntitled: async () => false,
  validateTextEdits: async (req) => req.edits.map(() => ({ reason: 'unavailable in UI-only build' })),
  listEditFonts: async () => [],
  canDrawText: async () => false,
  listPageImages: async () => [],
  listStaticFormFills: async () => [],
  ocrPage: async () => null,
  pageImagePng: async () => null,
  pagePreviewPng: async () => null,
  extractPages: async () => err('unavailable in UI-only build'),
  insertPdf: async () => err('unavailable in UI-only build'),
  insertBlankPage: async () => err('unavailable in UI-only build'),
  splitPdf: async () => err('unavailable in UI-only build'),
  mergePdf: async () => err('unavailable in UI-only build'),
  mergePages: async () => err('unavailable in UI-only build'),
  replacePages: async () => err('unavailable in UI-only build'),
  setPageSize: async () => err('unavailable in UI-only build'),
  splitPages: async () => err('unavailable in UI-only build'),
  cropPages: async () => err('unavailable in UI-only build'),
  exportImages: async () => err('unavailable in UI-only build'),
  convertOffice: async () => {},
  createDocument: async () => ({ ok: false, error: 'unavailable in UI-only build' }),
  imageSearch: async () => ({ images: [], method: 'error', error: 'unavailable in UI-only build' }),
  fetchImage: async () => null,
  generateImage: async () => ({ error: 'unavailable in UI-only build' }),
  listSavedSignatures: async () => [],
  addSavedSignature: async () => [],
  removeSavedSignature: async () => [],
  getUsername: async () => '',
  setDirty: () => {},
  onCloseSaveRequest: () => unsub(),
  sendCloseSaveResult: () => {},
  onSaveAsRequest: () => unsub(),
  sendSaveAsResult: () => {},
  onSaveAsFlow: () => unsub(),
  onPrintRequest: () => unsub(),
  getLanguage: async () => 'en',
  onLanguageChanged: () => unsub(),
  getTheme: async () => 'system',
  onThemeChanged: () => unsub(),
  onChromePressed: () => unsub(),
  getAiSettings: async () => defaultAiSettings(),
  gskStatus: async () => ({ loggedIn: false }),
  aiStream: async () => {},
  aiStreamCancel: async () => {},
  insightsFact: () => {},
  onAiStream: () => unsub(),
}

export function installUiStubs(): void {
  const w = window as unknown as Record<string, unknown>
  if (!w.pdfApi) w.pdfApi = pdfApi
}

installUiStubs()
