import type {
  OfficeApi,
  ArtifactView,
  DeviceProfile,
  IntakeBatchResult,
  SetupSnapshot,
} from "../../shared/office-api";
import { REDROB_CONSOLE_URL } from "../../shared/office-api";
import type { DocRenderModel, XlsxSheetView } from "../../shared/doc-render";
import { WORKSPACES } from "@redrob/ui";
import { nowIso, nowMs } from "./clock";
import { forceBetaGateEnabled } from "./beta-access";
import { createMockFloorApi } from "./desk-bridge-floor";
import { sessionBelongsToChannel } from "../../shared/chat-session-id";

function blankMockSheet(name = "Sheet1"): XlsxSheetView {
  return {
    name,
    columnWidths: [10],
    rows: [{ cells: [{ text: "" }] }],
    charts: [],
  };
}

function mockXlsxModel(sheets: XlsxSheetView[]): Extract<DocRenderModel, { kind: "xlsx" }> {
  return { kind: "xlsx", sheets };
}

function ensureSheetSize(sheet: XlsxSheetView, row: number, column: number): void {
  while (sheet.rows.length < row) {
    sheet.rows.push({ cells: [] });
  }
  const target = sheet.rows[row - 1]!;
  while (target.cells.length < column) {
    target.cells.push({ text: "" });
  }
  while (sheet.columnWidths.length < column) {
    sheet.columnWidths.push(10);
  }
}

/**
 * Browser/Cursor-preview stand-in for the Electron preload bridge.
 * Real IPC only exists inside the Office Electron window.
 */
export function createMockOfficeApi(): OfficeApi {
  let telemetryOptIn = true;
  let mockRubrics: string[] = [];
  /** In-memory Documents shelf so create → edit → reopen works without Electron. */
  const mockArtifacts = new Map<string, ArtifactView>();
  const mockXlsxSheets = new Map<string, XlsxSheetView[]>();
  // Seeded so the `/` flow palette, the skill preview, and a chat flow-run have
  // something to show in the browser mock.
  let mockWorkflows: import("../../shared/office-api").WorkflowView[] = [
    {
      id: "general/competitor-roundup",
      version: 1,
      title: "Competitor roundup",
      description:
        "Research what competitors shipped, then turn it into a page and a deck.",
      instructions:
        "1. Search the web for what each competitor shipped recently.\n" +
        "2. Write the findings up as one self-contained HTML page.\n" +
        "3. Turn the same findings into a slide outline.\n" +
        "4. Leave the final read-through to a person.",
      workspaceId: "general",
      steps: [
        { id: "s1", engine: "lookup", action: "research", title: "Research what shipped" },
        { id: "s2", engine: "process", action: "custom", title: "Write the HTML page" },
        { id: "s3", engine: "process", action: "deck", title: "Slide outline" },
        { id: "s4", engine: "review", action: "review", title: "Read it through" },
      ],
      updatedAt: nowIso(),
    },
  ];
  // The live chat stream handler, so runChat below can narrate a flow run.
  let chatStreamHandler:
    | ((event: import("../../shared/office-api").ChatStreamEvent) => void)
    | null = null;
  let account: import("../../shared/office-api").AccountSnapshot = {
    signedIn: false,
    email: null,
    accountId: null,
    signedInAt: null,
    backupEnabled: false,
    backupConsentedAt: null,
  };
  let memories: import("../../shared/office-api").MemoryView[] = [];
  let chatSessions: Array<{
    id: string;
    title: string;
    messages: unknown[];
    createdAt: string;
    updatedAt: string;
    pinned: boolean;
    titleLocked: boolean;
  }> = [
    {
      id: "general",
      title: "general",
      messages: [
        {
          id: "m1",
          kind: "chat",
          role: "assistant",
          content: "Welcome to the workspace. How can I help you today?",
          at: nowIso(),
        },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      pinned: true,
      titleLocked: false,
    },
    {
      id: "channel-project-launch",
      title: "project-launch",
      messages: [
        {
          id: "m2",
          kind: "chat",
          role: "assistant",
          content: "Project launch channels initialized.",
          at: nowIso(),
        },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      pinned: false,
      titleLocked: false,
    },
    {
      id: "dm-designer",
      title: "Devon Miller",
      messages: [
        {
          id: "m3",
          kind: "chat",
          role: "assistant",
          content: "Hey, let me know if you need any Figma tokens exported.",
          at: nowIso(),
        },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      pinned: false,
      titleLocked: false,
    },
    {
      id: "dm-engineer",
      title: "Alex Rivera",
      messages: [
        {
          id: "m4",
          kind: "chat",
          role: "assistant",
          content: "React components and API integration ready to review.",
          at: nowIso(),
        },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      pinned: false,
      titleLocked: false,
    },
  ];
  let deskProfile: import("../../shared/office-api").DeskProfileView = {
    displayName: "",
    jobTitle: "",
    signature: "",
    company: {
      name: "",
      about: "",
      benefits: "",
      workConditions: "",
      applicationProcess: "",
    },
  };

  function parseMockMemoryLines(text: string, fileName?: string): string[] {
    return fileName?.toLowerCase().endsWith(".md") ||
      text.includes("# ") ||
      /^[-*]\s/m.test(text)
      ? text
          .split(/\r?\n/)
          .map((line) =>
            line
              .replace(/^#+\s+/, "")
              .replace(/^[-*+]\s+/, "")
              .trim(),
          )
          .filter((line) => line.length > 0)
      : text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
  }

  function applyMockMemoryImport(lines: string[]): {
    imported: number;
    skipped: number;
  } {
    let imported = 0;
    let skipped = 0;
    const now = nowIso();
    for (const body of lines) {
      if (
        memories.some((item) => item.body.toLowerCase() === body.toLowerCase())
      ) {
        skipped += 1;
        continue;
      }
      memories = [
        {
          id: `mem_mock_imp_${memories.length + 1}`,
          body,
          source: "import",
          createdAt: now,
          updatedAt: now,
        },
        ...memories,
      ];
      imported += 1;
    }
    return { imported, skipped };
  }

  const setup: SetupSnapshot = {
    state: {
      completedAt: nowIso(),
      mode: "local",
      packTier: "T4",
      gpuPreference: "auto",
      downloadedRoles: ["text"],
      remote: null,
      inferenceRoute: "auto",
      chatQualityMode: "flash",
      webSearchEnabled: true,
      llmProviders: {},
    },
    freeBytes: 64 * 1024 ** 3,
    freeLabel: "64 GB",
    mount: "C:",
    plan: {
      tier: "T4",
      grade: "flash",
      roles: [
        {
          role: "text",
          label: "Text",
          description: "Lookup / process / review",
          approxBytes: 1_800_000_000,
        },
      ],
      minimalBytes: 1_800_000_000,
      fullBytes: 6_000_000_000,
    },
    planMinimalLabel: "1.8 GB",
    planFullLabel: "6 GB",
    canFitMinimal: true,
    canFitFull: true,
    modelsDir: "(browser mock)",
    presentRoles: ["text"],
    gradeWeightsPresent: true,
    gradeFitsVram: true,
    vramLabel: "8 GB",
    gradeVramLabel: "8 GB",
  };

  const device: DeviceProfile = {
    tier: "T4",
    totalRamMb: 16384,
    freeRamMb: 8192,
    cpuModel: "Browser mock CPU",
    cpuCores: 8,
    cpuTempC: 42,
    gpu: null,
    hasUnifiedMemory: false,
    platform: "win32",
  };

  return {
    getAppVersion: async () => "0.0.1-web",
    getPlatform: () => "win32",
    getDeviceProfile: async () => device,
    getLocalCapability: async () => ({
      grade: "flash" as const,
      runnable: true,
      shortfalls: [],
      cloudConfigured: false,
    }),
    getExecutionPlan: async () => ({
      backend: "cpu" as const,
      modelId: "qwen35-4b-q4",
      modelPath: "",
      gpuLayers: 0 as const,
      threads: 4,
      contextSize: 4096,
      batchSize: 128,
      kvCacheType: "q8_0" as const,
      reason: "browser mock",
      isolation: "inProcess" as const,
    }),
    getTierModels: async () => ({
      text: "qwen35-4b-q4",
      embed: "qwen3-embedding-0.6b",
      rerank: "qwen3-reranker-0.6b",
    }),
    getWorkspaces: async () => WORKSPACES,
    listFindings: async () => [],
    listDocuments: async () => [],
    listRubricChoices: async () => [
      "recruiting/candidate-6axis",
      ...mockRubrics,
    ],
    correctField: async () => ({ ok: true }),
    acceptField: async () => ({ ok: true }),
    extractText: async () => {
      throw new Error("Browser mock: extract runs only inside Electron Desk.");
    },
    pickIntakeFolder: async () => null,
    runIntakeBatch: async (): Promise<IntakeBatchResult> => ({
      runId: "mock",
      schemaId: "recruiting/resume",
      queued: 0,
      processed: 0,
      errors: 0,
      items: [],
    }),
    runRecruitingPipeline: async () => {
      throw new Error("Electron Desk only");
    },
    cancelWork: async () => false,
    compareStructured: async () => {
      throw new Error("Browser mock: compare runs only inside Electron Desk.");
    },
    runAssess: async () => {
      throw new Error("Browser mock: assess runs only inside Electron Desk.");
    },
    runScreenRank: async () => {
      throw new Error(
        "Browser mock: screen rank runs only inside Electron Desk.",
      );
    },
    runVerify: async () => {
      throw new Error("Browser mock: verify runs only inside Electron Desk.");
    },
    runPublish: async () => {
      throw new Error("Browser mock: publish runs only inside Electron Desk.");
    },
    draftJd: async (input) => {
      const roleTitle = input.roleTitle.trim();
      const responsibilities = input.responsibilities.trim();
      const qualifications = input.qualifications.trim();
      if (roleTitle.length < 2) throw new Error("ERR_JD_TITLE_SHORT");
      const placeholder =
        /^(몰라|모름|알아서|대충|아무거나|개발해야겠지|todo|tbd|n\/?a|없음|xxx+|asdf+|test|테스트)$/i;
      const isPlaceholder = (text: string) => {
        const compact = text.replace(/\s+/g, " ").trim();
        if (!compact) return true;
        if (placeholder.test(compact)) return true;
        const lines = compact
          .split(/\n/)
          .map((l) => l.replace(/^[-•*]\s*/, "").trim());
        return (
          lines.length > 0 && lines.every((line) => placeholder.test(line))
        );
      };
      if (
        isPlaceholder(roleTitle) ||
        isPlaceholder(responsibilities) ||
        isPlaceholder(qualifications)
      ) {
        throw new Error("ERR_JD_FACTS_PLACEHOLDER");
      }
      const locale = input.locale?.toLowerCase().startsWith("ko") ? "ko" : "en";
      const titles =
        locale === "ko"
          ? {
              responsibilities: "주요 업무",
              qualifications: "자격 요건",
              location: "근무지",
            }
          : {
              responsibilities: "Responsibilities",
              qualifications: "Qualifications",
              location: "Location",
            };
      const parts = [
        `# ${roleTitle}`,
        "",
        `## ${titles.responsibilities}`,
        responsibilities.trim(),
        "",
        `## ${titles.qualifications}`,
        qualifications.trim(),
      ];
      if (input.location?.trim()) {
        parts.push("", `## ${titles.location}`, input.location.trim());
      }
      const markdown = `${parts.join("\n")}\n`;
      return {
        templateId: "recruiting/jd",
        path: "(browser) recruiting-jd.md",
        markdown,
        source: "template" as const,
        unfilled: [],
        timingMs: 1,
        warnings: ["ERR_JD_MODEL_FALLBACK"],
      };
    },
    draftDecisionEmail: async (input) => {
      const name = "지원자";
      const subject =
        input.decision === "pass"
          ? `[합격] ${input.roleTitle || "채용"} 전형 안내`
          : `[결과] ${input.roleTitle || "채용"} 지원 결과 안내`;
      const body =
        input.decision === "pass"
          ? `${name}님, 다음 단계로 모시고자 합니다.`
          : `${name}님, 이번 전형에서는 함께하지 못하게 되었습니다.`;
      return {
        templateId: "recruiting/decision-email",
        path: "(browser) decision-email",
        unfilled: [],
        timingMs: 1,
        preview: { subject, body },
      };
    },
    generate: async () => {
      throw new Error("Browser mock: generate runs only inside Electron Desk.");
    },
    generateRubric: async (input) => {
      const workspace = input.workspaceId ?? "recruiting";
      const raw = (input.slug?.trim() || "from-jd")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      const id = `${workspace}/${raw || "from-jd"}`;
      mockRubrics = Array.from(new Set([...mockRubrics, id])).sort();
      return {
        rubric: {
          id,
          version: 1,
          axes: [
            {
              id: "fit",
              label: "Fit",
              range: [0, 5] as [number, number],
              guidance: "Overall fit from the JD (browser mock).",
            },
          ],
        },
        path: `(browser) ${id}`,
        source: "jd-draft" as const,
      };
    },
    listRubrics: async () => [...mockRubrics],
    listArtifacts: async (kind) => {
      const items = [...mockArtifacts.values()].map(
        ({ body: _body, absolutePath: _path, revision: _rev, ...meta }) => meta,
      );
      return items
        .filter((item) => (kind ? item.kind === kind : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    getArtifact: async (id) => mockArtifacts.get(id) ?? null,
    createArtifact: async (input) => {
      const id = `art_mock_${crypto.randomUUID().slice(0, 8)}`;
      const contentFile = `content.${input.format ?? "md"}`;
      const artifact: ArtifactView = {
        id,
        kind: input.kind ?? "other",
        title: input.title,
        createdAt: nowIso(),
        contentFile,
        encoding: "utf8" as const,
        source: "model" as const,
        body: input.body,
        absolutePath: `/mock/artifacts/${id}/${contentFile}`,
        revision: nowIso(),
      };
      mockArtifacts.set(id, artifact);
      return artifact;
    },
    updateArtifact: async (input) => {
      const current = mockArtifacts.get(input.id);
      const artifact: ArtifactView = {
        id: input.id,
        kind: current?.kind ?? "other",
        title: input.title ?? current?.title ?? "Untitled",
        createdAt: current?.createdAt ?? nowIso(),
        contentFile: current?.contentFile ?? "content.md",
        encoding: "utf8" as const,
        body: input.body,
        absolutePath:
          current?.absolutePath ?? `/mock/artifacts/${input.id}/content.md`,
        revision: nowIso(),
      };
      mockArtifacts.set(input.id, artifact);
      return artifact;
    },
    updateSpreadsheetArtifact: async (input) => {
      const current = mockArtifacts.get(input.id);
      if (!current) throw new Error(`Artifact not found: ${input.id}`);
      const sheets = mockXlsxSheets.get(input.id) ?? [blankMockSheet()];
      const sheet = sheets.find((item) => item.name === input.sheet);
      if (!sheet) throw new Error(`Sheet not found: ${input.sheet}`);
      for (const change of input.changes) {
        ensureSheetSize(sheet, change.row, change.column);
        sheet.rows[change.row - 1]!.cells[change.column - 1] = {
          text: change.value,
        };
      }
      mockXlsxSheets.set(input.id, sheets);
      const artifact: ArtifactView = {
        ...current,
        revision: nowIso(),
      };
      mockArtifacts.set(input.id, artifact);
      return artifact;
    },
    createDocument: async (input) => {
      const id = `art_new_${crypto.randomUUID().slice(0, 8)}`;
      const format = input.format;
      const title = input.title?.trim() || `Untitled ${format}`;
      if (format === "md") {
        const artifact: ArtifactView = {
          id,
          kind: "other" as const,
          title,
          createdAt: nowIso(),
          contentFile: "content.md",
          encoding: "utf8" as const,
          source: "template" as const,
          body: `# ${title}\n\n`,
          absolutePath: `/mock/artifacts/${id}/content.md`,
          revision: nowIso(),
        };
        mockArtifacts.set(id, artifact);
        return artifact;
      }
      const contentFile =
        format === "docx"
          ? "document.docx"
          : format === "xlsx"
            ? "workbook.xlsx"
            : "presentation.pptx";
      const artifact: ArtifactView = {
        id,
        kind: "other" as const,
        title,
        createdAt: nowIso(),
        contentFile,
        encoding: "binary" as const,
        source: "template" as const,
        body: "",
        absolutePath: `/mock/artifacts/${id}/${contentFile}`,
        revision: nowIso(),
      };
      mockArtifacts.set(id, artifact);
      if (format === "xlsx") {
        mockXlsxSheets.set(id, [blankMockSheet()]);
      }
      return artifact;
    },
    deleteArtifact: async (id) => {
      mockXlsxSheets.delete(id);
      return mockArtifacts.delete(id);
    },
    revealArtifactsFolder: async () => {
      throw new Error(
        "Browser mock: artifact folder opens only inside Electron Desk.",
      );
    },
    importDocument: async () => {
      throw new Error("Browser mock: opening files needs the desktop app.");
    },
    docRenderModel: async (path) => {
      const match = [...mockArtifacts.values()].find(
        (item) => item.absolutePath === path,
      );
      if (match && mockXlsxSheets.has(match.id)) {
        const sheets = mockXlsxSheets.get(match.id)!;
        return mockXlsxModel(sheets.map((sheet) => ({
          ...sheet,
          rows: sheet.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({ ...cell })),
          })),
          columnWidths: [...sheet.columnWidths],
          charts: [...sheet.charts],
        })));
      }
      const lower = path.toLowerCase();
      if (lower.endsWith(".xlsx")) {
        return mockXlsxModel([blankMockSheet()]);
      }
      if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
        return {
          kind: "md" as const,
          text: match?.body ?? "# Preview\n\nBrowser mock document.",
        };
      }
      if (lower.endsWith(".docx")) {
        return { kind: "docx" as const, base64: "" };
      }
      if (lower.endsWith(".pptx")) {
        return {
          kind: "pptx" as const,
          slides: [{ title: match?.title ?? "Slide", body: [] }],
          widthEmu: 9144000,
          heightEmu: 6858000,
        };
      }
      return {
        kind: "md" as const,
        text: "# Preview\n\nBrowser mock: open the desktop app to render documents.",
      };
    },
    exportDocumentPdf: async () => null,
    duplicateDocument: async () => {
      throw new Error(
        "Browser mock: duplicating a document needs the desktop app.",
      );
    },
    openDocumentExternally: async () => false,
    servePageLocally: async () => {
      throw new Error("Browser mock: serving a page needs the desktop app.");
    },
    watchDocument: async () => false,
    unwatchDocument: async () => false,
    onDocReloaded: () => () => undefined,
    onLocalDataWiped: () => () => undefined,
    listWorkflows: async () => [...mockWorkflows],
    saveWorkflow: async (input) => {
      const id = `${input.workspaceId}/${input.slug?.trim() || "custom"}`;
      const workflow = {
        id,
        version: 1,
        title: input.title,
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        ...(input.instructions?.trim() ? { instructions: input.instructions.trim() } : {}),
        workspaceId: input.workspaceId,
        steps: input.steps.map((step, index) => ({
          id: `step-${index + 1}`,
          ...step,
        })),
        ...(input.trigger && input.trigger.type !== "manual"
          ? { trigger: input.trigger }
          : {}),
        updatedAt: nowIso(),
      };
      mockWorkflows = [
        workflow,
        ...mockWorkflows.filter((item) => item.id !== id),
      ];
      return { workflow, path: `(browser) ${id}` };
    },
    // Nothing schedules anything in a browser tab; an empty list is the truth.
    workflowTriggerStatus: async () => [],
    exportSkill: async () => ({
      ok: false as const,
      error: "Browser mock: export skill only works inside Electron Desk.",
    }),
    importSkill: async () => ({
      ok: false as const,
      error: "Browser mock: import skill only works inside Electron Desk.",
    }),
    openExternal: async (url) => {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    },
    webSearch: async (input) => ({
      query: input.query,
      engine: "duckduckgo" as const,
      searchedAt: nowIso(),
      blocked: false,
      results: [
        {
          title: `Mock result for “${input.query}”`,
          url: `https://example.com/search?q=${encodeURIComponent(input.query)}`,
          snippet:
            "Browser mock — real DuckDuckGo search runs inside Electron Desk.",
        },
      ],
      contextBlock: [
        "<<<UNTRUSTED_WEB_RESULTS>>>",
        `Query: ${input.query}`,
        "1. Mock result",
        "<<<END_UNTRUSTED_WEB_RESULTS>>>",
      ].join("\n"),
    }),
    closeWebSearch: async () => true,
    showWebSearch: async () => false,
    fetchPage: async (input) => ({
      url: input.url,
      title: "Mock page",
      text: "Browser mock page body for desk-bridge.",
      fetchedAt: nowIso(),
      contextBlock: `<<<UNTRUSTED_WEB_PAGE>>>\nURL: ${input.url}\n<<<END_UNTRUSTED_WEB_PAGE>>>`,
    }),
    pickChatAttachments: async () => [
      {
        id: "mock-attach",
        name: "notes.md",
        text: "# Mock attachment\n\nSample notes for chat.",
        truncated: false,
        charCount: 40,
      },
    ],
    attachFiles: async (files) =>
      files.map((file, index) => ({
        id: `mock-drop-${index}`,
        name: file.name,
        text: file.type?.startsWith("image/")
          ? ""
          : new TextDecoder().decode(file.bytes).slice(0, 200),
        truncated: false,
        charCount: file.bytes.byteLength,
        ...(file.type?.startsWith("image/")
          ? { image: { path: `/mock/${file.name}`, mime: file.type } }
          : {}),
      })),
    fillCompanyFromWebsite: async (url) => ({
      profile: {
        name: "Mock Co",
        about: "Mock about from website",
        benefits: "",
        workConditions: "",
        applicationProcess: "",
      },
      sourceUrl: url,
      title: "Mock",
      timingMs: 12,
    }),
    getDefaultWorkflowDraft: async (
      workspaceId = "recruiting",
      locale = "ko",
    ) => ({
      workspaceId,
      title:
        locale === "en" ? "Default hiring workflow" : "채용 기본 워크플로우",
      slug: "default-hiring",
      steps: [
        {
          engine: "process" as const,
          action: "jd",
          title: locale === "en" ? "Draft JD" : "JD 생성",
          registryId: "recruiting/jd",
        },
        {
          engine: "process" as const,
          action: "rubric",
          title: locale === "en" ? "Scoring rubric" : "평가 루브릭",
        },
        {
          engine: "lookup" as const,
          action: "intake",
          title: locale === "en" ? "Batch intake" : "대량 접수",
          registryId: "recruiting/resume",
        },
        {
          engine: "process" as const,
          action: "assess",
          title: locale === "en" ? "Score candidates" : "지원자 채점",
        },
        {
          engine: "review" as const,
          action: "verify",
          title: locale === "en" ? "Forgery check" : "위조 여부 조회",
        },
        {
          engine: "process" as const,
          action: "email",
          title: locale === "en" ? "Pass / reject email" : "합격·탈락 메일",
        },
      ],
    }),
    /** Mirrors the general presets the main process ships, so the browser preview matches. */
    listWorkflowPresets: async (workspaceId = "general", locale = "ko") => {
      if (workspaceId !== "general") return [];
      const en = locale === "en";
      return [
        {
          workspaceId,
          title: en ? "Research → deck" : "리서치 → 덱",
          slug: "research-deck",
          description: en
            ? "Look a subject up, then turn what you found into a slide outline."
            : "주제를 조사해 슬라이드 아웃라인까지 만듭니다.",
          steps: [
            {
              engine: "lookup" as const,
              action: "research",
              title: en ? "Look the subject up" : "주제 조사",
            },
            {
              engine: "process" as const,
              action: "deck",
              title: en ? "Slide outline" : "슬라이드 아웃라인",
              registryId: "marketing/deck-outline",
            },
          ],
        },
        {
          workspaceId,
          title: en ? "Research → web page" : "리서치 → 웹페이지",
          slug: "research-page",
          description: en
            ? "Turn what you found into a single HTML page that opens in a browser."
            : "조사한 내용을 브라우저에서 바로 열리는 HTML 한 장으로 만듭니다.",
          steps: [
            {
              engine: "lookup" as const,
              action: "research",
              title: en ? "Look the subject up" : "주제 조사",
            },
            {
              engine: "process" as const,
              action: "custom",
              title: en ? "Write the HTML page" : "HTML 페이지 작성",
            },
          ],
        },
        {
          workspaceId,
          title: en ? "Notes → document" : "메모 → 문서",
          slug: "notes-document",
          description: en
            ? "Turn loose notes into a document someone else can read."
            : "흩어진 메모를 남에게 보낼 수 있는 문서로 정리합니다.",
          steps: [
            {
              engine: "process" as const,
              action: "memo",
              title: en ? "Draft it" : "초안 작성",
              registryId: "legal/memo",
            },
            {
              engine: "process" as const,
              action: "documentEdit",
              title: en ? "Edit the draft" : "문서 다듬기",
            },
          ],
        },
      ];
    },
    getTelemetryPreview: async () => [],
    getTelemetryOptIn: async () => telemetryOptIn,
    setTelemetryOptIn: async (optedIn) => {
      telemetryOptIn = optedIn;
      return telemetryOptIn;
    },
    getMeasurements: async () => [],
    wipeLocalData: async () => ({
      ok: true as const,
      documents: 0,
      fields: 0,
      corrections: 0,
      findings: 0,
      runs: 0,
      chats: 0,
      floorMessages: 0,
      artifacts: 0,
    }),
    revealLogsFolder: async () => {
      throw new Error(
        "Browser mock: the logs folder opens only inside Electron Desk.",
      );
    },
    getUpdateStatus: async () => null,
    checkForUpdates: async () => ({
      kind: "current" as const,
      version: "0.0.1",
    }),
    installUpdate: async () => false,
    onUpdateStatus: () => () => undefined,
    getSetupSnapshot: async () => {
      const snap = structuredClone(setup);
      // `sessionStorage redrob.forceBetaGate=1` reopens the first-run key screen in dev:web.
      if (forceBetaGateEnabled()) {
        snap.state.completedAt = null;
        snap.state.llmProviders = {};
        snap.presentRoles = [];
        snap.gradeWeightsPresent = false;
      }
      return snap;
    },
    applySetup: async (decision) => {
      setup.state.mode = decision.mode;
      setup.state.packTier = decision.packTier;
      setup.state.completedAt = nowIso();
      if (decision.rolesToDownload.includes("text")) {
        setup.state.downloadedRoles = ["text"];
        setup.presentRoles = ["text"];
        setup.gradeWeightsPresent = true;
      }
      return structuredClone(setup.state);
    },
    downloadGradeWeights: async () => structuredClone(setup),
    onSetupProgress: () => () => undefined,
    onWorkProgress: () => () => undefined,
    onSlotStream: () => () => undefined,
    onIntakeProgress: () => () => undefined,
    onRecruitingPipelineProgress: () => () => undefined,
    onChatStream: (listener) => {
      chatStreamHandler = listener;
      return () => {
        if (chatStreamHandler === listener) chatStreamHandler = null;
      };
    },
    runChat: async (input) => {
      const sessionId = input.sessionId ?? "mock";
      const emit = (
        event: import("../../shared/office-api").ChatStreamEvent,
      ): void => chatStreamHandler?.(event);
      const wait = (ms: number): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const ask =
        input.messages[input.messages.length - 1]?.content.toLowerCase() ?? "";
      // Only narrate a flow run when the turn looks like one, so ordinary mock
      // chat stays a one-liner.
      if (/flow|skill|roundup|run my|워크플로|플로우|스킬/.test(ask)) {
        const step = (
          name: string,
          present: string,
          past: string,
          status: "start" | "done",
          extra: { ok?: boolean; nested?: boolean } = {},
        ): void =>
          emit({
            kind: "step",
            sessionId,
            name,
            present,
            past,
            status,
            label: status === "start" ? present : past,
            ...extra,
          });

        step(
          "workflow.search",
          "Searching your skills for “competitor roundup”",
          "Searched your skills for “competitor roundup”",
          "start",
        );
        await wait(500);
        step(
          "workflow.search",
          "Searching your skills for “competitor roundup”",
          "Searched your skills for “competitor roundup”",
          "done",
          { ok: true },
        );
        step(
          "workflow.execute",
          "Running your skill “Competitor roundup”",
          "Ran your skill “Competitor roundup”",
          "start",
        );
        for (const line of [
          "Competitor roundup — research (1/3)",
          "Competitor roundup — custom (2/3)",
          "Competitor roundup — deck (3/3)",
        ]) {
          await wait(600);
          step("workflow.progress", line, line, "start", { nested: true });
        }
        await wait(600);
        step(
          "workflow.execute",
          "Running your skill “Competitor roundup”",
          "Ran your skill “Competitor roundup”",
          "done",
          { ok: true },
        );
        const reply =
          "Ran **Competitor roundup**. Researched what shipped, wrote it up as " +
          "an HTML page, and turned the same findings into a slide outline. I " +
          "left the **read-through** for you — that step is by hand.";
        for (const chunk of reply.match(/.{1,24}/g) ?? [reply]) {
          await wait(120);
          emit({ kind: "chunk", sessionId, text: chunk });
        }
        return { text: reply, timingMs: 4200, modelId: "mock" };
      }
      const reply = "Mock reply (Electron only for the real model).";
      emit({ kind: "chunk", sessionId, text: reply });
      return { text: reply, timingMs: 12, modelId: "mock" };
    },
    runTask: async () => {
      throw new Error("Computer use requires Electron Desk");
    },
    abortTask: async () => false,
    readLocalMedia: async () => null,
    resolveTaskApproval: async () => true,
    onTaskApprovalRequest: () => () => undefined,
    onTaskMedia: () => () => undefined,
    onTaskArtifact: () => () => undefined,
    getAllowedPaths: async () => [],
    addAllowedPath: async () => [],
    removeAllowedPath: async () => [],
    pickAllowedFolder: async () => null,
    getComputerUseSettings: async () => ({
      allowedPaths: [],
      profile: "full" as const,
      execSecurity: "full" as const,
      execAsk: "off" as const,
      execAllowlist: [],
      sandboxMode: "workspace" as const,
      elevatedEnabled: false,
      readerPass: false,
      desktopControl: false,
      backgroundControl: false,
      browserTarget: "app" as const,
    }),
    desktopControlStatus: async () => ({
      state: "unsupported" as const,
      backend: null,
      reason: "The browser preview cannot drive a desktop.",
      accelerator: "CommandOrControl+Alt+Escape",
    }),
    desktopStopNow: async () => true,
    desktopResume: async () => true,
    updateComputerUseSettings: async (patch) => ({
      allowedPaths: [],
      profile: "full" as const,
      execSecurity: "full" as const,
      execAsk: "off" as const,
      execAllowlist: [],
      sandboxMode: "workspace" as const,
      elevatedEnabled: false,
      readerPass: false,
      desktopControl: false,
      backgroundControl: false,
      browserTarget: "app" as const,
      ...patch,
    }),
    listToolAudit: async () => [],
    ...(() => {
      const floorApi = createMockFloorApi();
      return {
        ...floorApi,
        floorDeleteChannel: async (id: string) => {
          const result = await floorApi.floorDeleteChannel(id);
          if (result.ok) {
            chatSessions = chatSessions.filter(
              (session) => !sessionBelongsToChannel(session.id, id),
            );
          }
          return result;
        },
      };
    })(),
    listMemories: async () => structuredClone(memories),
    addMemory: async (body) => {
      const now = nowIso();
      const item = {
        id: `mem_mock_${memories.length + 1}`,
        body: body.trim(),
        source: "manual" as const,
        createdAt: now,
        updatedAt: now,
      };
      memories = [item, ...memories];
      return structuredClone(item);
    },
    updateMemory: async (id, body) => {
      const index = memories.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("Memory not found");
      const next = {
        ...memories[index]!,
        body: body.trim(),
        updatedAt: nowIso(),
      };
      memories = [
        ...memories.slice(0, index),
        next,
        ...memories.slice(index + 1),
      ];
      return structuredClone(next);
    },
    deleteMemory: async (id) => {
      const before = memories.length;
      memories = memories.filter((item) => item.id !== id);
      return memories.length < before;
    },
    importMemories: async (text, fileName) => {
      const lines = parseMockMemoryLines(text, fileName);
      const { imported, skipped } = applyMockMemoryImport(lines);
      return { imported, skipped };
    },
    importMemoriesFromFile: async () => {
      const fileName = "sample-memory.md";
      const text =
        "# Preferences\n\n- Prefer concise Korean replies\n- Company is Acme\n";
      const lines = parseMockMemoryLines(text, fileName);
      const { imported, skipped } = applyMockMemoryImport(lines);
      return { fileName, imported, skipped };
    },
    listChatSessions: async () =>
      chatSessions
        .map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
          pinned: s.pinned,
          titleLocked: s.titleLocked,
        }))
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.updatedAt.localeCompare(a.updatedAt);
        }),
    getChatSession: async (id) => {
      const found = chatSessions.find((s) => s.id === id);
      if (!found) return null;
      return structuredClone({
        id: found.id,
        title: found.title,
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
        messageCount: found.messages.length,
        pinned: found.pinned,
        titleLocked: found.titleLocked,
        messages: found.messages,
      });
    },
    saveChatSession: async (input) => {
      const now = nowIso();
      const messages = Array.isArray(input.messages) ? input.messages : [];
      const title = (input.title ?? "").trim();
      const existing = chatSessions.findIndex((s) => s.id === input.id);
      if (existing >= 0) {
        const prev = chatSessions[existing]!;
        const nextTitle = prev.titleLocked ? prev.title : title || prev.title;
        chatSessions[existing] = {
          ...prev,
          title: nextTitle,
          messages,
          updatedAt: now,
        };
        return {
          id: input.id,
          title: nextTitle,
          createdAt: prev.createdAt,
          updatedAt: now,
          messageCount: messages.length,
          pinned: prev.pinned,
          titleLocked: prev.titleLocked,
        };
      }
      chatSessions.unshift({
        id: input.id,
        title,
        messages,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        titleLocked: false,
      });
      return {
        id: input.id,
        title,
        createdAt: now,
        updatedAt: now,
        messageCount: messages.length,
        pinned: false,
        titleLocked: false,
      };
    },
    renameChatSession: async (id, title) => {
      const index = chatSessions.findIndex((s) => s.id === id);
      if (index < 0) throw new Error("Chat session not found");
      const next = title.replace(/\s+/g, " ").trim();
      if (!next) throw new Error("Chat title is empty");
      const now = nowIso();
      const prev = chatSessions[index]!;
      chatSessions[index] = {
        ...prev,
        title: next,
        titleLocked: true,
        updatedAt: now,
      };
      return {
        id,
        title: next,
        createdAt: prev.createdAt,
        updatedAt: now,
        messageCount: prev.messages.length,
        pinned: prev.pinned,
        titleLocked: true,
      };
    },
    autotitleChatSession: async (id, title) => {
      const index = chatSessions.findIndex((s) => s.id === id);
      if (index < 0) return null;
      const prev = chatSessions[index]!;
      if (prev.titleLocked) {
        return {
          id,
          title: prev.title,
          createdAt: prev.createdAt,
          updatedAt: prev.updatedAt,
          messageCount: prev.messages.length,
          pinned: prev.pinned,
          titleLocked: true,
        };
      }
      const next = title.replace(/\s+/g, " ").trim();
      const now = nowIso();
      if (next) {
        chatSessions[index] = { ...prev, title: next, updatedAt: now };
      }
      return {
        id,
        title: next || prev.title,
        createdAt: prev.createdAt,
        updatedAt: now,
        messageCount: prev.messages.length,
        pinned: prev.pinned,
        titleLocked: false,
      };
    },
    setChatSessionPinned: async (id, pinned) => {
      const index = chatSessions.findIndex((s) => s.id === id);
      if (index < 0) throw new Error("Chat session not found");
      const prev = chatSessions[index]!;
      chatSessions[index] = { ...prev, pinned };
      return {
        id,
        title: prev.title,
        createdAt: prev.createdAt,
        updatedAt: prev.updatedAt,
        messageCount: prev.messages.length,
        pinned,
        titleLocked: prev.titleLocked,
      };
    },
    deleteChatSession: async (id) => {
      const before = chatSessions.length;
      chatSessions = chatSessions.filter((s) => s.id !== id);
      return chatSessions.length < before;
    },
    getTemplateSlots: async () => [
      { id: "a", description: "Slot A", required: true },
      { id: "b", description: "Slot B", required: false },
    ],
    draftFromTemplate: async () => ({
      templateId: "mock",
      markdown: "# Mock\n",
      source: "template" as const,
      unfilled: [],
      timingMs: 5,
    }),
    pickDocumentFile: async () => null,
    openDocumentForEdit: async () => ({
      path: "/mock/doc.hwpx",
      fileName: "doc.hwpx",
      parsed: {
        fileType: "hwpx",
        markdown: "# Mock document\n",
        formFields: [{ label: "성명", value: "" }],
      },
    }),
    savePatchedDocument: async () => ({
      artifactId: "mock-artifact",
      contentFile: "doc-edited.hwpx",
      applied: 1,
      skippedReasons: [],
      timingMs: 8,
      markdown: "# Mock document\n",
    }),
    fillOpenedForm: async () => ({
      artifactId: "mock-artifact",
      contentFile: "doc-filled.hwpx",
      filledLabels: ["성명"],
      unmatchedLabels: [],
      timingMs: 8,
    }),
    saveRemoteCredentials: async () => ({
      mode: setup.state.mode,
      baseUrl: "",
    }),
    saveGpuPreference: async (preference) => {
      setup.state.gpuPreference = preference;
      return structuredClone(setup);
    },
    saveLlmSettings: async (input) => {
      if (input.inferenceRoute)
        setup.state.inferenceRoute = input.inferenceRoute;
      else if (input.chatRoute) setup.state.inferenceRoute = input.chatRoute;
      if (input.chatQualityMode)
        setup.state.chatQualityMode = input.chatQualityMode;
      if (typeof input.webSearchEnabled === "boolean") {
        setup.state.webSearchEnabled = input.webSearchEnabled;
      }
      if (input.llmProviders) {
        setup.state.llmProviders = {
          ...setup.state.llmProviders,
          ...input.llmProviders,
        };
      }
      return structuredClone(setup);
    },
    getAccountSnapshot: async () => structuredClone(account),
    signInForBackup: async (email) => {
      const normalized = email.trim().toLowerCase();
      if (!normalized.includes("@"))
        throw new Error("Enter a valid email address");
      account = {
        signedIn: true,
        email: normalized,
        accountId: account.accountId ?? "mock-account",
        signedInAt: nowIso(),
        backupEnabled: account.backupEnabled,
        backupConsentedAt: account.backupConsentedAt,
      };
      return structuredClone(account);
    },
    signOutAccount: async () => {
      account = {
        signedIn: false,
        email: null,
        accountId: account.accountId,
        signedInAt: null,
        backupEnabled: false,
        backupConsentedAt: account.backupConsentedAt,
      };
      return structuredClone(account);
    },
    setBackupOptIn: async (enabled) => {
      if (!account.signedIn) throw new Error("Sign in before enabling backup");
      account = {
        ...account,
        backupEnabled: enabled,
        backupConsentedAt: enabled
          ? (account.backupConsentedAt ?? nowIso())
          : account.backupConsentedAt,
      };
      return structuredClone(account);
    },
    createLocalBackup: async () => {
      if (!account.signedIn || !account.email) {
        return {
          ok: false as const,
          error: "Sign in before creating a backup",
        };
      }
      return {
        ok: true as const,
        path: `~/Downloads/redrob-office-backup-mock.redrobbak`,
      };
    },
    restoreLocalBackup: async () => {
      if (!account.signedIn || !account.email) {
        return {
          ok: false as const,
          error: "Sign in before restoring a backup",
        };
      }
      return { ok: true as const };
    },
    getCompanyProfile: async () => structuredClone(deskProfile.company),
    saveCompanyProfile: async (profile) => {
      deskProfile = {
        ...deskProfile,
        company: {
          name: profile.name?.trim() ?? "",
          about: profile.about?.trim() ?? "",
          benefits: profile.benefits?.trim() ?? "",
          workConditions: profile.workConditions?.trim() ?? "",
          applicationProcess: profile.applicationProcess?.trim() ?? "",
        },
      };
      return structuredClone(deskProfile.company);
    },
    getDeskProfile: async () => structuredClone(deskProfile),
    saveDeskProfile: async (profile) => {
      deskProfile = {
        displayName: profile.displayName?.trim() ?? "",
        jobTitle: profile.jobTitle?.trim() ?? "",
        signature: profile.signature?.trim() ?? "",
        company: {
          name: profile.company?.name?.trim() ?? "",
          about: profile.company?.about?.trim() ?? "",
          benefits: profile.company?.benefits?.trim() ?? "",
          workConditions: profile.company?.workConditions?.trim() ?? "",
          applicationProcess: profile.company?.applicationProcess?.trim() ?? "",
        },
      };
      return structuredClone(deskProfile);
    },
    pickAudioFile: async () => null,
    recordAsrConsent: async (input) => ({
      id: `consent_mock_${crypto.randomUUID().slice(0, 8)}`,
      at: nowIso(),
      speakerKind: input.speakerKind,
    }),
    listAsrBatch: async () => [],
    startAsrBatchItem: async () => {
      throw new Error("Browser mock: ASR runs only inside Electron Desk.");
    },
    waitAsrBatchItem: async () => {
      throw new Error("Browser mock: ASR runs only inside Electron Desk.");
    },
    getRuntimeFallbackNotices: async () => [],
    getBackendStatus: async () => ({
      ready: false,
      recommendedId: null,
      detectionChain: "(browser mock)",
      activeId: null,
      binaryPath: null,
      installDir: "(browser mock)",
      options: [],
      overridePath: null,
    }),
    installBackend: async () => {
      throw new Error(
        "Browser mock: backend install runs only inside Electron Office.",
      );
    },
    removeBackend: async () => {
      throw new Error(
        "Browser mock: backend install runs only inside Electron Office.",
      );
    },
    onBackendInstallProgress: () => () => undefined,
    getEngineStatus: async () => ({
      available: true,
      source: "REDROB_CODE_BIN" as const,
    }),
    /**
     * The browser mock can show the flow but cannot run it: there is no main
     * process to hold the device code and no console to approve it. So it hands
     * back a code that is visibly a mock and then reports the console as
     * unreachable, which is true here, rather than pretending to connect.
     */
    startDeviceConnect: async () => ({
      id: "browser-mock",
      userCode: "MOCK-CODE",
      verificationUri: `${REDROB_CONSOLE_URL}/connect`,
      verificationUriComplete: `${REDROB_CONSOLE_URL}/connect?code=MOCK-CODE`,
      expiresAt: nowMs() + 600_000,
      intervalMs: 5_000,
    }),
    pollDeviceConnect: async () => ({ status: "unreachable" as const }),
    cancelDeviceConnect: async () => true,
    /**
     * No engine runs in the browser mock, so nothing here has been refused for
     * want of credit. Saying "not blocked" is the truth about this process, not a
     * claim about anybody's balance.
     */
    getCreditState: async () => ({
      blocked: false,
      refusedAt: null,
      detail: null,
    }),
    clearCreditBlock: async () => ({
      blocked: false,
      refusedAt: null,
      detail: null,
    }),
    getAsrSetupStatus: async () => ({
      modelsDir: "(browser mock)",
      binaryPath: null,
      binaryReady: false,
      smallModelPath: null,
      smallModelReady: false,
      turboModelPath: null,
      turboModelReady: false,
      recommendedTier: "small" as const,
      ready: false,
      platformSupported: false,
      cliAssetName: null,
    }),
    installAsrPack: async () => {
      throw new Error(
        "Browser mock: ASR install runs only inside Electron Desk.",
      );
    },
    onAsrInstallProgress: () => () => undefined,
    voiceTranscribePcm: async () => {
      throw new Error(
        "Browser mock: voice ASR runs only inside Electron Desk.",
      );
    },
    dayLogCapabilities: async () => ({
      cloudReady: false,
      localReady: false,
      localDisabledReason: null,
    }),
    getActiveDayLog: async () => null,
    startDayLog: async () => {
      throw new Error("Browser mock: day log runs only inside Electron Desk.");
    },
    stopDayLog: async () => {
      throw new Error("Browser mock: day log runs only inside Electron Desk.");
    },
    finalizeDayLog: async () => {
      throw new Error("Browser mock: day log runs only inside Electron Desk.");
    },
    listDayLogs: async () => [],
    listMcpServers: async () => [],
    addMcpServer: async (cfg) => ({
      id: cfg.id || "mock-mcp",
      name: cfg.name,
      enabled: cfg.enabled ?? true,
      transport: cfg.transport,
      status: "connected",
      tools: [],
    }),
    updateMcpServer: async (id, updates) => ({
      id,
      name: updates.name || "mock-mcp",
      enabled: updates.enabled ?? true,
      transport: updates.transport || "stdio",
      status: "connected",
      tools: [],
    }),
    removeMcpServer: async () => true,
    connectMcpServer: async (id) => ({
      id,
      name: "mock-mcp",
      enabled: true,
      transport: "stdio",
      status: "connected",
      tools: [],
    }),
    disconnectMcpServer: async (id) => ({
      id,
      name: "mock-mcp",
      enabled: false,
      transport: "stdio",
      status: "disconnected",
      tools: [],
    }),
    listMcpTools: async () => [],
  };
}

/** Install mock only when the Electron preload bridge is absent. */
export function ensureOfficeBridge(): "electron" | "mock" {
  if (typeof window !== "undefined" && window.office) {
    return "electron";
  }
  window.office = createMockOfficeApi();
  console.info(
    "[redrob] using browser mock office bridge (Cursor/web preview)",
  );
  return "mock";
}

/** @deprecated use ensureOfficeBridge */
export const ensureDeskBridge = ensureOfficeBridge;
