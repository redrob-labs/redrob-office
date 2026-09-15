import { contextBridge, ipcRenderer } from "electron";
import type {
  OfficeApi,
  IntakeProgressEvent,
  SetupProgressEvent,
  UpdateStatusEvent,
  WorkProgressEvent,
  ChatStreamEvent,
  SlotStreamEvent,
  AsrInstallProgressEvent,
  BackendInstallProgressEvent,
  FloorSnapshotView,
  RecruitingPipelineProgress,
  TaskApprovalRequestView,
  TaskArtifactView,
  TaskMediaView,
} from "../shared/office-api.js";

const api: OfficeApi = {
  getAppVersion: () => ipcRenderer.invoke("office:getAppVersion"),
  getPlatform: () => process.platform,
  getDeviceProfile: () => ipcRenderer.invoke("office:getDeviceProfile"),
  getLocalCapability: () => ipcRenderer.invoke("office:getLocalCapability"),
  getExecutionPlan: () => ipcRenderer.invoke("office:getExecutionPlan"),
  getTierModels: () => ipcRenderer.invoke("office:getTierModels"),
  getWorkspaces: () => ipcRenderer.invoke("office:getWorkspaces"),
  listFindings: (limit) => ipcRenderer.invoke("office:listFindings", limit),
  listDocuments: (schemaId) =>
    ipcRenderer.invoke("office:listDocuments", schemaId),
  listRubricChoices: () => ipcRenderer.invoke("office:listRubricChoices"),
  correctField: (input) => ipcRenderer.invoke("office:correctField", input),
  acceptField: (fieldId) => ipcRenderer.invoke("office:acceptField", fieldId),
  extractText: (content, schemaId) =>
    ipcRenderer.invoke("office:extractText", content, schemaId),
  pickIntakeFolder: () => ipcRenderer.invoke("office:pickIntakeFolder"),
  runIntakeBatch: (input) => ipcRenderer.invoke("office:runIntakeBatch", input),
  runRecruitingPipeline: (input) =>
    ipcRenderer.invoke("office:runRecruitingPipeline", input),
  cancelWork: () => ipcRenderer.invoke("office:cancelWork"),
  compareStructured: (data, rubricId) =>
    ipcRenderer.invoke("office:compareStructured", data, rubricId),
  runAssess: (input) => ipcRenderer.invoke("office:runAssess", input),
  runScreenRank: (input) => ipcRenderer.invoke("office:runScreenRank", input),
  runVerify: (input) => ipcRenderer.invoke("office:runVerify", input),
  runPublish: (input) => ipcRenderer.invoke("office:runPublish", input),
  draftJd: (input) => ipcRenderer.invoke("office:draftJd", input),
  draftDecisionEmail: (input) =>
    ipcRenderer.invoke("office:draftDecisionEmail", input),
  generate: (templateId, data, locale) =>
    ipcRenderer.invoke("office:generate", templateId, data, locale),
  generateRubric: (input) => ipcRenderer.invoke("office:generateRubric", input),
  listRubrics: () => ipcRenderer.invoke("office:listRubrics"),
  listArtifacts: (kind) => ipcRenderer.invoke("office:listArtifacts", kind),
  getArtifact: (id) => ipcRenderer.invoke("office:getArtifact", id),
  createArtifact: (input) => ipcRenderer.invoke("office:createArtifact", input),
  updateArtifact: (input) => ipcRenderer.invoke("office:updateArtifact", input),
  updateSpreadsheetArtifact: (input) =>
    ipcRenderer.invoke("office:updateSpreadsheetArtifact", input),
  createDocument: (input) => ipcRenderer.invoke("office:createDocument", input),
  deleteArtifact: (id) => ipcRenderer.invoke("office:deleteArtifact", id),
  revealArtifactsFolder: () =>
    ipcRenderer.invoke("office:revealArtifactsFolder"),
  importDocument: () => ipcRenderer.invoke("office:importDocument"),
  docRenderModel: (path) => ipcRenderer.invoke("office:docRenderModel", path),
  exportDocumentPdf: (input) =>
    ipcRenderer.invoke("office:exportDocumentPdf", input),
  duplicateDocument: (id, suffix) =>
    ipcRenderer.invoke("office:duplicateDocument", id, suffix),
  openDocumentExternally: (path) =>
    ipcRenderer.invoke("office:openDocumentExternally", path),
  servePageLocally: (path) => ipcRenderer.invoke("office:servePageLocally", path),
  watchDocument: (path) => ipcRenderer.invoke("office:watchDocument", path),
  unwatchDocument: (path) => ipcRenderer.invoke("office:unwatchDocument", path),
  onDocReloaded: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: {
        path: string;
        sessionId?: string;
        format?: "xlsx" | "docx" | "pptx";
      },
    ) => {
      listener(payload);
    };
    ipcRenderer.on("office:docReloaded", handler);
    return () => {
      ipcRenderer.removeListener("office:docReloaded", handler);
    };
  },
  onLocalDataWiped: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: {
        documents: number;
        fields: number;
        chats?: number;
        artifacts?: number;
      },
    ) => {
      listener(payload);
    };
    ipcRenderer.on("office:localDataWiped", handler);
    return () => {
      ipcRenderer.removeListener("office:localDataWiped", handler);
    };
  },
  listWorkflows: (workspaceId) =>
    ipcRenderer.invoke("office:listWorkflows", workspaceId),
  saveWorkflow: (input) => ipcRenderer.invoke("office:saveWorkflow", input),
  workflowTriggerStatus: () => ipcRenderer.invoke("office:workflowTriggerStatus"),
  exportSkill: (workflowId, options) =>
    ipcRenderer.invoke("office:exportSkill", workflowId, options),
  importSkill: (confirm) => ipcRenderer.invoke("office:importSkill", confirm),
  openExternal: (url) => ipcRenderer.invoke("office:openExternal", url),
  webSearch: (input) => ipcRenderer.invoke("office:webSearch", input),
  closeWebSearch: () => ipcRenderer.invoke("office:closeWebSearch"),
  showWebSearch: () => ipcRenderer.invoke("office:showWebSearch"),
  fetchPage: (input) => ipcRenderer.invoke("office:fetchPage", input),
  pickChatAttachments: () => ipcRenderer.invoke("office:pickChatAttachments"),
  attachFiles: (files) => ipcRenderer.invoke("office:attachFiles", files),
  fillCompanyFromWebsite: (url) =>
    ipcRenderer.invoke("office:fillCompanyFromWebsite", url),
  getDefaultWorkflowDraft: (workspaceId, locale) =>
    ipcRenderer.invoke("office:getDefaultWorkflowDraft", workspaceId, locale),
  listWorkflowPresets: (workspaceId, locale) =>
    ipcRenderer.invoke("office:listWorkflowPresets", workspaceId, locale),
  getTelemetryPreview: (count) =>
    ipcRenderer.invoke("office:getTelemetryPreview", count),
  getTelemetryOptIn: () => ipcRenderer.invoke("office:getTelemetryOptIn"),
  setTelemetryOptIn: (optedIn) =>
    ipcRenderer.invoke("office:setTelemetryOptIn", optedIn),
  getMeasurements: () => ipcRenderer.invoke("office:getMeasurements"),
  wipeLocalData: (confirm) =>
    ipcRenderer.invoke("office:wipeLocalData", confirm),
  revealLogsFolder: () => ipcRenderer.invoke("office:revealLogsFolder"),
  getUpdateStatus: () => ipcRenderer.invoke("office:getUpdateStatus"),
  checkForUpdates: () => ipcRenderer.invoke("office:checkForUpdates"),
  installUpdate: () => ipcRenderer.invoke("office:installUpdate"),
  onUpdateStatus: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: UpdateStatusEvent,
    ) => {
      listener(status);
    };
    ipcRenderer.on("office:updateStatus", handler);
    return () => {
      ipcRenderer.removeListener("office:updateStatus", handler);
    };
  },
  getSetupSnapshot: () => ipcRenderer.invoke("office:getSetupSnapshot"),
  applySetup: (decision) => ipcRenderer.invoke("office:applySetup", decision),
  downloadGradeWeights: () => ipcRenderer.invoke("office:downloadGradeWeights"),
  onSetupProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: SetupProgressEvent,
    ) => {
      listener(progress);
    };
    ipcRenderer.on("office:setupProgress", handler);
    return () => {
      ipcRenderer.removeListener("office:setupProgress", handler);
    };
  },
  onWorkProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: WorkProgressEvent,
    ) => {
      listener(progress);
    };
    ipcRenderer.on("office:workProgress", handler);
    return () => {
      ipcRenderer.removeListener("office:workProgress", handler);
    };
  },
  onSlotStream: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: SlotStreamEvent,
    ) => {
      listener(progress);
    };
    ipcRenderer.on("office:slotStream", handler);
    return () => {
      ipcRenderer.removeListener("office:slotStream", handler);
    };
  },
  onIntakeProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: IntakeProgressEvent,
    ) => {
      listener(progress);
    };
    ipcRenderer.on("office:intakeProgress", handler);
    return () => {
      ipcRenderer.removeListener("office:intakeProgress", handler);
    };
  },
  onRecruitingPipelineProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: RecruitingPipelineProgress,
    ) => {
      listener(progress);
    };
    ipcRenderer.on("office:pipelineProgress", handler);
    return () => {
      ipcRenderer.removeListener("office:pipelineProgress", handler);
    };
  },
  onChatStream: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: ChatStreamEvent,
    ) => {
      listener(progress);
    };
    ipcRenderer.on("office:chatStream", handler);
    return () => {
      ipcRenderer.removeListener("office:chatStream", handler);
    };
  },
  runChat: (input) => ipcRenderer.invoke("office:runChat", input),
  runTask: (input) => ipcRenderer.invoke("office:runTask", input),
  abortTask: (runId) => ipcRenderer.invoke("office:abortTask", runId),
  readLocalMedia: (path) => ipcRenderer.invoke("office:readLocalMedia", path),
  resolveTaskApproval: (input) =>
    ipcRenderer.invoke("office:resolveTaskApproval", input),
  onTaskApprovalRequest: (handler) => {
    const listener = (
      _event: unknown,
      payload: TaskApprovalRequestView,
    ): void => handler(payload);
    ipcRenderer.on("office:taskApprovalRequest", listener);
    return () =>
      ipcRenderer.removeListener("office:taskApprovalRequest", listener);
  },
  onTaskMedia: (handler) => {
    const listener = (_event: unknown, payload: TaskMediaView): void =>
      handler(payload);
    ipcRenderer.on("office:taskMedia", listener);
    return () => ipcRenderer.removeListener("office:taskMedia", listener);
  },
  onTaskArtifact: (handler) => {
    const listener = (_event: unknown, payload: TaskArtifactView): void =>
      handler(payload);
    ipcRenderer.on("office:taskArtifact", listener);
    return () => ipcRenderer.removeListener("office:taskArtifact", listener);
  },
  getAllowedPaths: () => ipcRenderer.invoke("office:getAllowedPaths"),
  addAllowedPath: (path) => ipcRenderer.invoke("office:addAllowedPath", path),
  removeAllowedPath: (path) =>
    ipcRenderer.invoke("office:removeAllowedPath", path),
  pickAllowedFolder: () => ipcRenderer.invoke("office:pickAllowedFolder"),
  getComputerUseSettings: () =>
    ipcRenderer.invoke("office:getComputerUseSettings"),
  desktopControlStatus: () => ipcRenderer.invoke("office:desktopControlStatus"),
  desktopStopNow: () => ipcRenderer.invoke("office:desktopStopNow"),
  desktopResume: () => ipcRenderer.invoke("office:desktopResume"),
  updateComputerUseSettings: (patch) =>
    ipcRenderer.invoke("office:updateComputerUseSettings", patch),
  listToolAudit: (limit) => ipcRenderer.invoke("office:listToolAudit", limit),
  floorSnapshot: () => ipcRenderer.invoke("office:floorSnapshot"),
  floorChannel: (channelId, sinceCreatedAt) =>
    ipcRenderer.invoke("office:floorChannel", channelId, sinceCreatedAt),
  floorSay: (text, channelId, to, attached) =>
    ipcRenderer.invoke("office:floorSay", text, channelId, to, attached),
  floorCreateChannel: (input) =>
    ipcRenderer.invoke("office:floorCreateChannel", input),
  floorUpdateChannel: (id, patch) =>
    ipcRenderer.invoke("office:floorUpdateChannel", id, patch),
  ensureDmChannel: (memberId) =>
    ipcRenderer.invoke("office:ensureDmChannel", memberId),
  inviteToChannel: (channelId, memberIds) =>
    ipcRenderer.invoke("office:inviteToChannel", channelId, memberIds),
  removeFromChannel: (channelId, memberId) =>
    ipcRenderer.invoke("office:removeFromChannel", channelId, memberId),
  floorDeleteChannel: (id) =>
    ipcRenderer.invoke("office:floorDeleteChannel", id),
  floorHireStaff: (input) => ipcRenderer.invoke("office:floorHireStaff", input),
  floorUpdateStaff: (id, patch) =>
    ipcRenderer.invoke("office:floorUpdateStaff", id, patch),
  floorDismissStaff: (id) => ipcRenderer.invoke("office:floorDismissStaff", id),
  floorResolveApproval: (id, approved, decision) =>
    ipcRenderer.invoke("office:floorResolveApproval", id, approved, decision),
  floorDirective: (input) => ipcRenderer.invoke("office:floorDirective", input),
  floorBrief: (regenerate) =>
    ipcRenderer.invoke("office:floorBrief", regenerate),
  onFloorUpdate: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      snapshot: FloorSnapshotView,
    ) => {
      listener(snapshot);
    };
    ipcRenderer.on("office:floorUpdate", handler);
    return () => {
      ipcRenderer.removeListener("office:floorUpdate", handler);
    };
  },
  channelEvents: (channelId, sinceTs) =>
    ipcRenderer.invoke("office:channelEvents", channelId, sinceTs),
  listTeamMembers: () => ipcRenderer.invoke("office:listTeamMembers"),
  generatePersona: (prompt, locale) =>
    ipcRenderer.invoke("office:generatePersona", prompt, locale),
  addTeamMember: (input) => ipcRenderer.invoke("office:addTeamMember", input),
  updateTeamMember: (id, patch) =>
    ipcRenderer.invoke("office:updateTeamMember", id, patch),
  removeTeamMember: (id) => ipcRenderer.invoke("office:removeTeamMember", id),
  listChannelMemories: (input) =>
    ipcRenderer.invoke("office:listChannelMemories", input),
  addChannelMemory: (input) =>
    ipcRenderer.invoke("office:addChannelMemory", input),
  promoteChannelMemory: (id, channelId) =>
    ipcRenderer.invoke("office:promoteChannelMemory", id, channelId),
  prepareChannelSend: (input) =>
    ipcRenderer.invoke("office:prepareChannelSend", input),
  appendChannelAssistant: (input) =>
    ipcRenderer.invoke("office:appendChannelAssistant", input),
  truncateChannelEventsAfter: (input) =>
    ipcRenderer.invoke("office:truncateChannelEventsAfter", input),
  listMemories: () => ipcRenderer.invoke("office:listMemories"),
  addMemory: (body) => ipcRenderer.invoke("office:addMemory", body),
  updateMemory: (id, body) =>
    ipcRenderer.invoke("office:updateMemory", id, body),
  deleteMemory: (id) => ipcRenderer.invoke("office:deleteMemory", id),
  importMemories: (text, fileName) =>
    ipcRenderer.invoke("office:importMemories", text, fileName),
  importMemoriesFromFile: () =>
    ipcRenderer.invoke("office:importMemoriesFromFile"),
  listChatSessions: () => ipcRenderer.invoke("office:listChatSessions"),
  getChatSession: (id) => ipcRenderer.invoke("office:getChatSession", id),
  saveChatSession: (input) =>
    ipcRenderer.invoke("office:saveChatSession", input),
  renameChatSession: (id, title) =>
    ipcRenderer.invoke("office:renameChatSession", id, title),
  autotitleChatSession: (id, title) =>
    ipcRenderer.invoke("office:autotitleChatSession", id, title),
  setChatSessionPinned: (id, pinned) =>
    ipcRenderer.invoke("office:setChatSessionPinned", id, pinned),
  deleteChatSession: (id) => ipcRenderer.invoke("office:deleteChatSession", id),
  getTemplateSlots: (templateId, locale) =>
    ipcRenderer.invoke("office:getTemplateSlots", templateId, locale),
  draftFromTemplate: (input) =>
    ipcRenderer.invoke("office:draftFromTemplate", input),
  pickDocumentFile: () => ipcRenderer.invoke("office:pickDocumentFile"),
  openDocumentForEdit: (path) =>
    ipcRenderer.invoke("office:openDocumentForEdit", path),
  savePatchedDocument: (input) =>
    ipcRenderer.invoke("office:savePatchedDocument", input),
  fillOpenedForm: (input) => ipcRenderer.invoke("office:fillOpenedForm", input),
  saveRemoteCredentials: (input) =>
    ipcRenderer.invoke("office:saveRemoteCredentials", input),
  saveGpuPreference: (preference) =>
    ipcRenderer.invoke("office:saveGpuPreference", preference),
  saveLlmSettings: (input) =>
    ipcRenderer.invoke("office:saveLlmSettings", input),
  getAccountSnapshot: () => ipcRenderer.invoke("office:getAccountSnapshot"),
  signInForBackup: (email) =>
    ipcRenderer.invoke("office:signInForBackup", email),
  signOutAccount: () => ipcRenderer.invoke("office:signOutAccount"),
  setBackupOptIn: (enabled) =>
    ipcRenderer.invoke("office:setBackupOptIn", enabled),
  createLocalBackup: () => ipcRenderer.invoke("office:createLocalBackup"),
  restoreLocalBackup: (confirm) =>
    ipcRenderer.invoke("office:restoreLocalBackup", confirm),
  getCompanyProfile: () => ipcRenderer.invoke("office:getCompanyProfile"),
  saveCompanyProfile: (profile) =>
    ipcRenderer.invoke("office:saveCompanyProfile", profile),
  getDeskProfile: () => ipcRenderer.invoke("office:getDeskProfile"),
  saveDeskProfile: (profile) =>
    ipcRenderer.invoke("office:saveDeskProfile", profile),
  pickAudioFile: () => ipcRenderer.invoke("office:pickAudioFile"),
  recordAsrConsent: (input) =>
    ipcRenderer.invoke("office:recordAsrConsent", input),
  listAsrBatch: () => ipcRenderer.invoke("office:listAsrBatch"),
  startAsrBatchItem: (input) =>
    ipcRenderer.invoke("office:startAsrBatchItem", input),
  waitAsrBatchItem: (id) => ipcRenderer.invoke("office:waitAsrBatchItem", id),
  getRuntimeFallbackNotices: () =>
    ipcRenderer.invoke("office:getRuntimeFallbackNotices"),
  getBackendStatus: () => ipcRenderer.invoke("office:getBackendStatus"),
  installBackend: (backendId) =>
    ipcRenderer.invoke("office:installBackend", backendId),
  removeBackend: (backendId) =>
    ipcRenderer.invoke("office:removeBackend", backendId),
  onBackendInstallProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: BackendInstallProgressEvent,
    ) => {
      listener(progress);
    };
    ipcRenderer.on("office:backendInstallProgress", handler);
    return () => {
      ipcRenderer.removeListener("office:backendInstallProgress", handler);
    };
  },
  getEngineStatus: () => ipcRenderer.invoke("office:getEngineStatus"),
  startDeviceConnect: () => ipcRenderer.invoke("office:startDeviceConnect"),
  pollDeviceConnect: (id) =>
    ipcRenderer.invoke("office:pollDeviceConnect", id),
  cancelDeviceConnect: (id) =>
    ipcRenderer.invoke("office:cancelDeviceConnect", id),
  getCreditState: () => ipcRenderer.invoke("office:getCreditState"),
  clearCreditBlock: () => ipcRenderer.invoke("office:clearCreditBlock"),
  getAsrSetupStatus: () => ipcRenderer.invoke("office:getAsrSetupStatus"),
  installAsrPack: (options) =>
    ipcRenderer.invoke("office:installAsrPack", options),
  onAsrInstallProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: AsrInstallProgressEvent,
    ) => {
      listener(progress);
    };
    ipcRenderer.on("office:asrInstallProgress", handler);
    return () => {
      ipcRenderer.removeListener("office:asrInstallProgress", handler);
    };
  },
  voiceTranscribePcm: (input) =>
    ipcRenderer.invoke("office:voiceTranscribePcm", input),
  dayLogCapabilities: () => ipcRenderer.invoke("office:dayLogCapabilities"),
  getActiveDayLog: () => ipcRenderer.invoke("office:getActiveDayLog"),
  startDayLog: (input) => ipcRenderer.invoke("office:startDayLog", input),
  stopDayLog: () => ipcRenderer.invoke("office:stopDayLog"),
  finalizeDayLog: () => ipcRenderer.invoke("office:finalizeDayLog"),
  listDayLogs: () => ipcRenderer.invoke("office:listDayLogs"),
  listMcpServers: () => ipcRenderer.invoke("office:listMcpServers"),
  addMcpServer: (config) => ipcRenderer.invoke("office:addMcpServer", config),
  updateMcpServer: (id, updates) =>
    ipcRenderer.invoke("office:updateMcpServer", id, updates),
  removeMcpServer: (id) => ipcRenderer.invoke("office:removeMcpServer", id),
  connectMcpServer: (id) => ipcRenderer.invoke("office:connectMcpServer", id),
  disconnectMcpServer: (id) =>
    ipcRenderer.invoke("office:disconnectMcpServer", id),
  listMcpTools: () => ipcRenderer.invoke("office:listMcpTools"),
};

try {
  contextBridge.exposeInMainWorld("office", api);
} catch (error) {
  console.error("[redrob preload] failed to expose office bridge", error);
  throw error;
}
