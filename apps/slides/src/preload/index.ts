import { liveBridge, shareBridge } from '@genoffice/sync-client'
import { SLIDES_CHANNELS } from '../shared/ipc'
import { factsBridge } from '@genoffice/facts'
import { versionsBridge } from '@genoffice/versions'
import { officePrefsBridge } from '@genoffice/electron-utils/office-prefs'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { RenderSlide } from '@genoffice/pptx-render'
import type { ProjectApi } from '@genoffice/project-store'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import type {
  AddChartOp,
  AddElementOp,
  AiRunFailure,
  ApplyEditScriptOp,
  ApplyTxnOp,
  AddImageBytesOp,
  AddInkOp,
  AddMediaBytesOp,
  ReplacePictureBytesOp,
  AddSmartArtOp,
  ApplyThemeOp,
  AddBlankSlideOp,
  AddSlideOp,
  PasteSlideOp,
  RepasteSlideOp,
  AddSlideWithLayoutOp,
  AddTableOp,
  HeaderFooterOp,
  SetLinkOp,
  AiSettings,
  CopyElementsOp,
  PasteElementsOp,
  DuplicateElementsOp,
  EditTableCellOp,
  EditTableStyleOp,
  EditChartOp,
  EditPictureSrcRectOp,
  EditPictureOpacityOp,
  GroupElementsOp,
  UngroupElementOp,
  BatchEditTransformOp,
  SetTableColWidthOp,
  SetTableRowHeightOp,
  SetTableCellAnchorOp,
  TableStructureIpcOp,
  TableMergeIpcOp,
  ReorderElementOp,
  SetAdvanceTimesOp,
  SetAnimationsOp,
  SetSlideHiddenOp,
  ShowSettings,
  AddNarrationOp,
  SetTransitionOp,
  SectionInfo,
  AddSectionOp,
  RenameSectionOp,
  RemoveSectionOp,
  MoveSectionOp,
  MoveSlideOp,
  AiStreamChunk,
  AiStreamRequest,
  AudienceNavAction,
  ShowInkEvent,
  ShowSyncState,
  DeleteElementOp,
  DesktopFilesApi,
  EditBackgroundOp,
  EditFillOp,
  EditFillImageOp,
  EditStrokeOp,
  FlipElementOp,
  EditTextOp,
  EditTransformOp,
  EditConnectorEndpointsOp,
  SetElementFontOp,
  SetElementParagraphFormatOp,
  FindReplaceOp,
  SetSlideLayoutOp,
  SetSlideSizeOp,
  MasterEditTextOp,
  MasterEditTransformOp,
  MasterEditFillOp,
  MasterEditStrokeOp,
  MasterDeleteElementOp,
  ExportImagesOp,
  ExportPdfOp,
  PrintSlidesOp,
  MenuCommand,
  OpenResult,
  SlidesApi,
  UiTheme,
  SetEffectsPatch,
} from '../shared/ipc'

const api: SlidesApi = {
  // shell-owned version history and last visits (apps/shell/src/main/versions-service.ts)
  ...versionsBridge(ipcRenderer),
  // shell-owned sharing (apps/shell/src/main/share-service.ts)
  ...shareBridge(ipcRenderer),
  // shell-owned live rooms (apps/shell/src/main/live-service.ts): the token stays in main
  ...liveBridge(ipcRenderer),
  ...officePrefsBridge(ipcRenderer),
  getLanguage: () => ipcRenderer.invoke(SLIDES_CHANNELS.appGetLanguage),
  // owned by the shell (apps/shell/src/main/ask-prompt.ts); null outside the suite
  consumeAskPrompt: () => ipcRenderer.invoke(SLIDES_CHANNELS.appConsumeAskPrompt).catch(() => null),
  onLanguageChanged: (handler) => {
    const listener = (
      _event: IpcRendererEvent,
      lang: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'th' | 'id' | 'ru' | 'ar',
    ) => handler(lang)
    ipcRenderer.on(SLIDES_CHANNELS.appLanguageChanged, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.appLanguageChanged, listener)
  },
  getTheme: () => ipcRenderer.invoke(SLIDES_CHANNELS.appGetTheme),
  onThemeChanged: (handler) => {
    const listener = (_event: IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on(SLIDES_CHANNELS.appThemeChanged, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.appThemeChanged, listener)
  },
  onChromePressed: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(SLIDES_CHANNELS.appChromePressed, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.appChromePressed, listener)
  },
  setShowFullScreen: (on) => ipcRenderer.invoke(SLIDES_CHANNELS.showFullscreen, on),
  privateFontFaces: () => ipcRenderer.invoke(SLIDES_CHANNELS.privateFontFaces),
  privateFontData: (id) => ipcRenderer.invoke(SLIDES_CHANNELS.privateFontData, id),
  fontCatalog: () => ipcRenderer.invoke(SLIDES_CHANNELS.fontCatalog),
  fontDownload: (family) => ipcRenderer.invoke(SLIDES_CHANNELS.fontDownload, family),
  fontInstallLocal: () => ipcRenderer.invoke(SLIDES_CHANNELS.fontInstallLocal),
  fontMissing: () => ipcRenderer.invoke(SLIDES_CHANNELS.fontMissing),
  onFontsChanged: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(SLIDES_CHANNELS.fontsChanged, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.fontsChanged, listener)
  },
  openPptx: (fitWidthPx) => ipcRenderer.invoke(SLIDES_CHANNELS.open, fitWidthPx),
  openPptxPath: (path, fitWidthPx) => ipcRenderer.invoke(SLIDES_CHANNELS.openPath, path, fitWidthPx),
  consumePendingOpen: (fitWidthPx) => ipcRenderer.invoke(SLIDES_CHANNELS.consumePendingOpen, fitWidthPx),
  newBlank: (fitWidthPx) => ipcRenderer.invoke(SLIDES_CHANNELS.newBlank, fitWidthPx),
  landGeneratedPages: (
    pageMarkers: string[],
    fitWidthPx: number,
    mode?: 'replace' | 'append' | 'replace_at' | 'insert_at',
    atIndex?: number,
    deckName?: string,
  ) =>
    ipcRenderer.invoke(
      SLIDES_CHANNELS.landGeneratedPages,
      pageMarkers,
      fitWidthPx,
      mode,
      atIndex,
      deckName,
    ),
  localGeneratePage: (op: { specJson: string }) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.localPageGenerate, op),
  editText: (op: EditTextOp) => ipcRenderer.invoke(SLIDES_CHANNELS.editText, op),
  liveAddress: (op: { slideIndex: number; sourceId: string; groupId?: string }) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.liveAddress, op),
  liveApplyText: (edit: { slideId: string; shapeId: string; paragraphs: unknown[] }) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.liveApplyText, edit),
  setElementFont: (op: SetElementFontOp) => ipcRenderer.invoke(SLIDES_CHANNELS.setElementFont, op),
  setElementParagraphFormat: (op: SetElementParagraphFormatOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.setElementParagraphFormat, op),
  findReplace: (op: FindReplaceOp) => ipcRenderer.invoke(SLIDES_CHANNELS.findReplace, op),
  setSlideLayout: (op: SetSlideLayoutOp) => ipcRenderer.invoke(SLIDES_CHANNELS.setSlideLayout, op),
  setSlideSize: (op: SetSlideSizeOp) => ipcRenderer.invoke(SLIDES_CHANNELS.setSlideSize, op),
  getSlideSize: () => ipcRenderer.invoke(SLIDES_CHANNELS.getSlideSize),
  editTransform: (op: EditTransformOp) => ipcRenderer.invoke(SLIDES_CHANNELS.editTransform, op),
  editConnectorEndpoints: (op: EditConnectorEndpointsOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.editConnectorEndpoints, op),
  editPictureSrcRect: (op: EditPictureSrcRectOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.editPictureSrcRect, op),
  editPictureOpacity: (op: EditPictureOpacityOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.editPictureOpacity, op),
  editImageFill: (op: EditFillImageOp) => ipcRenderer.invoke(SLIDES_CHANNELS.editImageFill, op),
  changeShape: (op: { slideIndex: number; sourceId: string; prst: string; groupId?: string }) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.changeShape, op),
  setShapeAdjust: (op: {
    slideIndex: number
    sourceId: string
    adjust: Record<string, number>
    groupId?: string
    preview?: boolean
  }) => ipcRenderer.invoke(SLIDES_CHANNELS.setShapeAdjust, op),
  setTextAnchor: (op: {
    slideIndex: number
    sourceId: string
    anchor: 'top' | 'middle' | 'bottom'
  }) => ipcRenderer.invoke(SLIDES_CHANNELS.setTextAnchor, op),
  setTextBodyProps: (op: {
    slideIndex: number
    sourceId: string
    props: {
      vert?: 'horz' | 'eaVert' | 'vert' | 'vert270' | 'wordArtVert'
      autofit?: 'none' | 'shrink' | 'resize'
      insets?: Partial<{ l: number; t: number; r: number; b: number }>
      wrap?: boolean
    }
  }) => ipcRenderer.invoke(SLIDES_CHANNELS.setTextBodyProps, op),
  setEffects: (op: { slideIndex: number; sourceId: string; effects: SetEffectsPatch }) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.setEffects, op),
  clipboardExternal: () => ipcRenderer.invoke(SLIDES_CHANNELS.clipboardExternal),
  groupElements: (op: GroupElementsOp) => ipcRenderer.invoke(SLIDES_CHANNELS.groupElements, op),
  ungroupElement: (op: UngroupElementOp) => ipcRenderer.invoke(SLIDES_CHANNELS.ungroupElement, op),
  batchEditTransform: (op: BatchEditTransformOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.batchEditTransform, op),
  getRenderSlides: () => ipcRenderer.invoke(SLIDES_CHANNELS.getRenderSlides),
  addElement: (op: AddElementOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addElement, op),
  deleteElement: (op: DeleteElementOp) => ipcRenderer.invoke(SLIDES_CHANNELS.deleteElement, op),
  addSlide: (op: AddSlideOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addSlide, op),
  addBlankSlide: (op: AddBlankSlideOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addBlankSlide, op),
  addSlideWithLayout: (op: AddSlideWithLayoutOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.addSlideWithLayout, op),
  getLayouts: () => ipcRenderer.invoke(SLIDES_CHANNELS.getLayouts),
  masterEnter: (fitWidthPx: number) => ipcRenderer.invoke(SLIDES_CHANNELS.masterEnter, fitWidthPx),
  masterOpen: (partPath: string) => ipcRenderer.invoke(SLIDES_CHANNELS.masterOpen, partPath),
  masterClose: () => ipcRenderer.invoke(SLIDES_CHANNELS.masterClose),
  masterEditText: (op: MasterEditTextOp) => ipcRenderer.invoke(SLIDES_CHANNELS.masterEditText, op),
  masterEditTransform: (op: MasterEditTransformOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.masterEditTransform, op),
  masterEditFill: (op: MasterEditFillOp) => ipcRenderer.invoke(SLIDES_CHANNELS.masterEditFill, op),
  masterEditStroke: (op: MasterEditStrokeOp) => ipcRenderer.invoke(SLIDES_CHANNELS.masterEditStroke, op),
  masterDeleteElement: (op: MasterDeleteElementOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.masterDeleteElement, op),
  editFill: (op: EditFillOp) => ipcRenderer.invoke(SLIDES_CHANNELS.editFill, op),
  editStroke: (op: EditStrokeOp) => ipcRenderer.invoke(SLIDES_CHANNELS.editStroke, op),
  flipElements: (op: FlipElementOp) => ipcRenderer.invoke(SLIDES_CHANNELS.flipElements, op),
  editBackground: (op: EditBackgroundOp) => ipcRenderer.invoke(SLIDES_CHANNELS.editBackground, op),
  insertImage: (slideIndex: number, fitWidthPx: number) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.insertImage, slideIndex, fitWidthPx),
  copySlide: (slideIndex: number, pngBase64?: string) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.copySlide, slideIndex, pngBase64),
  pasteSlide: (op: PasteSlideOp) => ipcRenderer.invoke(SLIDES_CHANNELS.pasteSlide, op),
  repasteSlide: (op: RepasteSlideOp) => ipcRenderer.invoke(SLIDES_CHANNELS.repasteSlide, op),
  hasSlideClipboard: () => ipcRenderer.invoke(SLIDES_CHANNELS.hasSlideClipboard),
  clipboardProbe: () => ipcRenderer.invoke(SLIDES_CHANNELS.clipboardProbe),
  deleteSlide: (slideIndex: number) => ipcRenderer.invoke(SLIDES_CHANNELS.deleteSlide, slideIndex),
  reorderElement: (op: ReorderElementOp) => ipcRenderer.invoke(SLIDES_CHANNELS.reorderElement, op),
  editTableCell: (op: EditTableCellOp) => ipcRenderer.invoke(SLIDES_CHANNELS.editTableCell, op),
  tableStructure: (op: TableStructureIpcOp) => ipcRenderer.invoke(SLIDES_CHANNELS.tableStructure, op),
  tableMerge: (op: TableMergeIpcOp) => ipcRenderer.invoke(SLIDES_CHANNELS.tableMerge, op),
  setTableColWidth: (op: SetTableColWidthOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.setTableColWidth, op),
  setTableRowHeight: (op: SetTableRowHeightOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.setTableRowHeight, op),
  setTableCellAnchor: (op: SetTableCellAnchorOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.setTableCellAnchor, op),
  editTableStyle: (op: EditTableStyleOp) => ipcRenderer.invoke(SLIDES_CHANNELS.editTableStyle, op),
  editChart: (op: EditChartOp) => ipcRenderer.invoke(SLIDES_CHANNELS.editChart, op),
  getChartColorSchemes: () => ipcRenderer.invoke(SLIDES_CHANNELS.chartColorSchemes),
  getChartData: (slideIndex: number, sourceId: string) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.getChartData, slideIndex, sourceId),
  copyElements: (op: CopyElementsOp) => ipcRenderer.invoke(SLIDES_CHANNELS.copyElements, op),
  pasteElements: (op: PasteElementsOp) => ipcRenderer.invoke(SLIDES_CHANNELS.pasteElements, op),
  duplicateElements: (op: DuplicateElementsOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.duplicateElements, op),
  addTable: (op: AddTableOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addTable, op),
  addInk: (op: AddInkOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addInk, op),
  addChart: (op: AddChartOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addChart, op),
  addSmartArt: (op: AddSmartArtOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addSmartart, op),
  addImageBytes: (op: AddImageBytesOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addImageBytes, op),
  replacePictureBytes: (op: ReplacePictureBytesOp) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.replacePictureBytes, op),
  insertMedia: (slideIndex: number, kind: 'video' | 'audio', fitWidthPx: number) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.insertMedia, slideIndex, kind, fitWidthPx),
  addMediaBytes: (op: AddMediaBytesOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addMediaBytes, op),
  getMediaData: (slideIndex: number, sourceId: string) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.mediaData, slideIndex, sourceId),
  insertModel3d: (slideIndex: number, fitWidthPx: number) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.insertModel3d, slideIndex, fitWidthPx),
  setLink: (op: SetLinkOp) => ipcRenderer.invoke(SLIDES_CHANNELS.setLink, op),
  getLink: (slideIndex: number, sourceId: string) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.getLink, slideIndex, sourceId),
  getSlideLinks: (slideIndex: number) => ipcRenderer.invoke(SLIDES_CHANNELS.getSlideLinks, slideIndex),
  getRunLinks: (slideIndex: number) => ipcRenderer.invoke(SLIDES_CHANNELS.getRunLinks, slideIndex),
  applyHeaderFooter: (op: HeaderFooterOp) => ipcRenderer.invoke(SLIDES_CHANNELS.applyHeaderFooter, op),
  getHeaderFooter: (slideIndex: number) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.getHeaderFooter, slideIndex),
  applyTheme: (op: ApplyThemeOp) => ipcRenderer.invoke(SLIDES_CHANNELS.applyTheme, op),
  setTransition: (op: SetTransitionOp) => ipcRenderer.invoke(SLIDES_CHANNELS.setTransition, op),
  getTransition: (slideIndex: number) => ipcRenderer.invoke(SLIDES_CHANNELS.getTransition, slideIndex),
  setAdvanceTimes: (op: SetAdvanceTimesOp) => ipcRenderer.invoke(SLIDES_CHANNELS.setAdvanceTimes, op),
  getAdvanceTimes: () => ipcRenderer.invoke(SLIDES_CHANNELS.getAdvanceTimes),
  // shell-owned linked-figure index (apps/shell/src/main/facts-service.ts)
  ...factsBridge(ipcRenderer),
  linkedFigures: () => ipcRenderer.invoke(SLIDES_CHANNELS.linkedFigures),
  refreshLinkedFigures: (rewrites: Array<{ fact: string; part: 'figures' | 'sentence'; text: string }>) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.refreshLinkedFigures, rewrites),
  addNarration: (op: AddNarrationOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addNarration, op),
  getShowSettings: () => ipcRenderer.invoke(SLIDES_CHANNELS.getShowSettings),
  setShowSettings: (settings: ShowSettings) => ipcRenderer.invoke(SLIDES_CHANNELS.setShowSettings, settings),
  getAnimations: (slideIndex: number) => ipcRenderer.invoke(SLIDES_CHANNELS.getAnimations, slideIndex),
  getShapeKeys: (slideIndex: number) => ipcRenderer.invoke(SLIDES_CHANNELS.getShapeKeys, slideIndex),
  setAnimations: (op: SetAnimationsOp) => ipcRenderer.invoke(SLIDES_CHANNELS.setAnimations, op),
  setSlideHidden: (op: SetSlideHiddenOp) => ipcRenderer.invoke(SLIDES_CHANNELS.setHidden, op),
  getSections: () => ipcRenderer.invoke(SLIDES_CHANNELS.getSections),
  setSections: (sections: SectionInfo[]) => ipcRenderer.invoke(SLIDES_CHANNELS.setSections, sections),
  addSection: (op: AddSectionOp) => ipcRenderer.invoke(SLIDES_CHANNELS.addSection, op),
  renameSection: (op: RenameSectionOp) => ipcRenderer.invoke(SLIDES_CHANNELS.renameSection, op),
  removeSection: (op: RemoveSectionOp) => ipcRenderer.invoke(SLIDES_CHANNELS.removeSection, op),
  moveSection: (op: MoveSectionOp) => ipcRenderer.invoke(SLIDES_CHANNELS.moveSection, op),
  moveSlide: (op: MoveSlideOp) => ipcRenderer.invoke(SLIDES_CHANNELS.moveSlide, op),
  getNotes: (slideIndex: number) => ipcRenderer.invoke(SLIDES_CHANNELS.getNotes, slideIndex),
  setNotes: (op) => ipcRenderer.invoke(SLIDES_CHANNELS.setNotes, op),
  getComments: (slideIndex: number) => ipcRenderer.invoke(SLIDES_CHANNELS.getComments, slideIndex),
  addComment: (op) => ipcRenderer.invoke(SLIDES_CHANNELS.addComment, op),
  deleteComment: (op) => ipcRenderer.invoke(SLIDES_CHANNELS.deleteComment, op),
  nativeClipboard: (op: 'cut' | 'copy' | 'paste') =>
    ipcRenderer.invoke(SLIDES_CHANNELS.nativeClipboard, op),
  beginHistoryBatch: () => ipcRenderer.invoke(SLIDES_CHANNELS.historyBatchBegin),
  endHistoryBatch: () => ipcRenderer.invoke(SLIDES_CHANNELS.historyBatchEnd),
  applyEditScript: (op: ApplyEditScriptOp) => ipcRenderer.invoke(SLIDES_CHANNELS.applyEditScript, op),
  applyTxn: (op: ApplyTxnOp) => ipcRenderer.invoke(SLIDES_CHANNELS.applyTxn, op),
  aiSnapshotRestore: (id: number) => ipcRenderer.invoke(SLIDES_CHANNELS.aiSnapshotRestore, id),
  undo: () => ipcRenderer.invoke(SLIDES_CHANNELS.undo),
  redo: () => ipcRenderer.invoke(SLIDES_CHANNELS.redo),
  pickExportDir: () => ipcRenderer.invoke(SLIDES_CHANNELS.pickExportDir),
  exportImages: (op: ExportImagesOp) => ipcRenderer.invoke(SLIDES_CHANNELS.exportImages, op),
  pickExportPdfPath: (defaultName: string) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.pickExportPdfPath, defaultName),
  exportPdf: (op: ExportPdfOp) => ipcRenderer.invoke(SLIDES_CHANNELS.exportPdf, op),
  printSlides: (op: PrintSlidesOp) => ipcRenderer.invoke(SLIDES_CHANNELS.print, op),
  save: () => ipcRenderer.invoke(SLIDES_CHANNELS.save),
  saveAs: (defaultName: string) => ipcRenderer.invoke(SLIDES_CHANNELS.saveAs, defaultName),
  onCloseSaveRequest: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on(SLIDES_CHANNELS.closeSaveRequest, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.closeSaveRequest, listener)
  },
  onHistoryChanged: (handler: (state: { canUndo: boolean; canRedo: boolean }) => void) => {
    const listener = (_e: IpcRendererEvent, state: { canUndo: boolean; canRedo: boolean }) =>
      handler(state)
    ipcRenderer.on(SLIDES_CHANNELS.historyChanged, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.historyChanged, listener)
  },
  onDeckChanged: (
    handler: (state: { slides: RenderSlide[]; size: { cx: number; cy: number } }) => void,
  ) => {
    const listener = (
      _e: IpcRendererEvent,
      state: { slides: RenderSlide[]; size: { cx: number; cy: number } },
    ) => handler(state)
    ipcRenderer.on(SLIDES_CHANNELS.deckChanged, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.deckChanged, listener)
  },
  reportCloseSaveResult: (ok: boolean) => ipcRenderer.send(SLIDES_CHANNELS.closeSaveResult, ok === true),
  setAutoSavePref: (on: boolean) => ipcRenderer.send(SLIDES_CHANNELS.autosavePref, on === true),
  isDirty: () => ipcRenderer.invoke(SLIDES_CHANNELS.isDirty),
  getRecentFiles: () => ipcRenderer.invoke(SLIDES_CHANNELS.recent),
  onMenuCommand: (handler: (command: MenuCommand) => void) => {
    const listener = (_e: IpcRendererEvent, cmd: MenuCommand) => handler(cmd)
    ipcRenderer.on(SLIDES_CHANNELS.menu, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.menu, listener)
  },
  onOpened: (handler: (result: OpenResult) => void) => {
    const listener = (_e: IpcRendererEvent, result: OpenResult) => handler(result)
    ipcRenderer.on(SLIDES_CHANNELS.opened, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.opened, listener)
  },
  onRenamed: (handler: (newPath: string) => void) => {
    const listener = (_e: IpcRendererEvent, newPath: string) => handler(newPath)
    ipcRenderer.on(SLIDES_CHANNELS.renamed, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.renamed, listener)
  },
  getAiSettings: () => ipcRenderer.invoke(SLIDES_CHANNELS.aiGetSettings),
  setAiSettings: (settings: AiSettings) => ipcRenderer.invoke(SLIDES_CHANNELS.aiSetSettings, settings),
  aiStream: (request: AiStreamRequest) => ipcRenderer.invoke(SLIDES_CHANNELS.aiStream, request),
  aiStreamCancel: (requestId: string) => ipcRenderer.invoke(SLIDES_CHANNELS.aiStreamCancel, requestId),
  // what the selected model can take, as the engine reports it (registered by the suite's AI IPC)
  aiCapabilities: (model: string) => ipcRenderer.invoke(SLIDES_CHANNELS.aiCapabilities, model).catch(() => null),
  aiGskStatus: (withEmail?: boolean) => ipcRenderer.invoke(SLIDES_CHANNELS.aiGskStatus, withEmail),
  aiGskLogin: () => ipcRenderer.invoke(SLIDES_CHANNELS.aiGskLogin),
  aiLogRunFailure: (entry: AiRunFailure) => ipcRenderer.invoke(SLIDES_CHANNELS.aiLogRunFailure, entry),
  webSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.aiWebSearch, query, maxResults),
  imageSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.aiImageSearch, query, maxResults),
  insertImageUrl: (op: {
    slideIndex: number
    url: string
    xPx: number
    yPx: number
    wPx: number
    hPx: number
    fitWidthPx: number
  }) => ipcRenderer.invoke(SLIDES_CHANNELS.aiInsertImageUrl, op),
  replacePictureUrl: (op: {
    slideIndex: number
    sourceId: string
    url: string
    keepSrcRect?: boolean
  }) => ipcRenderer.invoke(SLIDES_CHANNELS.aiReplacePictureUrl, op),
  generateImage: (op: {
    prompt: string
    model?: string
    referenceImageUrls?: string[]
    aspectRatio?: string
    imageSize?: string
  }) => ipcRenderer.invoke(SLIDES_CHANNELS.aiGenerateImage, op),
  analyzeMedia: (op: { mediaUrls: string[]; requirements: string }) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.aiAnalyzeMedia, op),
  onAiStream: (handler: (chunk: AiStreamChunk) => void) => {
    const listener = (_e: IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk)
    ipcRenderer.on(SLIDES_CHANNELS.aiStreamChunk, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.aiStreamChunk, listener)
  },
  saveStyleSidecar: (data: { topic: string; styleSkill: string; createdAt: string }) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.aiSaveSidecar, data),
  saveStyleTemplate: (
    name: string,
    data: { topic: string; styleSkill: string; createdAt: string },
  ) => ipcRenderer.invoke(SLIDES_CHANNELS.aiSaveStyleTemplate, name, data),
  listStyleTemplates: () => ipcRenderer.invoke(SLIDES_CHANNELS.aiListStyleTemplates),
  loadStyleTemplate: (name: string) => ipcRenderer.invoke(SLIDES_CHANNELS.aiLoadStyleTemplate, name),
  presenterStart: () => ipcRenderer.invoke(SLIDES_CHANNELS.presenterStart),
  presenterSync: (state: ShowSyncState) => ipcRenderer.send(SLIDES_CHANNELS.presenterSync, state),
  presenterInk: (ev: ShowInkEvent) => ipcRenderer.send(SLIDES_CHANNELS.presenterInk, ev),
  presenterSwap: () => ipcRenderer.invoke(SLIDES_CHANNELS.presenterSwap),
  presenterEnd: () => ipcRenderer.invoke(SLIDES_CHANNELS.presenterEnd),
  audienceReady: () => ipcRenderer.invoke(SLIDES_CHANNELS.audienceReady),
  audienceNav: (action: AudienceNavAction) => ipcRenderer.send(SLIDES_CHANNELS.audienceNav, action),
  onShowSync: (handler: (state: ShowSyncState) => void) => {
    const listener = (_e: IpcRendererEvent, state: ShowSyncState) => handler(state)
    ipcRenderer.on(SLIDES_CHANNELS.showSync, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.showSync, listener)
  },
  onShowInk: (handler: (ev: ShowInkEvent) => void) => {
    const listener = (_e: IpcRendererEvent, ev: ShowInkEvent) => handler(ev)
    ipcRenderer.on(SLIDES_CHANNELS.showInk, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.showInk, listener)
  },
  onAudienceNav: (handler: (action: AudienceNavAction) => void) => {
    const listener = (_e: IpcRendererEvent, action: AudienceNavAction) => handler(action)
    ipcRenderer.on(SLIDES_CHANNELS.audienceNav, listener)
    return () => ipcRenderer.removeListener(SLIDES_CHANNELS.audienceNav, listener)
  },
}

contextBridge.exposeInMainWorld('slidesApi', api)

// Chat attachment bridge: method names/signatures match the window.desktop attachment subset in docs, so the renderer's files-skill is copied over wholesale
const filesApi: DesktopFilesApi = {
  pickAttachments: () => ipcRenderer.invoke(SLIDES_CHANNELS.filesPick),
  addAttachmentPaths: (paths: string[]) => ipcRenderer.invoke(SLIDES_CHANNELS.filesAdd, paths),
  addPastedImage: (data: ArrayBuffer, ext: string) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.filesAddPastedImage, data, ext),
  readAttachment: (path: string, offset: number, maxChars: number) =>
    ipcRenderer.invoke(SLIDES_CHANNELS.filesRead, path, offset, maxChars),
  readAttachmentImage: (path: string) => ipcRenderer.invoke(SLIDES_CHANNELS.filesReadImage, path),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
}

contextBridge.exposeInMainWorld('desktop', filesApi)

const projectApi: ProjectApi = {
  resolveChat: (args) => ipcRenderer.invoke(SLIDES_CHANNELS.projectResolveChat, args),
  appendChat: (args) => ipcRenderer.invoke(SLIDES_CHANNELS.projectAppendChat, args),
  loadChat: (args) => ipcRenderer.invoke(SLIDES_CHANNELS.projectLoadChat, args),
  rebindChat: (args) => ipcRenderer.invoke(SLIDES_CHANNELS.projectRebindChat, args),
  // P1 extensions
  listProjects: () => ipcRenderer.invoke(SLIDES_CHANNELS.projectList),
  createProject: (args) => ipcRenderer.invoke(SLIDES_CHANNELS.projectCreate, args),
  renameProject: (args) => ipcRenderer.invoke(SLIDES_CHANNELS.projectRename, args),
  deleteProject: (args) => ipcRenderer.invoke(SLIDES_CHANNELS.projectDelete, args),
  moveFile: (args) => ipcRenderer.invoke(SLIDES_CHANNELS.projectMoveFile, args),
  getTimeline: (args) => ipcRenderer.invoke(SLIDES_CHANNELS.projectTimeline, args),
}
contextBridge.exposeInMainWorld('projectApi', projectApi)

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
