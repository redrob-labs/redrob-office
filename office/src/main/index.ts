import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
} from "electron";
import { randomUUID } from "node:crypto";
import { nowIso, setMainClock } from "./app-time.js";
import { installDesktopPanicStop } from "./desktop/panic.js";
import { RealTimeSource } from "./office/time/index.js";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { compare } from "@redrob/compare";
import { extract } from "@redrob/extract";
import { generate } from "@redrob/generate";
import {
  clearModelCache,
  detectDeviceProfile,
  TIERS,
  DEFAULT_LOCAL_PACK_TIER,
  type Tier,
} from "@redrob/kernel";
import {
  openStore,
  type Store,
  listMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  importMemories,
  listChatSessions,
  getChatSession,
  saveChatSession,
  renameChatSession,
  autotitleChatSession,
  setChatSessionPinned,
  deleteChatSession,
} from "@redrob/store";
import { TelemetryRecorder, OtlpTransport } from "@redrob/telemetry";
import { WORKSPACES, localizeSlotDescription } from "@redrob/ui";
import { correctField, acceptField } from "./services/corrections.js";
import {
  getAccountSnapshot,
  setBackupOptIn,
  signInForBackup,
  signOutAccount,
} from "./services/account.js";
import {
  defaultBackupFileName,
  readAndValidateBackup,
  restoreBackupFiles,
  writeBackupFile,
} from "./services/backup.js";
import type {
  DeskBackupResult,
  DeskRestoreResult,
  DeskWipeResult,
  DeviceConnectPollView,
} from "../shared/office-api.js";
import { REDROB_CONSOLE_API_BASE } from "../shared/office-api.js";
import {
  listDocumentSummaries,
  listFindings,
  listRubricChoices,
  runAssess,
} from "./services/assess.js";
import {
  listTextFiles,
  resolveTextModelId,
  runIntakeBatch,
} from "./services/intake.js";
import { runChat } from "./services/chat.js";
import { scrubModelOutputForUi } from "./security/untrusted.js";
import {
  closeWebSearchWindow,
  runWebSearch,
  showWebSearchWindow,
} from "./services/web-search.js";
import { closePageFetchWindow, fetchPage } from "./services/page-fetch.js";
import { closeAgentBrowser } from "./services/browser-session.js";
import {
  attachDroppedFiles,
  pickChatAttachments,
  type ChatAttachment,
} from "./services/chat-attachments.js";
import { fillCompanyProfileFromWebsite } from "./services/company-from-website.js";
import {
  setVisionSidecarDisabledHandler,
  shutdownVisionSidecar,
} from "./services/vision/index.js";

import { parseMemoryImportText } from "./services/memories.js";
import { wipeLocalData } from "./services/data-reset.js";
import {
  loadMeasurements,
  MAX_MEASUREMENTS,
  saveMeasurements,
} from "./services/measurements.js";
import {
  buildDeskEvent,
  loadTelemetryState,
  saveTelemetryOptIn,
  type DeskEventInput,
} from "./services/telemetry.js";
import { draftFromTemplate } from "./services/draft-template.js";
import {
  fillOpenedForm,
  openDocumentForEdit,
  savePatchedDocument,
} from "./services/document-edit.js";
import { runPublish } from "./services/publish.js";
import { draftJd } from "./services/jd.js";
import {
  configureCompanyProfile,
  loadCompanyProfile,
  loadDeskProfile,
  saveCompanyProfile,
  saveDeskProfile,
} from "./services/company-profile.js";
import { draftDecisionEmail } from "./services/email.js";
import {
  artifactsDirPath,
  configureArtifacts,
  deleteArtifact,
  getArtifact,
  listArtifacts,
  saveArtifact,
  updateArtifact,
  updateSpreadsheetArtifact,
  wipeAllArtifacts,
  type ArtifactKind,
} from "./services/artifacts.js";
import {
  createBlankDocument,
  type NewDocumentFormat,
} from "./services/create-document.js";
import {
  registerDocUiWindow,
  unwatchDocument,
  watchDocument,
} from "./services/doc-ui.js";
import { configureComputerUse } from "./office/config.js";
import { configureChatPermissions } from "./office/chat-permissions.js";
import { configureDocSessions } from "./docs/session.js";
import { configureToolAudit } from "./audit/tool-audit.js";
import {
  configureUserRubrics,
  generateAndSaveRubric,
  listSavedRubrics,
} from "./services/rubric.js";
import { runScreenRank } from "./services/screen.js";
import {
  applyInferenceRuntimeConfig,
  applySetupDecision,
  downloadGradeTextWeights,
  getSetupSnapshot,
  loadSetupState,
  modelsDirPath,
  saveGpuPreference,
  saveLlmSettings,
  saveRemoteCredentials,
} from "./services/setup.js";
import { runVerify } from "./services/verify.js";
import {
  configureUserWorkflows,
  defaultRecruitingWorkflowDraft,
  listWorkflowPresets,
  listWorkflows,
  saveWorkflow,
} from "./services/workflow.js";
import { runRecruitingPipeline } from "./services/recruiting-pipeline.js";
import { notifyDesktop } from "./services/notify.js";
import { resolveUserDataDir } from "./services/dev-profile.js";
import { exportSkillToFile, importSkillFromFile } from "./services/skill.js";
import {
  checkForUpdates,
  getUpdateStatus,
  installDownloadedUpdate,
  startAutoUpdates,
} from "./updates.js";
import { loadTemplate } from "@redrob/registry";
import type {
  AssessRequest,
  ChatRequest,
  ChatStreamEvent,
  WebSearchRequest,
  PageFetchRequest,
  CorrectFieldRequest,
  DecisionEmailRequest,
  DeviceProfile,
  DraftJdRequest,
  DraftTemplateRequest,
  CompanyProfileView,
  DeskProfileView,
  GenerateRubricRequest,
  GpuPreference,
  ModelGrade,
  ChatRouteMode,
  InferenceRouteMode,
  ImportSkillConfirmCopy,
  NativeConfirmCopy,
  IntakeBatchRequest,
  IntakeProgressEvent,
  LlmProviderSecretsView,
  MeasuredTiming,
  PublishRequest,
  RecruitingPipelineInput,
  RecruitingPipelineProgress,
  SaveWorkflowRequest,
  ScreenRankRequest,
  SetupDecision,
  SlotStreamEvent,
  VerifyRequest,
  WorkOperation,
  WorkProgressEvent,
} from "../shared/office-api.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function resolvePreloadPath(): string {
  const candidates = [
    join(__dirname, "../preload/index.cjs"),
    join(__dirname, "../preload/index.js"),
    join(__dirname, "../preload/index.mjs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Preload script missing. Looked for:\n${candidates.join("\n")}`,
  );
}

/** Default page zoom. UI density lives in css `html { font-size: 90% }`. */
function resetPageZoom(contents: Electron.WebContents): void {
  try {
    contents.setZoomFactor(1);
  } catch {
    // ignore
  }
  contents.setZoomLevel(0);
}

function focusedWebContents(): Electron.WebContents | null {
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return win && !win.isDestroyed() ? win.webContents : null;
}

function installAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        {
          label: "Actual Size",
          accelerator: "CommandOrControl+0",
          click: () => {
            const contents = focusedWebContents();
            if (contents) resetPageZoom(contents);
          },
        },
        {
          label: "Zoom In",
          accelerator: "CommandOrControl+=",
          click: () => {
            const contents = focusedWebContents();
            if (!contents) return;
            contents.setZoomLevel(Math.min(5, contents.getZoomLevel() + 0.5));
          },
        },
        {
          label: "Zoom Out",
          accelerator: "CommandOrControl+-",
          click: () => {
            const contents = focusedWebContents();
            if (!contents) return;
            contents.setZoomLevel(Math.max(-3, contents.getZoomLevel() - 0.5));
          },
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  if (process.platform === "darwin") {
    template.unshift({ role: "appMenu" });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function resolveAppIcon(): string | undefined {
  const names =
    process.platform === "win32"
      ? (["icon.ico", "icon.png"] as const)
      : (["icon.png", "icon.ico"] as const);
  const roots = [
    join(__dirname, "../../build"),
    join(app.getAppPath(), "build"),
    join(process.resourcesPath, "build"),
  ];
  for (const root of roots) {
    for (const name of names) {
      const candidate = join(root, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

let store: Store | undefined;
/**
 * The data directory this run actually uses, which is not always the one
 * Electron reports: a dev profile or REDROB_OFFICE_USER_DATA moves it. Handlers
 * that must agree with the boot wiring read it from here.
 */
let resolvedUserData: string | null = null;
/** Opt-out by default: nothing is shared until the user says so in Settings. */
const telemetry = new TelemetryRecorder({ optedIn: true });
const otlpEndpoint = process.env.REDROB_OTLP_ENDPOINT?.trim();
const otlp = new OtlpTransport({
  optedIn: true,
  ...(otlpEndpoint ? { endpoint: otlpEndpoint } : {}),
  send: async (endpoint, event) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      throw new Error(`OTLP send failed: HTTP ${response.status}`);
    }
  },
});
const telemetrySessionId = randomUUID();
let deviceProfile: DeviceProfile | null = null;
let measuredTimings: MeasuredTiming[] = [];
let measurementsSaveTimer: NodeJS.Timeout | null = null;
let intakeAbort: AbortController | null = null;

/**
 * Records a timing and persists the list lazily so a burst of runs does not
 * write measurements.json once per operation.
 */
function recordTiming(operation: string, startedAt: number): void {
  measuredTimings.push({
    operation,
    totalMs: performance.now() - startedAt,
    recordedAt: nowIso(),
  });
  if (measuredTimings.length > MAX_MEASUREMENTS) {
    measuredTimings = measuredTimings.slice(-MAX_MEASUREMENTS);
  }
  if (measurementsSaveTimer) return;
  measurementsSaveTimer = setTimeout(() => {
    measurementsSaveTimer = null;
    void saveMeasurements(app.getPath("userData"), measuredTimings).catch(
      () => undefined,
    );
  }, 2_000);
}

function recordDeskEvent(input: DeskEventInput, logger: pino.Logger): void {
  try {
    const event = buildDeskEvent(input, {
      sessionId: telemetrySessionId,
      appVersion: app.getVersion(),
      device: deviceProfile,
    });
    telemetry.record(event);
    void otlp.record(event).catch((error: unknown) => {
      logger.warn({ err: error }, "otlp transport failed");
    });
  } catch (error) {
    logger.warn({ err: error }, "telemetry event rejected");
  }
}

function requireStore(): Store {
  if (!store) throw new Error("SQLite store has not been initialized");
  return store;
}

function reopenStore(userData: string): void {
  store?.close();
  store = undefined;
  store = openStore(join(userData, "redrob.sqlite"));
}

async function withStoreClosed<T>(
  userData: string,
  fn: () => Promise<T>,
): Promise<T> {
  store?.close();
  store = undefined;
  try {
    return await fn();
  } finally {
    store = openStore(join(userData, "redrob.sqlite"));
  }
}

function emitWorkProgress(
  event: Electron.IpcMainInvokeEvent,
  operation: WorkOperation,
  stepId: string,
  status: WorkProgressEvent["status"] = "active",
): void {
  const payload: WorkProgressEvent = { operation, stepId, status };
  event.sender.send("office:workProgress", payload);
}

function emitSlotStream(
  event: Electron.IpcMainInvokeEvent,
  payload: SlotStreamEvent,
): void {
  event.sender.send("office:slotStream", payload);
}

function createLogger() {
  const logsDirectory = join(app.getPath("userData"), "logs");
  mkdirSync(logsDirectory, { recursive: true });
  return pino(
    pino.destination({
      dest: join(logsDirectory, "desk.log"),
      mkdir: true,
      sync: false,
    }),
  );
}

function isCorrectFieldRequest(value: unknown): value is CorrectFieldRequest {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.fieldId === "string" &&
    typeof input.value === "string" &&
    typeof input.schemaId === "string" &&
    typeof input.modelId === "string" &&
    (input.tier === undefined || typeof input.tier === "string")
  );
}

function isIntakeBatchRequest(value: unknown): value is IntakeBatchRequest {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.workspaceId === "string" &&
    typeof input.schemaId === "string" &&
    typeof input.directoryPath === "string"
  );
}

function registerIpcHandlers(logger: pino.Logger): void {
  ipcMain.handle("office:getDeviceProfile", async () => {
    const profile =
      typeof process.getSystemMemoryInfo === "function"
        ? await detectDeviceProfile({
            getSystemMemoryInfo: () => process.getSystemMemoryInfo(),
          })
        : await detectDeviceProfile();
    deviceProfile = profile;
    return profile;
  });
  ipcMain.handle("office:getLocalCapability", async () => {
    const { detectLocalCapability } =
      await import("./services/local-capability.js");
    return detectLocalCapability(app.getPath("userData"));
  });
  ipcMain.handle("office:getExecutionPlan", async () => {
    // Ask the inference host (utilityProcess when available) for its real, already-probed
    // plan instead of reading this (main) process's own @redrob/kernel module cache — that
    // cache is a *separate* memory space from the sidecar actually doing inference and can
    // disagree with it, which is how the Device panel used to show a stale probed-cpu plan
    // even when the sidecar had successfully loaded cuda (or vice versa).
    const { getInferenceIsolation, hostGetPlan } =
      await import("./services/inference-host.js");
    const plan = await hostGetPlan();
    return { ...plan, isolation: getInferenceIsolation() };
  });
  ipcMain.handle("office:getWorkspaces", () => WORKSPACES);
  ipcMain.handle("office:listFindings", (_event, limit = 50) =>
    listFindings(requireStore(), limit),
  );
  ipcMain.handle("office:listDocuments", (_event, schemaId?: string) =>
    listDocumentSummaries(requireStore(), schemaId),
  );
  ipcMain.handle("office:listRubricChoices", () => listRubricChoices());
  ipcMain.handle("office:correctField", async (_event, input: unknown) => {
    if (!isCorrectFieldRequest(input)) {
      throw new Error("Invalid field correction request");
    }
    const profile = await detectDeviceProfile();
    const tier = (input.tier as Tier | undefined) ?? profile.tier;
    const result = correctField(requireStore(), {
      ...input,
      modelId:
        input.modelId === "unknown" ? resolveTextModelId(tier) : input.modelId,
      tier,
    });
    logger.info(
      { fieldId: result.field.id, schemaId: input.schemaId },
      "field corrected",
    );
    return result;
  });
  ipcMain.handle("office:acceptField", (_event, fieldId: string) => {
    if (typeof fieldId !== "string" || !fieldId) {
      throw new Error("Invalid acceptField request");
    }
    const field = acceptField(requireStore(), fieldId);
    logger.info({ fieldId: field.id }, "field accepted as-is");
    return field;
  });
  ipcMain.handle(
    "office:extractText",
    async (_event, content: string, schemaId: string) => {
      const startedAt = performance.now();
      const result = await extract({
        source: { kind: "text", content },
        schemaId,
      });
      recordTiming("extract", startedAt);
      return result;
    },
  );
  ipcMain.handle("office:pickIntakeFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select intake folder",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });
  ipcMain.handle("office:runIntakeBatch", async (event, input: unknown) => {
    if (!isIntakeBatchRequest(input)) {
      throw new Error("Invalid intake batch request");
    }
    const startedAt = performance.now();
    const userData = app.getPath("userData");
    const setup = await loadSetupState(userData);
    await applyInferenceRuntimeConfig(setup);
    const files = await listTextFiles(input.directoryPath);
    logger.info(
      {
        directory: input.directoryPath,
        schemaId: input.schemaId,
        queued: files.length,
      },
      "intake batch starting",
    );
    intakeAbort?.abort();
    intakeAbort = new AbortController();
    const result = await runIntakeBatch({
      store: requireStore(),
      workspaceId: input.workspaceId,
      schemaId: input.schemaId,
      filePaths: files,
      tier: setup.packTier,
      stateDirectory: join(userData, "intake-runs"),
      signal: intakeAbort.signal,
      onProgress: (update) => {
        const payload: IntakeProgressEvent = {
          processed: update.processed,
          errors: update.errors,
          queued: update.queued,
          path: update.path,
          ...(update.field ? { field: update.field } : {}),
        };
        event.sender.send("office:intakeProgress", payload);
      },
    });
    intakeAbort = null;
    recordTiming("intake.batch", startedAt);
    recordDeskEvent(
      {
        workspaceId: input.workspaceId,
        engine: "extract",
        schemaOrRubricId: input.schemaId,
        itemCount: result.queued,
        totalMs: performance.now() - startedAt,
        fieldCount: result.items.reduce(
          (sum, item) => sum + (item.fieldCount ?? 0),
          0,
        ),
        belowThresholdCount: result.items.reduce(
          (sum, item) => sum + (item.needsReviewCount ?? 0),
          0,
        ),
        tier: setup.packTier,
      },
      logger,
    );
    logger.info(
      {
        runId: result.runId,
        processed: result.processed,
        errors: result.errors,
      },
      "intake batch finished",
    );
    return result;
  });
  ipcMain.handle(
    "office:runRecruitingPipeline",
    async (
      event,
      input: RecruitingPipelineInput,
    ) => {
      if (typeof input !== "object" || input === null) {
        throw new Error("Invalid recruiting pipeline input");
      }
      const userData = app.getPath("userData");
      const setup = await loadSetupState(userData);
      await applyInferenceRuntimeConfig(setup);
      // The renderer picks a folder; only the main process can read it.
      const filePaths =
        input.intakeFilePaths ??
        (input.intakeDirectoryPath
          ? await listTextFiles(input.intakeDirectoryPath)
          : undefined);
      return runRecruitingPipeline(
        requireStore(),
        { ...input, ...(filePaths ? { intakeFilePaths: filePaths } : {}) },
        {
          onProgress: (progress: RecruitingPipelineProgress) => {
            event.sender.send("office:pipelineProgress", progress);
          },
          intakeStateDirectory: join(userData, "intake-runs"),
        },
      );
    },
  );
  ipcMain.handle("office:cancelWork", () => {
    if (!intakeAbort) return false;
    intakeAbort.abort();
    intakeAbort = null;
    return true;
  });
  ipcMain.handle(
    "office:compareStructured",
    async (_event, data: unknown, rubricId: string) => {
      const startedAt = performance.now();
      const textContent =
        data !== null &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        typeof (data as { text?: unknown }).text === "string"
          ? String((data as { text: string }).text)
          : null;
      const result = await compare({
        artifact:
          textContent !== null
            ? { kind: "text", content: textContent }
            : { kind: "structured", data },
        rubricId,
      });
      recordTiming("compare", startedAt);
      return result;
    },
  );
  ipcMain.handle("office:runAssess", async (event, input: AssessRequest) => {
    const startedAt = performance.now();
    const result = await runAssess(requireStore(), input, {
      onField: (field) => {
        emitSlotStream(event, {
          operation: "assess",
          streamTarget: field.streamTarget,
          path: field.path,
          value: field.value,
        });
      },
    });
    recordTiming("assess", startedAt);
    recordDeskEvent(
      {
        workspaceId: input.workspaceId,
        engine: "compare",
        schemaOrRubricId: input.rubricId,
        itemCount: 1,
        totalMs: performance.now() - startedAt,
        fieldCount: result.compare.scores?.length ?? 0,
        belowThresholdCount: result.findingsSaved,
        tier: result.compare.tierUsed,
      },
      logger,
    );
    return result;
  });
  ipcMain.handle(
    "office:runScreenRank",
    async (_event, input: ScreenRankRequest) => {
      const startedAt = performance.now();
      const result = await runScreenRank(requireStore(), input);
      recordTiming("screen", startedAt);
      logger.info({ screen: result.logLine }, "screen rank finished");
      return result;
    },
  );
  ipcMain.handle("office:runVerify", async (_event, input: VerifyRequest) => {
    const startedAt = performance.now();
    const result = await runVerify(requireStore(), input);
    recordTiming("verify", startedAt);
    return result;
  });
  ipcMain.handle("office:runPublish", async (event, input: PublishRequest) => {
    const startedAt = performance.now();
    const result = await runPublish(requireStore(), input, (stepId) =>
      emitWorkProgress(event, "runPublish", stepId),
    );
    recordTiming("publish", startedAt);
    return result;
  });
  ipcMain.handle("office:draftJd", async (event, input: DraftJdRequest) => {
    const startedAt = performance.now();
    const result = await draftJd(
      input,
      (stepId) => emitWorkProgress(event, "draftJd", stepId),
      (field) => {
        emitSlotStream(event, {
          operation: "draftJd",
          streamTarget: field.streamTarget ?? field.path,
          path: field.path,
          value: field.value,
        });
      },
    );
    recordTiming("draftJd", startedAt);
    logger.info(
      {
        source: result.source,
        timingMs: result.timingMs,
        ...(result.modelError ? { modelError: result.modelError } : {}),
      },
      "draftJd finished",
    );
    return result;
  });
  ipcMain.handle(
    "office:draftDecisionEmail",
    async (event, input: DecisionEmailRequest) => {
      const startedAt = performance.now();
      const result = await draftDecisionEmail(requireStore(), input, (stepId) =>
        emitWorkProgress(event, "draftDecisionEmail", stepId),
      );
      recordTiming("draftDecisionEmail", startedAt);
      return result;
    },
  );
  ipcMain.handle(
    "office:generate",
    async (_event, templateId: string, data: unknown, locale?: string) => {
      const startedAt = performance.now();
      const result = await generate(
        locale === undefined
          ? { templateId, data }
          : { templateId, data, locale },
      );
      recordTiming("generate", startedAt);
      return result;
    },
  );
  ipcMain.handle(
    "office:generateRubric",
    async (event, input: GenerateRubricRequest) => {
      if (
        typeof input !== "object" ||
        input === null ||
        typeof input.jdText !== "string"
      ) {
        throw new Error("generateRubric requires jdText.");
      }
      const startedAt = performance.now();
      const result = await generateAndSaveRubric(input, (stepId) =>
        emitWorkProgress(event, "generateRubric", stepId),
      );
      recordTiming("generateRubric", startedAt);
      logger.info(
        { rubricId: result.rubric.id, path: result.path },
        "rubric generated",
      );
      return {
        rubric: {
          id: result.rubric.id,
          version: result.rubric.version,
          axes: result.rubric.axes.map(
            (axis: {
              id: string;
              label: string;
              range: [number, number];
              guidance: string;
            }) => ({
              id: axis.id,
              label: axis.label,
              range: axis.range,
              guidance: axis.guidance,
            }),
          ),
        },
        path: result.path,
        source: result.source,
        artifactId: result.artifactId,
      };
    },
  );
  ipcMain.handle("office:listRubrics", async () => listSavedRubrics());
  ipcMain.handle("office:listArtifacts", (_event, kind?: ArtifactKind) =>
    listArtifacts(kind),
  );
  ipcMain.handle("office:getArtifact", (_event, id: string) => {
    if (typeof id !== "string" || !id.trim())
      throw new Error("getArtifact requires id.");
    return getArtifact(id.trim());
  });
  ipcMain.handle("office:createArtifact", async (_event, input: unknown) => {
    if (!input || typeof input !== "object")
      throw new Error("Invalid artifact");
    const body = input as {
      title?: unknown;
      body?: unknown;
      kind?: unknown;
      format?: unknown;
    };
    if (typeof body.title !== "string" || !body.title.trim()) {
      throw new Error("Artifact title is required");
    }
    if (typeof body.body !== "string")
      throw new Error("Artifact body is required");
    // A fixed set, not a caller-chosen file name: this comes from the renderer.
    const contentFile =
      body.format === "html"
        ? "content.html"
        : body.format === "svg"
          ? "content.svg"
          : "content.md";
    const kindRaw = typeof body.kind === "string" ? body.kind : "other";
    const kind: ArtifactKind =
      kindRaw === "jd" ||
      kindRaw === "email" ||
      kindRaw === "report" ||
      kindRaw === "rubric" ||
      kindRaw === "other"
        ? kindRaw
        : "other";
    return saveArtifact({
      kind,
      title: body.title.trim(),
      body: body.body,
      contentFile,
      source: "model",
    });
  });
  ipcMain.handle("office:updateArtifact", async (_event, input: unknown) => {
    if (!input || typeof input !== "object")
      throw new Error("Invalid updateArtifact input");
    const body = input as {
      id?: unknown;
      body?: unknown;
      title?: unknown;
      baseRevision?: unknown;
    };
    if (typeof body.id !== "string" || !body.id.trim())
      throw new Error("id required");
    if (typeof body.body !== "string") throw new Error("body required");
    return updateArtifact({
      id: body.id.trim(),
      body: body.body,
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.baseRevision === "string"
        ? { baseRevision: body.baseRevision }
        : {}),
    });
  });
  ipcMain.handle(
    "office:updateSpreadsheetArtifact",
    async (_event, input: unknown) => {
      if (!input || typeof input !== "object") {
        throw new Error("Invalid updateSpreadsheetArtifact input");
      }
      const body = input as {
        id?: unknown;
        sheet?: unknown;
        changes?: unknown;
        baseRevision?: unknown;
      };
      if (typeof body.id !== "string" || !body.id.trim()) {
        throw new Error("id required");
      }
      if (typeof body.sheet !== "string" || !body.sheet.trim()) {
        throw new Error("sheet required");
      }
      if (!Array.isArray(body.changes)) throw new Error("changes required");
      const changes = body.changes.map((raw) => {
        if (!raw || typeof raw !== "object") throw new Error("invalid cell change");
        const row = raw as Record<string, unknown>;
        if (
          typeof row["row"] !== "number" ||
          typeof row["column"] !== "number" ||
          typeof row["value"] !== "string"
        ) {
          throw new Error("invalid cell change");
        }
        return {
          row: row["row"],
          column: row["column"],
          value: row["value"],
        };
      });
      return updateSpreadsheetArtifact({
        id: body.id.trim(),
        sheet: body.sheet.trim(),
        changes,
        ...(typeof body.baseRevision === "string"
          ? { baseRevision: body.baseRevision }
          : {}),
      });
    },
  );
  ipcMain.handle("office:createDocument", async (_event, input: unknown) => {
    if (!input || typeof input !== "object")
      throw new Error("Invalid createDocument input");
    const body = input as { format?: unknown; title?: unknown };
    const format = body.format;
    if (
      format !== "md" &&
      format !== "docx" &&
      format !== "xlsx" &&
      format !== "pptx"
    ) {
      throw new Error("format must be md|docx|xlsx|pptx");
    }
    return createBlankDocument({
      format: format as NewDocumentFormat,
      ...(typeof body.title === "string" ? { title: body.title } : {}),
    });
  });
  ipcMain.handle("office:watchDocument", (_event, path: unknown) => {
    if (typeof path !== "string" || !path.trim())
      throw new Error("path required");
    watchDocument(path.trim());
    return true;
  });
  ipcMain.handle("office:unwatchDocument", (_event, path: unknown) => {
    if (typeof path !== "string" || !path.trim())
      throw new Error("path required");
    unwatchDocument(path.trim());
    return true;
  });
  ipcMain.handle("office:deleteArtifact", async (_event, id: string) => {
    if (typeof id !== "string" || !id.trim())
      throw new Error("deleteArtifact requires id.");
    return deleteArtifact(id.trim());
  });
  ipcMain.handle("office:revealArtifactsFolder", async () => {
    const opened = await shell.openPath(artifactsDirPath());
    if (opened) throw new Error(opened);
    return true;
  });
  ipcMain.handle("office:importDocument", async (event) => {
    const { importableExtensions, importDocumentFile } =
      await import("./services/document-io.js");
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow();
    const openOptions = {
      title: "Open a document",
      properties: ["openFile" as const],
      filters: [
        { name: "Documents", extensions: importableExtensions() },
        { name: "All files", extensions: ["*"] },
      ],
    };
    // Let the click paint before the native modal takes the event loop.
    await new Promise((resolve) => setImmediate(resolve));
    const result = win
      ? await dialog.showOpenDialog(win, openOptions)
      : await dialog.showOpenDialog(openOptions);
    if (result.canceled || !result.filePaths[0]) return null;
    return importDocumentFile(result.filePaths[0]);
  });
  ipcMain.handle("office:docRenderModel", async (_event, path: unknown) => {
    if (typeof path !== "string" || !path.trim())
      throw new Error("path required");
    const { buildRenderModel } = await import("./docs/render/model.js");
    return buildRenderModel(path.trim());
  });
  ipcMain.handle("office:exportDocumentPdf", async (event, input: unknown) => {
    if (!input || typeof input !== "object")
      throw new Error("Invalid exportDocumentPdf input");
    const body = input as { path?: unknown; suggestedName?: unknown };
    if (typeof body.path !== "string" || !body.path.trim())
      throw new Error("path required");
    const { renderDocumentToPdf } = await import("./docs/render/pdf-export.js");
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow();
    const suggested =
      typeof body.suggestedName === "string" && body.suggestedName.trim()
        ? body.suggestedName.trim()
        : "document";
    const saveOptions = {
      title: "Export PDF",
      defaultPath: `${suggested}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    };
    await new Promise((resolve) => setImmediate(resolve));
    const chosen = win
      ? await dialog.showSaveDialog(win, saveOptions)
      : await dialog.showSaveDialog(saveOptions);
    if (chosen.canceled || !chosen.filePath) return null;
    return renderDocumentToPdf(body.path.trim(), chosen.filePath);
  });
  ipcMain.handle(
    "office:duplicateDocument",
    async (_event, id: unknown, suffix: unknown) => {
      if (typeof id !== "string" || !id.trim()) throw new Error("id required");
      const artifact = await getArtifact(id.trim());
      if (!artifact) throw new Error("Artifact not found");
      const { duplicateArtifactFile } =
        await import("./services/document-io.js");
      return duplicateArtifactFile(
        artifact,
        typeof suffix === "string" && suffix.trim() ? suffix.trim() : "copy",
      );
    },
  );
  ipcMain.handle(
    "office:openDocumentExternally",
    async (_event, path: unknown) => {
      if (typeof path !== "string" || !path.trim())
        throw new Error("path required");
      // Hand the file to whatever the OS opens it with; the app no longer ships
      // an editor of its own for it.
      const opened = await shell.openPath(path.trim());
      if (opened) throw new Error(opened);
      return true;
    },
  );
  ipcMain.handle("office:servePageLocally", async (_event, path: unknown) => {
    if (typeof path !== "string" || !path.trim())
      throw new Error("path required");
    const target = resolve(path.trim());
    // Only a document of ours goes on the server. Serving whatever path a
    // renderer names would turn this into a way to read the whole disk over
    // HTTP, and the page's own folder is served alongside it.
    const { artifactIdForPath } = await import("./services/artifacts.js");
    if (!artifactIdForPath(target)) {
      throw new Error("Only a file in the documents folder can be served.");
    }
    const { servePageLocally } = await import("./services/page-serve.js");
    return { url: await servePageLocally(target) };
  });
  ipcMain.handle("office:listWorkflows", (_event, workspaceId?: string) =>
    listWorkflows(workspaceId),
  );
  ipcMain.handle("office:saveWorkflow", (_event, input: SaveWorkflowRequest) =>
    saveWorkflow(input),
  );
  ipcMain.handle("office:workflowTriggerStatus", async () => {
    const { readTriggerState } = await import("./services/workflow-triggers.js");
    const state = readTriggerState(resolvedUserData ?? app.getPath("userData"));
    return Object.entries(state).map(([workflowId, run]) => ({
      workflowId,
      armedAt: new Date(run.armedAt).toISOString(),
      ...(run.lastRunAt ? { lastRunAt: new Date(run.lastRunAt).toISOString() } : {}),
      ...(run.lastStatus ? { lastStatus: run.lastStatus } : {}),
      ...(run.lastSummary ? { lastSummary: run.lastSummary } : {}),
    }));
  });
  ipcMain.handle(
    "office:exportSkill",
    async (
      event,
      workflowId: string,
      options?: { description?: string; author?: string },
    ) => {
      if (typeof workflowId !== "string" || !workflowId.trim()) {
        return {
          ok: false as const,
          error: "exportSkill requires workflowId.",
        };
      }
      return exportSkillToFile({
        workflowId: workflowId.trim(),
        sender: event.sender,
        ...(options?.description ? { description: options.description } : {}),
        ...(options?.author ? { author: options.author } : {}),
      });
    },
  );
  ipcMain.handle(
    "office:importSkill",
    async (event, confirm?: ImportSkillConfirmCopy) => {
      return importSkillFromFile({
        sender: event.sender,
        ...(confirm ? { confirm } : {}),
      });
    },
  );
  ipcMain.handle("office:openExternal", async (_event, url: unknown) => {
    if (typeof url !== "string" || !url.trim()) return false;
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      return false;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    await shell.openExternal(parsed.toString());
    return true;
  });
  ipcMain.handle("office:webSearch", async (event, input: WebSearchRequest) => {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof input.query !== "string" ||
      !input.query.trim()
    ) {
      throw new Error("webSearch requires a non-empty query");
    }
    const parent = BrowserWindow.fromWebContents(event.sender);
    const limit =
      typeof input.limit === "number" && Number.isFinite(input.limit)
        ? Math.trunc(input.limit)
        : undefined;
    return runWebSearch(
      {
        query: input.query.trim().slice(0, 200),
        ...(limit != null ? { limit } : {}),
        ...(typeof input.keepOpen === "boolean"
          ? { keepOpen: input.keepOpen }
          : {}),
        ...(typeof input.showBrowser === "boolean"
          ? { showBrowser: input.showBrowser }
          : {}),
      },
      parent,
    );
  });
  ipcMain.handle("office:closeWebSearch", () => {
    closeWebSearchWindow();
    return true;
  });
  ipcMain.handle("office:showWebSearch", () => showWebSearchWindow());
  ipcMain.handle(
    "office:fetchPage",
    async (_event, input: PageFetchRequest) => {
      if (
        typeof input !== "object" ||
        input === null ||
        typeof input.url !== "string" ||
        !input.url.trim()
      ) {
        throw new Error("fetchPage requires a non-empty url");
      }
      return fetchPage({
        url: input.url.trim(),
        ...(typeof input.keepOpen === "boolean"
          ? { keepOpen: input.keepOpen }
          : {}),
        ...(typeof input.showBrowser === "boolean"
          ? { showBrowser: input.showBrowser }
          : {}),
      });
    },
  );
  ipcMain.handle("office:pickChatAttachments", async (event) => {
    return pickChatAttachments(event.sender);
  });
  ipcMain.handle(
    "office:attachFiles",
    async (_event, files: unknown): Promise<ChatAttachment[]> => {
      if (!Array.isArray(files) || files.length === 0) return [];
      const staged = files.map((file) => {
        const entry = file as {
          name?: unknown;
          type?: unknown;
          bytes?: unknown;
        };
        if (typeof entry.name !== "string") {
          throw new Error("attachFiles requires a name per file");
        }
        // Structured clone gives a Uint8Array here; anything else is a caller
        // that has not read the bridge.
        if (!(entry.bytes instanceof Uint8Array)) {
          throw new Error(`attachFiles requires bytes for ${entry.name}`);
        }
        return {
          name: entry.name,
          bytes: entry.bytes,
          ...(typeof entry.type === "string" ? { type: entry.type } : {}),
        };
      });
      return attachDroppedFiles(staged, app.getPath("userData"));
    },
  );
  ipcMain.handle(
    "office:fillCompanyFromWebsite",
    async (_event, url: unknown) => {
      if (typeof url !== "string" || !url.trim()) {
        throw new Error("fillCompanyFromWebsite requires a url");
      }
      return fillCompanyProfileFromWebsite(app.getPath("userData"), url.trim());
    },
  );
  ipcMain.handle(
    "office:getDefaultWorkflowDraft",
    (_event, workspaceId?: string, locale?: string) =>
      defaultRecruitingWorkflowDraft(workspaceId ?? "recruiting", locale),
  );
  ipcMain.handle(
    "office:listWorkflowPresets",
    (_event, workspaceId?: string, locale?: string) =>
      listWorkflowPresets(workspaceId ?? "general", locale),
  );
  ipcMain.handle("office:getTelemetryPreview", (_event, count = 10) =>
    telemetry.getPayloads().slice(-Math.max(0, count)),
  );
  ipcMain.handle("office:getTelemetryOptIn", () => telemetry.isOptedIn);
  ipcMain.handle(
    "office:setTelemetryOptIn",
    async (_event, optedIn: boolean) => {
      telemetry.setOptedIn(Boolean(optedIn));
      otlp.setOptedIn(Boolean(optedIn));
      const state = await saveTelemetryOptIn(
        app.getPath("userData"),
        telemetry.isOptedIn,
      );
      logger.info(
        { telemetryOptIn: state.optedIn },
        "telemetry opt-in updated",
      );
      return telemetry.isOptedIn;
    },
  );
  ipcMain.handle("office:getMeasurements", () => measuredTimings);
  ipcMain.handle("office:getAppVersion", () => app.getVersion());
  ipcMain.handle("office:getUpdateStatus", () => getUpdateStatus());
  ipcMain.handle("office:checkForUpdates", () => checkForUpdates());
  ipcMain.handle("office:installUpdate", () => installDownloadedUpdate());
  ipcMain.handle("office:revealLogsFolder", async () => {
    const logsDirectory = join(app.getPath("userData"), "logs");
    mkdirSync(logsDirectory, { recursive: true });
    const opened = await shell.openPath(logsDirectory);
    if (opened) throw new Error(opened);
    return true;
  });
  ipcMain.handle(
    "office:wipeLocalData",
    async (event, confirm?: NativeConfirmCopy): Promise<DeskWipeResult> => {
      const win =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow();
      const copy = {
        title: confirm?.title?.trim() || "Clear local documents?",
        message:
          confirm?.message?.trim() ||
          "This permanently deletes documents on this device.",
        detail:
          confirm?.detail?.trim() ||
          "Extracted data and Library files are removed. Criteria, flows, memories, and models are kept.",
        cancel: confirm?.cancel?.trim() || "Cancel",
        confirm: confirm?.confirm?.trim() || "Delete",
      };
      const confirmOptions = {
        type: "warning" as const,
        buttons: [copy.cancel, copy.confirm],
        defaultId: 0,
        cancelId: 0,
        title: copy.title,
        message: copy.message,
        detail: copy.detail,
      };
      const confirmed = win
        ? await dialog.showMessageBox(win, confirmOptions)
        : await dialog.showMessageBox(confirmOptions);
      if (confirmed.response !== 1) {
        return { ok: false, canceled: true };
      }
      try {
        const counts = wipeLocalData(requireStore());
        const artifacts = await wipeAllArtifacts();
        const userData = app.getPath("userData");
        // Drop document edit snapshots
        try {
          const { rm } = await import("node:fs/promises");
          await rm(join(userData, "doc-snapshots"), {
            recursive: true,
            force: true,
          });
        } catch {
          // ignore
        }
        // The Floor keeps its own SQLite and audit log. Leaving them meant a
        // wipe that said it cleared "채팅" still left the office thread and
        // its leftover approval cards on screen.
        let floorMessages = 0;
        try {
          const { floorWipeChat } = await import("./services/floor.js");
          const wiped = await floorWipeChat();
          floorMessages = wiped.messages;
        } catch (error) {
          logger.warn({ err: error }, "clearing Floor chat failed");
        }
        logger.info(
          { ...counts, artifacts, floorMessages },
          "local documents cleared",
        );
        const payload = { ...counts, artifacts, floorMessages };
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send("office:localDataWiped", payload);
          }
        }
        return { ok: true, ...counts, artifacts, floorMessages };
      } catch (error) {
        logger.error({ err: error }, "clearing local documents failed");
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
  ipcMain.handle(
    "office:getTierModels",
    async () => TIERS[DEFAULT_LOCAL_PACK_TIER],
  );
  ipcMain.handle("office:getSetupSnapshot", async () =>
    getSetupSnapshot(app.getPath("userData")),
  );
  ipcMain.handle(
    "office:applySetup",
    async (event, decision: SetupDecision) => {
      process.env.REDROB_MODELS_DIR = modelsDirPath(app.getPath("userData"));
      const state = await applySetupDecision(
        app.getPath("userData"),
        decision,
        (progress) => {
          logger.info({ setup: progress }, "setup progress");
          event.sender.send("office:setupProgress", progress);
        },
      );
      logger.info(
        { mode: state.mode, roles: state.downloadedRoles },
        "setup completed",
      );
      return state;
    },
  );
  ipcMain.handle("office:downloadGradeWeights", async (event) => {
    process.env.REDROB_MODELS_DIR = modelsDirPath(app.getPath("userData"));
    const state = await downloadGradeTextWeights(
      app.getPath("userData"),
      (progress) => {
        event.sender.send("office:setupProgress", progress);
      },
    );
    logger.info({ grade: state.chatQualityMode }, "grade weights downloaded");
    return getSetupSnapshot(app.getPath("userData"));
  });
  ipcMain.handle(
    "office:saveRemoteCredentials",
    async (_event, input: { baseUrl: string; apiKey: string }) => {
      const state = await saveRemoteCredentials(app.getPath("userData"), input);
      logger.info(
        { baseUrl: state.remote?.baseUrl },
        "remote credentials saved",
      );
      return { mode: state.mode, baseUrl: state.remote?.baseUrl ?? "" };
    },
  );
  ipcMain.handle(
    "office:saveGpuPreference",
    async (_event, preference: GpuPreference) => {
      const state = await saveGpuPreference(
        app.getPath("userData"),
        preference,
      );
      logger.info(
        { gpuPreference: state.gpuPreference },
        "gpu preference saved",
      );
      return getSetupSnapshot(app.getPath("userData"));
    },
  );
  ipcMain.handle(
    "office:saveLlmSettings",
    async (
      _event,
      input: {
        inferenceRoute?: InferenceRouteMode;
        chatRoute?: ChatRouteMode;
        chatQualityMode?: ModelGrade;
        webSearchEnabled?: boolean;
        llmProviders?: LlmProviderSecretsView;
      },
    ) => {
      await saveLlmSettings(app.getPath("userData"), input ?? {});
      const { rebindFloorInference } = await import("./services/floor.js");
      await rebindFloorInference().catch(() => undefined);
      logger.info(
        {
          inferenceRoute: input?.inferenceRoute ?? input?.chatRoute,
          chatQualityMode: input?.chatQualityMode,
          providers: Object.keys(input?.llmProviders ?? {}),
        },
        "llm settings saved",
      );
      return getSetupSnapshot(app.getPath("userData"));
    },
  );
  ipcMain.handle("office:getAccountSnapshot", async () =>
    getAccountSnapshot(app.getPath("userData")),
  );
  ipcMain.handle("office:signInForBackup", async (_event, email: string) => {
    const snapshot = await signInForBackup(app.getPath("userData"), email);
    logger.info({ email: snapshot.email }, "account signed in for backup");
    return snapshot;
  });
  ipcMain.handle("office:signOutAccount", async () => {
    const snapshot = await signOutAccount(app.getPath("userData"));
    logger.info("account signed out");
    return snapshot;
  });
  ipcMain.handle("office:setBackupOptIn", async (_event, enabled: boolean) => {
    const snapshot = await setBackupOptIn(app.getPath("userData"), enabled);
    logger.info(
      { backupEnabled: snapshot.backupEnabled },
      "backup opt-in updated",
    );
    return snapshot;
  });
  ipcMain.handle(
    "office:createLocalBackup",
    async (): Promise<DeskBackupResult> => {
      const userData = app.getPath("userData");
      const account = await getAccountSnapshot(userData);
      if (!account.signedIn || !account.email) {
        return { ok: false, error: "Sign in before creating a backup" };
      }
      const win =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const saveOptions = {
        title: "Save Redrob Office backup",
        defaultPath: defaultBackupFileName(),
        filters: [{ name: "Redrob Office backup", extensions: ["redrobbak"] }],
      };
      const save = win
        ? await dialog.showSaveDialog(win, saveOptions)
        : await dialog.showSaveDialog(saveOptions);
      if (save.canceled || !save.filePath) {
        return { ok: false, canceled: true };
      }
      const destPath = save.filePath.endsWith(".redrobbak")
        ? save.filePath
        : `${save.filePath}.redrobbak`;
      try {
        await withStoreClosed(userData, async () => {
          await writeBackupFile({
            userData,
            destPath,
            email: account.email!,
            appVersion: app.getVersion(),
          });
        });
        logger.info({ path: destPath }, "local backup created");
        return { ok: true, path: destPath };
      } catch (error) {
        logger.error({ err: error }, "local backup failed");
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
  ipcMain.handle(
    "office:restoreLocalBackup",
    async (event, confirm?: NativeConfirmCopy): Promise<DeskRestoreResult> => {
      const userData = app.getPath("userData");
      const account = await getAccountSnapshot(userData);
      if (!account.signedIn || !account.email) {
        return { ok: false, error: "Sign in before restoring a backup" };
      }
      const win =
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow();
      const openOptions = {
        title: "Restore Redrob Office backup",
        filters: [{ name: "Redrob Office backup", extensions: ["redrobbak"] }],
        properties: ["openFile" as const],
      };
      const open = win
        ? await dialog.showOpenDialog(win, openOptions)
        : await dialog.showOpenDialog(openOptions);
      if (open.canceled || !open.filePaths[0]) {
        return { ok: false, canceled: true };
      }
      const copy = {
        title: confirm?.title?.trim() || "Restore backup?",
        message:
          confirm?.message?.trim() ||
          "This replaces local data on this device with the selected backup.",
        detail:
          confirm?.detail?.trim() ||
          "Setup, account, database, rubrics, and artifacts will be overwritten. Downloaded models are kept.",
        cancel: confirm?.cancel?.trim() || "Cancel",
        confirm: confirm?.confirm?.trim() || "Restore",
      };
      const confirmOptions = {
        type: "warning" as const,
        buttons: [copy.cancel, copy.confirm],
        defaultId: 1,
        cancelId: 0,
        title: copy.title,
        message: copy.message,
        detail: copy.detail,
      };
      const confirmed = win
        ? await dialog.showMessageBox(win, confirmOptions)
        : await dialog.showMessageBox(confirmOptions);
      if (confirmed.response !== 1) {
        return { ok: false, canceled: true };
      }
      try {
        const payload = await readAndValidateBackup(
          open.filePaths[0],
          account.email,
        );
        await withStoreClosed(userData, async () => {
          await restoreBackupFiles(userData, payload);
        });
        try {
          const setup = await loadSetupState(userData);
          await applyInferenceRuntimeConfig(setup);
        } catch (error) {
          logger.warn({ err: error }, "Failed to reapply setup after restore");
        }
        logger.info({ path: open.filePaths[0] }, "local backup restored");
        // Reload after a tick so the invoke can return first.
        setImmediate(() => {
          event.sender.reload();
        });
        return { ok: true };
      } catch (error) {
        try {
          reopenStore(userData);
        } catch (reopenError) {
          logger.error(
            { err: reopenError },
            "Failed to reopen store after restore error",
          );
        }
        logger.error({ err: error }, "local restore failed");
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
  ipcMain.handle("office:getCompanyProfile", async () =>
    loadCompanyProfile(app.getPath("userData")),
  );
  ipcMain.handle(
    "office:saveCompanyProfile",
    async (_event, profile: CompanyProfileView) =>
      saveCompanyProfile(profile, app.getPath("userData")),
  );
  ipcMain.handle("office:getDeskProfile", async () =>
    loadDeskProfile(app.getPath("userData")),
  );
  ipcMain.handle(
    "office:saveDeskProfile",
    async (_event, profile: DeskProfileView) =>
      saveDeskProfile(profile, app.getPath("userData")),
  );
  ipcMain.handle("office:pickAudioFile", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      title: "Select audio for transcription",
      filters: [
        {
          name: "Audio",
          extensions: ["wav", "mp3", "m4a", "ogg", "flac", "webm"],
        },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });
  ipcMain.handle(
    "office:recordAsrConsent",
    async (
      _event,
      input: {
        speakerKind: "self" | "others";
        acknowledgedPlaceholders: boolean;
      },
    ) => {
      const { requireConsent, saveConsentRecord } =
        await import("./services/asr/consent.js");
      const record = requireConsent(
        input.speakerKind,
        input.acknowledgedPlaceholders,
      );
      await saveConsentRecord(app.getPath("userData"), record);
      return { id: record.id, at: record.at, speakerKind: record.speakerKind };
    },
  );
  ipcMain.handle("office:listAsrBatch", async () => {
    const { listBatchItems } = await import("./services/asr/batch.js");
    return listBatchItems(app.getPath("userData"));
  });
  ipcMain.handle(
    "office:startAsrBatchItem",
    async (
      _event,
      input: {
        sourcePath: string;
        language?: string;
        consentId: string;
        speakerKind: "self" | "others";
      },
    ) => {
      const { ensureAsrReady, resolveAsrModelTier } =
        await import("./services/asr/voice.js");
      const { startAndRunBatchItem } = await import("./services/asr/batch.js");
      await ensureAsrReady((line) => logger.info(line));
      void input.speakerKind;
      return startAndRunBatchItem(app.getPath("userData"), {
        sourcePath: input.sourcePath,
        language: input.language ?? "ko",
        modelTier: await resolveAsrModelTier(),
        consentId: input.consentId,
      });
    },
  );
  ipcMain.handle("office:waitAsrBatchItem", async (_event, id: string) => {
    const { getBatchItem } = await import("./services/asr/batch.js");
    const userData = app.getPath("userData");
    for (let i = 0; i < 3600; i += 1) {
      const item = await getBatchItem(userData, id);
      if (!item) throw new Error("ASR transcription not found");
      if (item.state === "done" || item.state === "error") return item;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("ASR transcription wait timeout");
  });
  ipcMain.handle("office:getRuntimeFallbackNotices", async () => {
    const { getInferenceFallbackNotices } =
      await import("./services/inference-host.js");
    const { getAsrFallbackNotices } =
      await import("./services/asr/asr-host.js");
    return [
      ...getInferenceFallbackNotices().map((n) => ({
        ...n,
        source: "inference" as const,
      })),
      ...getAsrFallbackNotices().map((n) => ({ ...n, source: "asr" as const })),
    ];
  });
  ipcMain.handle("office:getBackendStatus", async () => {
    const { getBackendStatus } = await import("./services/backend-install.js");
    return getBackendStatus();
  });
  ipcMain.handle("office:getEngineStatus", async () => {
    const { getEngineStatus } = await import("./redrob-code/status.js");
    return getEngineStatus();
  });
  /**
   * Device connect. The renderer drives the wait but never holds the device
   * code, and it never sees the key either: when the console approves, the key
   * is written here through the same path a pasted one takes, and the renderer
   * is handed the resulting snapshot.
   */
  ipcMain.handle("office:startDeviceConnect", async () => {
    const { redrobDeviceConnections } = await import(
      "./services/redrob-device.js"
    );
    return redrobDeviceConnections().start();
  });
  ipcMain.handle("office:pollDeviceConnect", async (_event, id: unknown) => {
    if (typeof id !== "string") {
      return { status: "expired" } satisfies DeviceConnectPollView;
    }
    const { collectRedrobDeviceConnect, redrobDeviceConnections } =
      await import("./services/redrob-device.js");
    return collectRedrobDeviceConnect(
      redrobDeviceConnections(),
      id,
      async (key) => {
        const userData = app.getPath("userData");
        await saveLlmSettings(userData, {
          inferenceRoute: "openai",
          llmProviders: {
            openai: { apiKey: key, baseUrl: REDROB_CONSOLE_API_BASE },
          },
        });
        const { rebindFloorInference } = await import("./services/floor.js");
        await rebindFloorInference().catch(() => undefined);
        logger.info(
          { product: "office" },
          "workspace key issued by device connect",
        );
        return getSetupSnapshot(userData);
      },
    );
  });
  ipcMain.handle("office:getCreditState", async () => {
    const { creditState } = await import("./services/redrob-credit.js");
    return creditState();
  });
  ipcMain.handle("office:clearCreditBlock", async () => {
    const { clearCreditBlock } = await import("./services/redrob-credit.js");
    return clearCreditBlock();
  });
  ipcMain.handle("office:cancelDeviceConnect", async (_event, id: unknown) => {
    if (typeof id !== "string" || !id.trim()) return false;
    const { redrobDeviceConnections } = await import(
      "./services/redrob-device.js"
    );
    return redrobDeviceConnections().cancel(id.trim());
  });
  ipcMain.handle("office:installBackend", async (event, backendId: string) => {
    const { installBackend } = await import("./services/backend-install.js");
    return installBackend(
      backendId as Parameters<typeof installBackend>[0],
      (progress) => {
        event.sender.send("office:backendInstallProgress", progress);
      },
    );
  });
  ipcMain.handle("office:removeBackend", async (_event, backendId: string) => {
    const { removeBackend } = await import("./services/backend-install.js");
    return removeBackend(backendId as Parameters<typeof removeBackend>[0]);
  });
  ipcMain.handle("office:getAsrSetupStatus", async () => {
    const { getAsrSetupStatus } = await import("./services/asr/asr-install.js");
    return getAsrSetupStatus(app.getPath("userData"));
  });
  ipcMain.handle(
    "office:installAsrPack",
    async (event, options?: { includeTurbo?: boolean }) => {
      const { installAsrPack } = await import("./services/asr/asr-install.js");
      return installAsrPack(
        app.getPath("userData"),
        {
          ...(typeof options?.includeTurbo === "boolean"
            ? { includeTurbo: options.includeTurbo }
            : {}),
        },
        (progress) => {
          event.sender.send("office:asrInstallProgress", progress);
        },
      );
    },
  );
  ipcMain.handle(
    "office:voiceTranscribePcm",
    async (_event, input: { pcmBase64: string; language?: string }) => {
      const { transcribePcmBase64 } = await import("./services/asr/voice.js");
      return transcribePcmBase64(input);
    },
  );
  ipcMain.handle("office:dayLogCapabilities", async () => {
    const { dayLogCapabilityHint } = await import("./services/day-log.js");
    return dayLogCapabilityHint(app.getPath("userData"));
  });
  ipcMain.handle("office:getActiveDayLog", async () => {
    const { getActiveDayLogSession } = await import("./services/day-log.js");
    return getActiveDayLogSession();
  });
  ipcMain.handle(
    "office:startDayLog",
    async (
      _event,
      input?: {
        intervalMs?: number;
        visionRoute?: "local" | "cloud";
        deleteCapturesAfterReport?: boolean;
        cloudOptIn?: boolean;
        notifyOnCapture?: boolean;
        locale?: "en" | "ko";
      },
    ) => {
      const { startDayLogSession } = await import("./services/day-log.js");
      return startDayLogSession(input ?? {});
    },
  );
  ipcMain.handle("office:stopDayLog", async () => {
    const { stopDayLogSession } = await import("./services/day-log.js");
    return stopDayLogSession();
  });
  ipcMain.handle("office:finalizeDayLog", async () => {
    const { finalizeDayLogSession } = await import("./services/day-log.js");
    return finalizeDayLogSession(app.getPath("userData"));
  });
  ipcMain.handle("office:listDayLogs", async () => {
    const { listDayLogSessions } = await import("./services/day-log.js");
    return listDayLogSessions();
  });
  ipcMain.handle(
    "office:getTemplateSlots",
    (_event, templateId: string, locale?: string) => {
      const template = loadTemplate(templateId);
      return template.slots.map((slot) => ({
        id: slot.id,
        description: localizeSlotDescription(
          locale,
          templateId,
          slot.id,
          slot.description ?? slot.id,
        ),
        required: slot.required,
      }));
    },
  );
  ipcMain.handle(
    "office:draftFromTemplate",
    async (event, input: DraftTemplateRequest) => {
      const startedAt = performance.now();
      const result = await draftFromTemplate(input, (field) => {
        emitSlotStream(event, {
          operation: "draftFromTemplate",
          streamTarget: field.streamTarget ?? field.path,
          path: field.path,
          value: field.value,
        });
      });
      recordTiming("draft.template", startedAt);
      return result;
    },
  );
  ipcMain.handle("office:pickDocumentFile", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      title: "Select document",
      filters: [
        {
          name: "Documents",
          extensions: ["hwpx", "hwp", "docx", "pdf", "hml", "xlsx", "xls"],
        },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });
  ipcMain.handle("office:openDocumentForEdit", async (_event, path: string) => {
    if (typeof path !== "string" || !path.trim()) {
      throw new Error("Invalid document path");
    }
    const startedAt = performance.now();
    const result = await openDocumentForEdit(path);
    recordTiming("document.open", startedAt);
    return result;
  });
  ipcMain.handle(
    "office:savePatchedDocument",
    async (_event, input: unknown) => {
      if (
        typeof input !== "object" ||
        input === null ||
        typeof (input as { originalPath?: unknown }).originalPath !==
          "string" ||
        typeof (input as { editedMarkdown?: unknown }).editedMarkdown !==
          "string"
      ) {
        throw new Error("Invalid savePatchedDocument request");
      }
      const startedAt = performance.now();
      const result = await savePatchedDocument(
        input as {
          originalPath: string;
          editedMarkdown: string;
          title?: string;
          categoryId?: string;
        },
      );
      recordTiming("document.patch", startedAt);
      return result;
    },
  );
  ipcMain.handle("office:fillOpenedForm", async (_event, input: unknown) => {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof (input as { originalPath?: unknown }).originalPath !== "string" ||
      typeof (input as { values?: unknown }).values !== "object" ||
      (input as { values?: unknown }).values === null
    ) {
      throw new Error("Invalid fillOpenedForm request");
    }
    const startedAt = performance.now();
    const result = await fillOpenedForm(
      input as {
        originalPath: string;
        values: Record<string, string>;
        title?: string;
        categoryId?: string;
      },
    );
    recordTiming("document.fill", startedAt);
    return result;
  });
  ipcMain.handle("office:runChat", async (event, input: ChatRequest) => {
    const startedAt = performance.now();
    const sessionId =
      typeof input?.sessionId === "string" && input.sessionId.trim()
        ? input.sessionId.trim()
        : "desk-chat-default";
    const sendStream = (payload: ChatStreamEvent): void => {
      if (event.sender.isDestroyed()) return;
      event.sender.send("office:chatStream", payload);
    };
    try {
      const result = await runChat(
        app.getPath("userData"),
        input,
        (chunk) => {
          sendStream({ kind: "chunk", sessionId, text: chunk });
        },
        requireStore(),
        (toolEvent) => {
          // Generic tool step (browser.*, doc.*, fs.*, …) → live status line.
          if (toolEvent.kind === "step") {
            sendStream({
              kind: "step",
              sessionId,
              label: toolEvent.label,
              status: toolEvent.status,
              name: toolEvent.name,
              ...(toolEvent.present ? { present: toolEvent.present } : {}),
              ...(toolEvent.past ? { past: toolEvent.past } : {}),
              ...(toolEvent.nested ? { nested: true } : {}),
              ...(typeof toolEvent.ok === "boolean" ? { ok: toolEvent.ok } : {}),
            });
            return;
          }
          if (toolEvent.status === "start") {
            sendStream({
              kind: "tool",
              sessionId,
              name: "web_search",
              status: "start",
              query: toolEvent.query,
            });
            return;
          }
          sendStream({
            kind: "tool",
            sessionId,
            name: "web_search",
            status: "done",
            query: toolEvent.query,
            resultCount: toolEvent.resultCount,
            ...(toolEvent.blocked ? { blocked: true } : {}),
            results: toolEvent.results,
          });
        },
        () => {
          sendStream({ kind: "reset", sessionId });
        },
        (chunk) => {
          sendStream({ kind: "reasoning", sessionId, text: chunk });
        },
        {
          chatId: sessionId,
          // Reuse the exact channels the computer-use path uses, so the chat
          // approval prompt and artifact pane light up with no extra wiring.
          onApprovalRequest: (request) => {
            event.sender.send("office:taskApprovalRequest", request);
          },
          onArtifact: (item) => {
            event.sender.send("office:taskArtifact", item);
          },
        },
      );
      sendStream({
        kind: "done",
        sessionId,
        timingMs: result.timingMs,
        modelId: result.modelId,
      });
      recordTiming("chat", startedAt);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendStream({ kind: "error", sessionId, message });
      throw error;
    }
  });

  const taskAbortControllers = new Map<string, AbortController>();

  /**
   * Run one ad-hoc Task. Nothing is streamed back: the runtime writes progress
   * to the audit log and the renderer reads it from there, so the execution
   * path has no route to the screen. Approvals land in the tray instead of
   * blocking the call.
   */
  ipcMain.handle("office:readLocalMedia", async (_event, path: unknown) => {
    if (typeof path !== "string" || !path.trim()) return null;
    const { readLocalMediaDataUrl } = await import("./services/local-media.js");
    const root = join(app.getPath("userData"), "desktop-captures");
    return readLocalMediaDataUrl(path.trim(), [root]);
  });

  ipcMain.handle("office:runTask", async (event, input: unknown) => {
    const body = input as {
      text?: unknown;
      maxIterations?: unknown;
      chatId?: unknown;
      history?: unknown;
    };
    if (typeof body?.text !== "string" || !body.text.trim()) {
      throw new Error("Task text is required");
    }
    // The renderer holds the conversation; a task that only gets the last
    // sentence cannot resolve "이거 슬랙으로 보내줘".
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter(
        (turn): turn is { role: "user" | "assistant"; content: string } =>
          typeof turn === "object" &&
          turn !== null &&
          ((turn as { role?: unknown }).role === "user" ||
            (turn as { role?: unknown }).role === "assistant") &&
          typeof (turn as { content?: unknown }).content === "string" &&
          (turn as { content: string }).content.trim().length > 0,
      )
      .slice(-8);
    const runId = randomUUID();
    const controller = new AbortController();
    taskAbortControllers.set(runId, controller);
    try {
      const { runComputerUseTask } = await import("./services/computer-use.js");
      const chatId =
        typeof body.chatId === "string" && body.chatId.trim()
          ? body.chatId.trim()
          : "chat";
      const result = await runComputerUseTask({
        userData: app.getPath("userData"),
        text: body.text.trim(),
        chatId,
        ...(typeof body.maxIterations === "number"
          ? { maxIterations: body.maxIterations }
          : {}),
        ...(history.length > 0 ? { history } : {}),
        signal: controller.signal,
        // Asked and answered where the person already is, rather than in the
        // Office tray on the other side of the app.
        onApprovalRequest: (request) => {
          event.sender.send("office:taskApprovalRequest", {
            ...request,
            runId,
          });
        },
        onMedia: (item) => {
          event.sender.send("office:taskMedia", { ...item, runId });
        },
        // Shown where it was asked for, the moment it exists.
        onArtifact: (item) => {
          event.sender.send("office:taskArtifact", { ...item, runId });
        },
      });
      return { ...result, runId };
    } finally {
      taskAbortControllers.delete(runId);
    }
  });

  ipcMain.handle(
    "office:resolveTaskApproval",
    async (_event, input: unknown) => {
      const body = input as { callId?: unknown; decision?: unknown };
      if (typeof body?.callId !== "string" || !body.callId.trim()) {
        throw new Error("Invalid approval id");
      }
      const decision = body.decision;
      if (
        decision !== "allow_once" &&
        decision !== "allow_always" &&
        decision !== "deny"
      ) {
        throw new Error("Invalid approval decision");
      }
      // Approvals are resolved by the in-process waiter shared by chat and the
      // task runner. The engine surfaces its permission asks through this same
      // callId path, so there is one approval owner.
      const { settleApproval } = await import("./office/approval-waiters.js");
      return settleApproval(
        body.callId.trim(),
        decision === "deny"
          ? "rejected"
          : decision === "allow_always"
            ? "approved_always"
            : "approved",
      );
    },
  );

  ipcMain.handle("office:abortTask", (_event, runId: unknown) => {
    if (typeof runId === "string" && runId.trim()) {
      const c = taskAbortControllers.get(runId.trim());
      c?.abort();
      return Boolean(c);
    }
    for (const c of taskAbortControllers.values()) c.abort();
    taskAbortControllers.clear();
    return true;
  });

  // ------------------------------------------------------------------ Floor
  ipcMain.handle("office:floorSnapshot", async () => {
    const { floorSnapshot } = await import("./services/floor.js");
    return floorSnapshot();
  });
  ipcMain.handle(
    "office:floorResolveApproval",
    async (_event, id: unknown, approved: unknown, decision: unknown) => {
      if (typeof id !== "string" || !id.trim())
        throw new Error("Invalid approval id");
      if (typeof approved !== "boolean")
        throw new Error("Invalid approval decision");
      const { floorResolveApproval } = await import("./services/floor.js");
      const resolved = await floorResolveApproval(
        id.trim(),
        approved,
        typeof decision === "string" ? decision : "",
      );
      // A chat task is waiting inside its own call rather than in the queue,
      // so the tray alone cannot restart it. Telling it here is what makes
      // clicking Approve do something for computer use.
      const { settleApproval } = await import("./office/approval-waiters.js");
      settleApproval(id.trim(), approved ? "approved" : "rejected");
      return resolved;
    },
  );
  ipcMain.handle("office:floorDirective", async (_event, input: unknown) => {
    const body = input as { kind?: unknown; body?: unknown; traceId?: unknown };
    if (
      body?.kind !== "STEER" &&
      body?.kind !== "ABORT" &&
      body?.kind !== "PIN"
    ) {
      throw new Error("Directive must be STEER, ABORT or PIN");
    }
    if (typeof body.body !== "string" || !body.body.trim()) {
      throw new Error("A directive needs text");
    }
    const { floorDirective } = await import("./services/floor.js");
    return floorDirective({
      kind: body.kind,
      body: body.body.trim(),
      ...(typeof body.traceId === "string" && body.traceId
        ? { traceId: body.traceId }
        : {}),
    });
  });
  ipcMain.handle(
    "office:floorChannel",
    async (_event, channelId: unknown, sinceCreatedAt: unknown) => {
      const { floorChannel } = await import("./services/floor.js");
      return floorChannel(
        typeof channelId === "string" && channelId ? channelId : undefined,
        typeof sinceCreatedAt === "number" ? sinceCreatedAt : undefined,
      );
    },
  );
  ipcMain.handle(
    "office:floorSay",
    async (
      _event,
      text: unknown,
      channelId: unknown,
      to: unknown,
      attached: unknown,
    ) => {
      if (typeof text !== "string" || !text.trim())
        throw new Error("A goal needs text");
      const { floorSay } = await import("./services/floor.js");
      return floorSay(
        text.trim(),
        typeof channelId === "string" && channelId ? channelId : undefined,
        typeof to === "string" && to ? to : undefined,
        typeof attached === "string" && attached.trim() ? attached : undefined,
      );
    },
  );
  ipcMain.handle(
    "office:floorCreateChannel",
    async (_event, input: unknown) => {
      const body = input as {
        name?: unknown;
        purpose?: unknown;
        memberIds?: unknown;
        defaultMemberId?: unknown;
      };
      if (typeof body?.name !== "string" || !body.name.trim()) {
        throw new Error("A channel needs a name");
      }
      const { floorCreateChannel } = await import("./services/floor.js");
      return floorCreateChannel({
        name: body.name.trim(),
        purpose: typeof body.purpose === "string" ? body.purpose.trim() : "",
        ...(Array.isArray(body.memberIds)
          ? {
              memberIds: body.memberIds.filter(
                (item): item is string => typeof item === "string",
              ),
            }
          : {}),
        ...(typeof body.defaultMemberId === "string"
          ? { defaultMemberId: body.defaultMemberId }
          : {}),
      });
    },
  );
  ipcMain.handle(
    "office:floorUpdateChannel",
    async (_event, id: unknown, patch: unknown) => {
      if (typeof id !== "string" || !id.trim())
        throw new Error("Invalid channel id");
      const body = patch as {
        name?: unknown;
        purpose?: unknown;
        memberIds?: unknown;
        defaultMemberId?: unknown;
      };
      const { floorUpdateChannel } = await import("./services/floor.js");
      return floorUpdateChannel(id.trim(), {
        ...(typeof body?.name === "string" ? { name: body.name.trim() } : {}),
        ...(typeof body?.purpose === "string"
          ? { purpose: body.purpose.trim() }
          : {}),
        ...(Array.isArray(body?.memberIds)
          ? {
              memberIds: body.memberIds.filter(
                (item): item is string => typeof item === "string",
              ),
            }
          : {}),
        ...(typeof body?.defaultMemberId === "string"
          ? { defaultMemberId: body.defaultMemberId }
          : {}),
      });
    },
  );
  ipcMain.handle(
    "office:ensureDmChannel",
    async (_event, memberId: unknown) => {
      if (typeof memberId !== "string" || !memberId.trim())
        throw new Error("Invalid teammate id");
      const { ensureDmChannel } = await import("./services/floor.js");
      return ensureDmChannel(memberId.trim());
    },
  );
  ipcMain.handle(
    "office:inviteToChannel",
    async (_event, channelId: unknown, memberIds: unknown) => {
      if (typeof channelId !== "string" || !channelId.trim())
        throw new Error("Invalid channel id");
      const ids = Array.isArray(memberIds)
        ? memberIds.filter((item): item is string => typeof item === "string")
        : [];
      const { inviteToChannel } = await import("./services/floor.js");
      return inviteToChannel(channelId.trim(), ids);
    },
  );
  ipcMain.handle(
    "office:removeFromChannel",
    async (_event, channelId: unknown, memberId: unknown) => {
      if (typeof channelId !== "string" || !channelId.trim())
        throw new Error("Invalid channel id");
      if (typeof memberId !== "string" || !memberId.trim())
        throw new Error("Invalid teammate id");
      const { removeFromChannel } = await import("./services/floor.js");
      return removeFromChannel(channelId.trim(), memberId.trim());
    },
  );
  ipcMain.handle("office:floorDeleteChannel", async (_event, id: unknown) => {
    if (typeof id !== "string" || !id.trim())
      throw new Error("Invalid channel id");
    const channelId = id.trim();
    const { floorDeleteChannel } = await import("./services/floor.js");
    const result = await floorDeleteChannel(channelId);
    if (result.ok) {
      // Chat transcripts live in a separate store from the Floor. Without this
      // purge, a hard refresh reopens the deleted room's messages in whatever
      // chat is left (usually #general).
      const { sessionBelongsToChannel } = await import(
        "../shared/chat-session-id.js"
      );
      for (const session of listChatSessions(requireStore(), 500)) {
        if (!sessionBelongsToChannel(session.id, channelId)) continue;
        deleteChatSession(requireStore(), session.id);
      }
    }
    return result;
  });
  ipcMain.handle("office:floorHireStaff", async (_event, input: unknown) => {
    const body = input as {
      role?: unknown;
      layer?: unknown;
      personality?: unknown;
    };
    if (typeof body?.role !== "string" || !body.role.trim()) {
      throw new Error("A new colleague needs a role");
    }
    if (typeof body.layer !== "string" || !body.layer.trim()) {
      throw new Error("A new colleague needs a job");
    }
    const { floorHireStaff } = await import("./services/floor.js");
    return floorHireStaff({
      role: body.role.trim(),
      layer: body.layer.trim(),
      personality:
        typeof body.personality === "string" ? body.personality.trim() : "",
    });
  });
  ipcMain.handle(
    "office:floorUpdateStaff",
    async (_event, id: unknown, patch: unknown) => {
      if (typeof id !== "string" || !id.trim())
        throw new Error("Invalid staff id");
      const body = patch as {
        role?: unknown;
        layer?: unknown;
        personality?: unknown;
      };
      const { floorUpdateStaff } = await import("./services/floor.js");
      return floorUpdateStaff(id.trim(), {
        ...(typeof body?.role === "string" ? { role: body.role.trim() } : {}),
        ...(typeof body?.layer === "string"
          ? { layer: body.layer.trim() }
          : {}),
        ...(typeof body?.personality === "string"
          ? { personality: body.personality.trim() }
          : {}),
      });
    },
  );
  ipcMain.handle("office:floorDismissStaff", async (_event, id: unknown) => {
    if (typeof id !== "string" || !id.trim())
      throw new Error("Invalid staff id");
    const { floorDismissStaff } = await import("./services/floor.js");
    return floorDismissStaff(id.trim());
  });
  ipcMain.handle("office:floorBrief", async (_event, regenerate: unknown) => {
    const mod = await import("./services/floor.js");
    return regenerate === true ? mod.floorRegenerateBrief() : mod.floorBrief();
  });
  ipcMain.handle(
    "office:channelEvents",
    async (_event, channelId: unknown, sinceTs: unknown) => {
      const { channelEvents } = await import("./services/floor.js");
      return channelEvents(
        typeof channelId === "string" ? channelId : undefined,
        typeof sinceTs === "number" ? sinceTs : undefined,
      );
    },
  );
  ipcMain.handle("office:listTeamMembers", async () => {
    const { listTeamMembers } = await import("./services/floor.js");
    return listTeamMembers();
  });
  ipcMain.handle(
    "office:generatePersona",
    async (_event, prompt: unknown, locale: unknown) => {
      const { generatePersona } = await import(
        "./services/persona-generator.js"
      );
      const promptStr = typeof prompt === "string" ? prompt : "";
      const localeStr = typeof locale === "string" ? locale : "en";
      return generatePersona(promptStr, localeStr, app.getPath("userData"));
    },
  );
  ipcMain.handle("office:addTeamMember", async (_event, input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Invalid input");
    const row = input as Record<string, unknown>;
    if (typeof row.name !== "string" || typeof row.persona !== "string") {
      throw new Error("Invalid teammate");
    }
    const { addTeamMember } = await import("./services/floor.js");
    const { isToolPermission } = await import("./office/staff/team-members.js");
    return addTeamMember({
      name: row.name,
      persona: row.persona,
      ...(typeof row.toneHints === "string"
        ? { toneHints: row.toneHints }
        : {}),
      ...(typeof row.permission === "string" && isToolPermission(row.permission)
        ? { permission: row.permission }
        : {}),
    });
  });
  ipcMain.handle("office:removeTeamMember", async (_event, id: unknown) => {
    if (typeof id !== "string" || !id.trim()) throw new Error("Invalid id");
    const { removeTeamMember } = await import("./services/floor.js");
    return removeTeamMember(id.trim());
  });
  ipcMain.handle(
    "office:updateTeamMember",
    async (_event, id: unknown, patch: unknown) => {
      if (typeof id !== "string" || !id.trim()) throw new Error("Invalid id");
      if (!patch || typeof patch !== "object") throw new Error("Invalid patch");
      const row = patch as Record<string, unknown>;
      const { updateTeamMember } = await import("./services/floor.js");
      const { isToolPermission } =
        await import("./office/staff/team-members.js");
      return updateTeamMember(id.trim(), {
        ...(typeof row.name === "string" ? { name: row.name } : {}),
        ...(typeof row.persona === "string" ? { persona: row.persona } : {}),
        ...(typeof row.toneHints === "string"
          ? { toneHints: row.toneHints }
          : {}),
        ...(typeof row.permission === "string" &&
        isToolPermission(row.permission)
          ? { permission: row.permission }
          : {}),
      });
    },
  );
  ipcMain.handle(
    "office:listChannelMemories",
    async (_event, input: unknown) => {
      if (!input || typeof input !== "object") throw new Error("Invalid input");
      const row = input as Record<string, unknown>;
      if (typeof row.channelId !== "string")
        throw new Error("channelId required");
      const { listChannelMemories } = await import("./services/floor.js");
      return listChannelMemories({
        channelId: row.channelId,
        ...(typeof row.memberId === "string" ? { memberId: row.memberId } : {}),
        ...(typeof row.includeShared === "boolean"
          ? { includeShared: row.includeShared }
          : {}),
      });
    },
  );
  ipcMain.handle("office:addChannelMemory", async (_event, input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Invalid input");
    const row = input as Record<string, unknown>;
    if (
      typeof row.channelId !== "string" ||
      typeof row.memberId !== "string" ||
      typeof row.content !== "string"
    ) {
      throw new Error("Invalid memory");
    }
    const { addChannelMemory } = await import("./services/floor.js");
    return addChannelMemory({
      channelId: row.channelId,
      memberId: row.memberId,
      content: row.content,
    });
  });
  ipcMain.handle(
    "office:promoteChannelMemory",
    async (_event, id: unknown, channelId: unknown) => {
      if (typeof id !== "string" || typeof channelId !== "string") {
        throw new Error("Invalid promote");
      }
      const { promoteChannelMemory } = await import("./services/floor.js");
      return promoteChannelMemory(id, channelId);
    },
  );
  ipcMain.handle(
    "office:prepareChannelSend",
    async (_event, input: unknown) => {
      if (!input || typeof input !== "object") throw new Error("Invalid input");
      const row = input as Record<string, unknown>;
      if (typeof row.text !== "string") throw new Error("Invalid text");
      const { prepareChannelSend } = await import("./services/floor.js");
      return prepareChannelSend({
        text: row.text,
        ...(typeof row.channelId === "string"
          ? { channelId: row.channelId }
          : {}),
        ...(typeof row.to === "string" ? { to: row.to } : {}),
      });
    },
  );
  ipcMain.handle(
    "office:appendChannelAssistant",
    async (_event, input: unknown) => {
      if (!input || typeof input !== "object") throw new Error("Invalid input");
      const row = input as Record<string, unknown>;
      if (
        typeof row.channelId !== "string" ||
        typeof row.authorId !== "string" ||
        typeof row.text !== "string"
      ) {
        throw new Error("Invalid assistant append");
      }
      const { appendChannelAssistant } = await import("./services/floor.js");
      return appendChannelAssistant({
        channelId: row.channelId,
        authorId: row.authorId,
        text: row.text,
      });
    },
  );
  ipcMain.handle(
    "office:truncateChannelEventsAfter",
    async (_event, input: unknown) => {
      if (!input || typeof input !== "object") throw new Error("Invalid input");
      const row = input as Record<string, unknown>;
      if (typeof row.channelId !== "string" || typeof row.eventId !== "string") {
        throw new Error("Invalid truncate");
      }
      const { truncateChannelEventsAfter } =
        await import("./services/floor.js");
      return truncateChannelEventsAfter({
        channelId: row.channelId,
        eventId: row.eventId,
      });
    },
  );

  ipcMain.handle("office:getAllowedPaths", async () => {
    const { getAllowedPaths } = await import("./office/config.js");
    return getAllowedPaths();
  });
  ipcMain.handle("office:addAllowedPath", async (_event, path: unknown) => {
    if (typeof path !== "string" || !path.trim())
      throw new Error("Invalid path");
    const { addAllowedPath } = await import("./office/config.js");
    return addAllowedPath(path.trim());
  });
  ipcMain.handle("office:removeAllowedPath", async (_event, path: unknown) => {
    if (typeof path !== "string" || !path.trim())
      throw new Error("Invalid path");
    const { removeAllowedPath } = await import("./office/config.js");
    return removeAllowedPath(path.trim());
  });
  ipcMain.handle("office:pickAllowedFolder", async (event) => {
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const { addAllowedPath } = await import("./office/config.js");
    await addAllowedPath(result.filePaths[0]);
    return result.filePaths[0];
  });
  ipcMain.handle("office:getComputerUseSettings", async () => {
    const { getComputerUseConfig } = await import("./office/config.js");
    return getComputerUseConfig();
  });
  ipcMain.handle(
    "office:updateComputerUseSettings",
    async (_event, patch: unknown) => {
      if (!patch || typeof patch !== "object")
        throw new Error("Invalid settings patch");
      const { updateComputerUseConfig } = await import("./office/config.js");
      return updateComputerUseConfig(patch as Record<string, unknown>);
    },
  );
  ipcMain.handle("office:desktopControlStatus", async () => {
    const { getComputerUseConfig } = await import("./office/config.js");
    const { controlStatus } = await import("./desktop/index.js");
    const { PANIC_ACCELERATOR } = await import("./desktop/panic.js");
    const config = await getComputerUseConfig();
    const status = await controlStatus(config.desktopControl);
    return { ...status, accelerator: PANIC_ACCELERATOR };
  });
  ipcMain.handle("office:desktopStopNow", async () => {
    const { trigger } = await import("./desktop/panic.js");
    await trigger("ui");
    // Turned off as well as stopped, so nothing resumes behind the person's
    // back the next time the app starts.
    const { updateComputerUseConfig } = await import("./office/config.js");
    await updateComputerUseConfig({ desktopControl: false });
    return true;
  });
  ipcMain.handle("office:desktopResume", async () => {
    const { resumeAfterStop } = await import("./desktop/index.js");
    resumeAfterStop();
    return true;
  });
  ipcMain.handle("office:listToolAudit", async (_event, limit?: unknown) => {
    const { readRecentAudit } = await import("./audit/tool-audit.js");
    const n = typeof limit === "number" ? limit : 200;
    return readRecentAudit(n);
  });

  ipcMain.handle("office:listMemories", () => listMemories(requireStore()));
  ipcMain.handle("office:listChatSessions", () =>
    listChatSessions(requireStore()),
  );
  ipcMain.handle("office:getChatSession", (_event, id: unknown) => {
    if (typeof id !== "string" || !id.trim())
      throw new Error("Invalid chat session id");
    const row = getChatSession(requireStore(), id.trim());
    if (!row) return null;
    let messages: unknown[] = [];
    try {
      const parsed = JSON.parse(row.messagesJson) as unknown;
      if (Array.isArray(parsed)) messages = parsed;
    } catch {
      messages = [];
    }
    // Replies written before the scrubber reached chat still hold the leaked
    // call verbatim, so a reopened transcript would show it again. Clean on the
    // way out rather than rewriting everyone's history on disk.
    messages = messages.map((message) => {
      if (!message || typeof message !== "object") return message;
      const entry = message as { role?: unknown; content?: unknown };
      if (entry.role !== "assistant" || typeof entry.content !== "string") {
        return message;
      }
      const cleaned = scrubModelOutputForUi(entry.content);
      return cleaned === entry.content ? message : { ...entry, content: cleaned };
    });
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messageCount: row.messageCount,
      pinned: row.pinned,
      titleLocked: row.titleLocked,
      messages,
    };
  });
  ipcMain.handle("office:saveChatSession", (_event, input: unknown) => {
    if (!input || typeof input !== "object")
      throw new Error("Invalid chat session");
    const body = input as { id?: unknown; title?: unknown; messages?: unknown };
    if (typeof body.id !== "string" || !body.id.trim())
      throw new Error("Invalid chat session id");
    if (!Array.isArray(body.messages)) throw new Error("Invalid chat messages");
    const saved = saveChatSession(requireStore(), {
      id: body.id.trim(),
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      messagesJson: JSON.stringify(body.messages),
    });
    return {
      id: saved.id,
      title: saved.title,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      messageCount: saved.messageCount,
      pinned: saved.pinned,
      titleLocked: saved.titleLocked,
    };
  });
  ipcMain.handle(
    "office:renameChatSession",
    (_event, id: unknown, title: unknown) => {
      if (typeof id !== "string" || !id.trim())
        throw new Error("Invalid chat session id");
      if (typeof title !== "string") throw new Error("Invalid chat title");
      const renamed = renameChatSession(requireStore(), id.trim(), title);
      if (!renamed) throw new Error("Chat session not found");
      return renamed;
    },
  );
  ipcMain.handle(
    "office:autotitleChatSession",
    (_event, id: unknown, title: unknown) => {
      if (typeof id !== "string" || !id.trim())
        throw new Error("Invalid chat session id");
      if (typeof title !== "string") throw new Error("Invalid chat title");
      // Soft, non-locking: skips a session the user has renamed.
      return autotitleChatSession(requireStore(), id.trim(), title);
    },
  );
  ipcMain.handle(
    "office:setChatSessionPinned",
    (_event, id: unknown, pinned: unknown) => {
      if (typeof id !== "string" || !id.trim())
        throw new Error("Invalid chat session id");
      if (typeof pinned !== "boolean") throw new Error("Invalid pinned flag");
      const updated = setChatSessionPinned(requireStore(), id.trim(), pinned);
      if (!updated) throw new Error("Chat session not found");
      return updated;
    },
  );
  ipcMain.handle("office:deleteChatSession", (_event, id: unknown) => {
    if (typeof id !== "string" || !id.trim())
      throw new Error("Invalid chat session id");
    return deleteChatSession(requireStore(), id.trim());
  });
  ipcMain.handle("office:addMemory", (_event, body: unknown) => {
    if (typeof body !== "string") throw new Error("Invalid memory body");
    return addMemory(requireStore(), { body, source: "manual" });
  });
  ipcMain.handle(
    "office:updateMemory",
    (_event, id: unknown, body: unknown) => {
      if (typeof id !== "string" || !id || typeof body !== "string") {
        throw new Error("Invalid memory update");
      }
      const updated = updateMemory(requireStore(), id, body);
      if (!updated) throw new Error("Memory not found");
      return updated;
    },
  );
  ipcMain.handle("office:deleteMemory", (_event, id: unknown) => {
    if (typeof id !== "string" || !id) throw new Error("Invalid memory id");
    return deleteMemory(requireStore(), id);
  });
  ipcMain.handle(
    "office:importMemories",
    (_event, text: unknown, fileName?: unknown) => {
      if (typeof text !== "string") throw new Error("Invalid import text");
      const name = typeof fileName === "string" ? fileName : undefined;
      const bodies = parseMemoryImportText(text, name);
      if (bodies.length === 0) {
        return { imported: 0, skipped: 0 };
      }
      const result = importMemories(requireStore(), bodies);
      return { imported: result.imported, skipped: result.skipped };
    },
  );
  ipcMain.handle("office:importMemoriesFromFile", async (event) => {
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow();
    const openOptions = {
      properties: ["openFile" as const],
      title: "Import memory",
      filters: [
        {
          name: "Memory files",
          extensions: ["md", "markdown", "txt", "json", "csv"],
        },
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "JSON", extensions: ["json"] },
        { name: "Text / CSV", extensions: ["txt", "csv"] },
        { name: "All files", extensions: ["*"] },
      ],
    };
    // Let the click's UI update (button state, etc.) paint before the native
    // modal steals the event loop on Windows — otherwise the dialog can feel
    // like it hung for a beat.
    await new Promise((resolve) => setImmediate(resolve));
    const result = win
      ? await dialog.showOpenDialog(win, openOptions)
      : await dialog.showOpenDialog(openOptions);
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0]!;
    const text = readFileSync(filePath, "utf8");
    // Guard against accidental huge dumps locking the UI.
    if (text.length > 1_000_000) {
      throw new Error("Memory file is too large (max 1 MB)");
    }
    const fileName = basename(filePath);
    const bodies = parseMemoryImportText(text, fileName);
    if (bodies.length === 0) {
      return { fileName, imported: 0, skipped: 0 };
    }
    const imported = importMemories(requireStore(), bodies);
    return { fileName, imported: imported.imported, skipped: imported.skipped };
  });

  // MCP Server Management Handlers
  ipcMain.handle("office:listMcpServers", async () => {
    const { getMcpManager } = await import("./services/mcp/manager.js");
    return getMcpManager().listServers();
  });
  ipcMain.handle("office:addMcpServer", async (_event, config: unknown) => {
    const { getMcpManager } = await import("./services/mcp/manager.js");
    return getMcpManager().addServer(config as any);
  });
  ipcMain.handle(
    "office:updateMcpServer",
    async (_event, id: unknown, updates: unknown) => {
      if (typeof id !== "string") throw new Error("Invalid server id");
      const { getMcpManager } = await import("./services/mcp/manager.js");
      return getMcpManager().updateServer(id, updates as any);
    },
  );
  ipcMain.handle("office:removeMcpServer", async (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid server id");
    const { getMcpManager } = await import("./services/mcp/manager.js");
    return getMcpManager().removeServer(id);
  });
  ipcMain.handle("office:connectMcpServer", async (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid server id");
    const { getMcpManager } = await import("./services/mcp/manager.js");
    // Returns while the handshake is still in flight; the list reports progress.
    return getMcpManager().beginConnect(id);
  });
  ipcMain.handle("office:disconnectMcpServer", async (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid server id");
    const { getMcpManager } = await import("./services/mcp/manager.js");
    return getMcpManager().disconnectServer(id);
  });
  ipcMain.handle("office:listMcpTools", async () => {
    const { getMcpManager } = await import("./services/mcp/manager.js");
    return getMcpManager().listAllTools();
  });
}

function createWindow(logger: pino.Logger): void {
  const preload = resolvePreloadPath();
  const icon = resolveAppIcon();
  logger.info({ preload, icon }, "Creating BrowserWindow with preload");

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "Redrob Office",
    // Chromium paints this before the document exists. Left at the default the
    // window opens as a white sheet even on a dark desktop, which is the flash
    // people see on every launch; the renderer picks the real theme up from
    // storage in its head.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0f17" : "#f3f4f6",
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Some document previews lean on Chromium plugins to draw; without this
      // the preview is a blank rectangle with no error to explain itself.
      plugins: true,
    },
  });
  registerDocUiWindow(mainWindow);

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    logger.error({ preloadPath, err: error }, "Preload script failed");
    void dialog.showErrorBox(
      "Preload failed",
      `Could not load the office bridge.\n\n${preloadPath}\n\n${error.message}`,
    );
  });

  mainWindow.on("ready-to-show", () => {
    resetPageZoom(mainWindow.webContents);
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        void shell.openExternal(parsed.toString());
      }
    } catch {
      /* ignore invalid */
    }
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Electron's default zoomIn is often Ctrl+Shift+= only; bind Ctrl+= / Ctrl++ / Ctrl+0 too.
  // Prefer `code` — with Ctrl held, Windows/IME sometimes leaves `key` empty or non-digit.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.alt || !(input.control || input.meta))
      return;
    if (input.isAutoRepeat) return;
    const contents = mainWindow.webContents;
    const code = input.code;
    if (
      code === "Equal" ||
      code === "NumpadAdd" ||
      input.key === "=" ||
      input.key === "+"
    ) {
      event.preventDefault();
      contents.setZoomLevel(Math.min(5, contents.getZoomLevel() + 0.5));
      return;
    }
    if (code === "Minus" || code === "NumpadSubtract" || input.key === "-") {
      event.preventDefault();
      contents.setZoomLevel(Math.max(-3, contents.getZoomLevel() - 0.5));
      return;
    }
    if (
      !input.shift &&
      (code === "Digit0" || code === "Numpad0" || input.key === "0")
    ) {
      event.preventDefault();
      resetPageZoom(contents);
    }
  });
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.redrob.desk");
  }
  installAppMenu();
  // The Floor demo writes a complete userData tree; pointing the app at it is
  // how the run is reviewed in BoardView instead of only in a console log.
  // REDROB_DEV_PROFILE isolates a dev worktree under its own subtree so two
  // checkouts never share one SQLite file or profile (OpenWork's dev isolation).
  const dataDirectory = resolveUserDataDir(app.getPath("userData"), {
    userDataOverride: process.env["REDROB_OFFICE_USER_DATA"],
    devProfile: process.env["REDROB_DEV_PROFILE"],
  });
  mkdirSync(dataDirectory, { recursive: true });
  resolvedUserData = dataDirectory;
  process.env.REDROB_MODELS_DIR = modelsDirPath(dataDirectory);
  setMainClock(new RealTimeSource());
  configureUserRubrics(dataDirectory);
  configureUserWorkflows(dataDirectory);
  configureArtifacts(dataDirectory);
  configureCompanyProfile(dataDirectory);
  configureComputerUse(dataDirectory);
  configureChatPermissions(dataDirectory);
  installDesktopPanicStop();
  configureDocSessions(dataDirectory);
  configureToolAudit(dataDirectory);
  void import("./services/floor.js").then(({ configureFloor }) => {
    configureFloor(dataDirectory);
  });
  void import("./services/day-log.js").then(({ configureDayLogRoot }) => {
    configureDayLogRoot(dataDirectory);
  });
  void import("./services/mcp/manager.js").then(({ getMcpManager }) => {
    void getMcpManager().initialize(dataDirectory);
  });
  const logger = createLogger();

  void loadSetupState(dataDirectory)
    .then(async (state) => {
      await applyInferenceRuntimeConfig(state);
      const { startInferenceHost } =
        await import("./services/inference-host.js");
      const started = await startInferenceHost((line) => logger.info(line));
      logger.info(
        {
          isolation: started.isolation,
          backend: started.plan.backend,
          model: started.plan.modelId,
          gpuLayers: started.plan.gpuLayers,
          threads: started.plan.threads,
        },
        "inference host ready",
      );
      setVisionSidecarDisabledHandler((reason) => {
        logger.error({ reason }, "local vision sidecar disabled");
        // A notification, not a modal: this fires mid-recording, and a dialog
        // would take the screen from whatever the person is being recorded doing.
        notifyDesktop({
          title: "Local vision unavailable",
          body: `On-device vision stopped after the llama-server sidecar failed (${reason}). Text chat is unaffected — opt in to cloud vision for day-log screenshots, or restart after fixing weights/binaries.`,
        });
      });
      try {
        const { resumeIncomplete } = await import("./services/asr/batch.js");
        const { ensureAsrReady } = await import("./services/asr/voice.js");
        await ensureAsrReady((line) => logger.info(line));
        const resumed = await resumeIncomplete(dataDirectory);
        if (resumed.length > 0) {
          logger.info(
            { count: resumed.length },
            "asr incomplete transcriptions resumed",
          );
        }
      } catch (asrErr) {
        logger.warn(
          { err: asrErr },
          "ASR host not ready at boot (whisper binary may be missing)",
        );
      }
    })
    .catch((error) => {
      logger.warn(
        { err: error },
        "Failed to apply inference runtime config on startup",
      );
    });

  try {
    store = openStore(join(dataDirectory, "redrob.sqlite"));
  } catch (error) {
    logger.error({ err: error }, "Failed to open SQLite store");
    void dialog.showErrorBox(
      "Redrob Office failed to start",
      `Could not open the local database.\n\n${error instanceof Error ? error.message : String(error)}\n\nIf you just installed or pulled changes, run:\npnpm --filter @redrob/office rebuild:native`,
    );
    app.quit();
    return;
  }

  void loadTelemetryState(dataDirectory)
    .then((state) => {
      telemetry.setOptedIn(state.optedIn);
      otlp.setOptedIn(state.optedIn);
      logger.info(
        { telemetryOptIn: state.optedIn },
        "telemetry preference loaded",
      );
    })
    .catch((error) => {
      logger.warn({ err: error }, "Failed to load telemetry preference");
    });

  void loadMeasurements(dataDirectory)
    .then((timings) => {
      // Keep anything measured before the file finished loading.
      measuredTimings = [...timings, ...measuredTimings].slice(
        -MAX_MEASUREMENTS,
      );
    })
    .catch((error) => {
      logger.warn({ err: error }, "Failed to load measured timings");
    });

  logger.info(
    { database: join(dataDirectory, "redrob.sqlite") },
    "Redrob Office started",
  );
  registerIpcHandlers(logger);
  startAutoUpdates(logger);
  // A flow with a schedule on it is only automatic if something is watching the
  // clock while the person is elsewhere.
  void import("./services/workflow-trigger-runner.js").then(
    ({ startScheduledWorkflows }) => {
      startScheduledWorkflows(dataDirectory, (message) => logger.info(message));
    },
  );
  createWindow(logger);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(logger);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeWebSearchWindow();
  closePageFetchWindow();
  closeAgentBrowser();
  // A recording is a hidden window holding the screen; it does not outlive
  // the app that started it.
  void import("./desktop/record.js").then(({ stopRecordingIfRunning }) =>
    stopRecordingIfRunning(),
  );
  // A link to a served page is only promised for as long as the app is open.
  void import("./services/page-serve.js").then(({ stopServingPages }) =>
    stopServingPages(),
  );
  void import("./services/workflow-triggers.js").then(
    ({ stopWorkflowTriggers }) => stopWorkflowTriggers(),
  );
  if (measurementsSaveTimer) {
    clearTimeout(measurementsSaveTimer);
    measurementsSaveTimer = null;
  }
  void saveMeasurements(app.getPath("userData"), measuredTimings).catch(
    () => undefined,
  );
  store?.close();
  store = undefined;
  void clearModelCache();
  shutdownVisionSidecar();
  // Shutdown is a normal Floor transition: checkpoint, then close the queue.
  void import("./services/floor.js").then(async ({ peekFloor, stopFloor }) => {
    await peekFloor()?.handlePower("shutdown");
    await stopFloor();
  });
});
